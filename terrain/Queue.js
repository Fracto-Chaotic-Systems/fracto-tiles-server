import path from "node:path";
import { Worker } from "node:worker_threads";
import { randomUUID, createHash } from "node:crypto";
import { MESH_DIRECTORY } from "../../../sdk/terrain/Paths.js";

const ACTIVE = ["queued", "running", "stopping"];
const snapshot = (job) => ({
  id: job.id,
  bailiwick_id: job.plan.bailiwick_id,
  status: job.status,
  level: job.plan.level,
  native_resolution: job.plan.native_resolution,
  total: job.total,
  missing: job.missing,
  processed: job.processed,
  created: job.created,
  reused: job.reused,
  failed: job.failed,
  short_code: job.short_code || null,
  preview_short_code: job.preview_short_code || null,
  result: job.result || null,
  error: job.error || null,
});

/** One queue shares the inventory owner across bailiwick tests and manual transforms. */
export function create_mesh_job_queue({
  source_identity,
  cache_root = MESH_DIRECTORY,
  inventory_store = null,
  create_worker = (workerData) =>
    new Worker(new URL("../../../sdk/terrain/Worker.js", import.meta.url), {
      workerData,
    }),
  timeout_ms = 10 * 60 * 1000,
} = {}) {
  const jobs = new Map(),
    queue = [];
  let active = false;
  const pump = () => {
    if (active || !queue.length) return;
    active = true;
    const job = queue.shift();
    job.status = "running";
    let worker,
      timer,
      finished = false,
      finish_promise;
    const finish = (error, result) => {
      if (finish_promise) return finish_promise;
      finished = true;
      clearTimeout(timer);
      finish_promise = (async () => {
        try {
          if (worker) await worker.terminate();
          await inventory_store?.recover_pending();
          if (job.plan.kind === "region" && inventory_store) {
            const saved = job.plan.tiles.filter((tile) =>
              inventory_store.inventory.has_ready(tile.short_code),
            ).length;
            job.created = Math.max(job.created, saved - job.reused);
            job.processed = Math.max(job.processed, saved + job.failed);
          }
        } catch (failure) {
          error = failure;
        }
        job.status = error ? "failed" : result.status;
        if (error)
          job.error =
            error.code === "MESH_CAPACITY"
              ? "Insufficient space for meshes"
              : "Terrain cache construction failed";
        else job.result = result;
        // Terminal records retain counters, not potentially hundreds of thousands of tile objects.
        job.plan = { ...job.plan, tiles: [] };
        delete job.stop;
        active = false;
        pump();
      })();
      return finish_promise;
    };
    job.stop = () => {
      job.status = "stopping";
      return finish(null, { status: "cancelled" });
    };
    try {
      worker = create_worker({
        plan: job.plan,
        source_identity,
        cache_root: path.resolve(cache_root),
        maintain_inventory: Boolean(inventory_store),
      });
      worker.on("message", (message) => {
        if (finished) return;
        if (message.inventory_request) {
          const request = message.inventory_request;
          const operation =
            request.action === "begin"
              ? () => inventory_store.begin(request.short_code)
              : request.action === "observe"
                ? () =>
                    inventory_store.observe(request.short_code, {
                      complete: true,
                    })
                : () =>
                    Promise.reject(new Error("Unknown inventory operation"));
          Promise.resolve()
            .then(operation)
            .then(
              () => {
                if (!finished)
                  worker.postMessage({
                    inventory_response: { id: request.id },
                  });
              },
              () => {
                if (!finished)
                  worker.postMessage({
                    inventory_response: { id: request.id, error: true },
                  });
              },
            );
        } else if (message.progress && !message.progress.warning) {
          if (message.progress.mesh_ready)
            job.preview_short_code = message.progress.short_code;
          const { processed, created, reused, failed, short_code } =
            message.progress;
          Object.assign(job, {
            processed,
            created,
            reused,
            failed,
            short_code,
          });
        } else if (message.error)
          finish(
            Object.assign(new Error(message.error), { code: message.code }),
          );
        else if (message.result) finish(null, message.result);
      });
      worker.on("error", finish);
      worker.on("exit", () => {
        if (!finished) finish(new Error("Worker exited early"));
      });
      timer = setTimeout(
        () => finish(new Error("Terrain cache job timed out")),
        timeout_ms,
      );
      timer.unref?.();
    } catch (error) {
      finish(error);
    }
  };
  return {
    enqueue(plan) {
      const identity = createHash("sha256")
        .update(JSON.stringify(plan))
        .digest("hex");
      for (const job of jobs.values())
        if (job.identity === identity && ACTIVE.includes(job.status))
          return snapshot(job);
      if (
        [...jobs.values()].filter((job) => ACTIVE.includes(job.status))
          .length >= 8
      )
        throw Object.assign(new Error("Terrain cache queue is full"), {
          status: 429,
        });
      while (jobs.size >= 50) {
        const oldest = [...jobs.values()].find(
          (job) => !ACTIVE.includes(job.status),
        );
        if (!oldest) break;
        jobs.delete(oldest.id);
      }
      const job = {
        id: randomUUID(),
        identity,
        plan,
        total: plan.tiles.length,
        missing: plan.missing_tiles.length,
        status: "queued",
        processed: 0,
        created: 0,
        reused: 0,
        failed: 0,
      };
      jobs.set(job.id, job);
      queue.push(job);
      pump();
      return snapshot(job);
    },
    get(id) {
      const job = jobs.get(id);
      return job ? snapshot(job) : null;
    },
    async cancel(id) {
      const job = jobs.get(id);
      if (!job) return null;
      if (job.status === "queued") {
        queue.splice(queue.indexOf(job), 1);
        job.status = "cancelled";
        job.plan = { ...job.plan, tiles: [] };
      } else if (job.stop) await job.stop();
      return snapshot(job);
    },
  };
}
