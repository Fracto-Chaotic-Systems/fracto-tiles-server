import path from "node:path";
import { Worker } from "node:worker_threads";
import { randomUUID, createHash } from "node:crypto";
import FractoIndexedTiles from "../../../sdk/FractoIndexedTiles.js";
import {
  terrain_region,
  terrain_level,
  plan_terrain_tiles,
} from "../../../sdk/terrain/Plan.js";
import { internal_service_headers } from "../../../utils/service_authorization.js";
import { MESH_DIRECTORY } from "../../../sdk/terrain/Paths.js";

const read_record = async (id, req) => {
  const response = await fetch(
    `http://127.0.0.1:${Number(process.env.FRACTO_DATA_PORT || 3002)}/minibrot/${id}/terrain-region`,
    {
      headers: internal_service_headers(
        req.headers.cookie ? { cookie: req.headers.cookie } : {},
      ),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw Object.assign(new Error("Freeform display region unavailable"), {
      status: response.status === 404 ? 404 : 503,
    });
  return (await response.json()).result;
};

export function create_terrain_cache_handlers({
  source_identity,
  cache_root = MESH_DIRECTORY,
  inventory_store = null,
  get_record = read_record,
  get_codes = (level) =>
    new Set(
      (
        FractoIndexedTiles.get_set_level("indexed", level)?.columns || []
      ).flatMap((column) => column.tiles.map((tile) => tile.short_code)),
    ),
  create_worker = (workerData) =>
    new Worker(new URL("../../../sdk/terrain/Worker.js", import.meta.url), {
      workerData,
    }),
} = {}) {
  const jobs = new Map(),
    queue = [];
  let active = false;
  const snapshot = (job) => ({
    id: job.id,
    bailiwick_id: job.plan.bailiwick_id,
    status: job.status,
    level: job.plan.level,
    native_resolution: job.plan.native_resolution,
    total: job.plan.tiles.length,
    missing: job.plan.missing_tiles.length,
    processed: job.processed,
    created: job.created,
    reused: job.reused,
    failed: job.failed,
    result: job.result || null,
    error: job.error || null,
  });
  const pump = () => {
    if (active || !queue.length) return;
    active = true;
    const job = queue.shift();
    job.status = "running";
    let worker,
      timer,
      finished = false;
    const finish = async (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        if (worker) await worker.terminate();
        await inventory_store?.recover_pending();
      } catch (failure) {
        error = failure;
      }
      job.status = error ? "failed" : result.status;
      if (error) job.error = "Terrain cache construction failed";
      else job.result = result;
      active = false;
      pump();
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
          const { processed, created, reused, failed } = message.progress;
          Object.assign(job, { processed, created, reused, failed });
        } else if (message.error) finish(new Error(message.error));
        else if (message.result) finish(null, message.result);
      });
      worker.on("error", finish);
      worker.on("exit", () => {
        if (!finished) finish(new Error("Worker exited early"));
      });
      timer = setTimeout(
        () => finish(new Error("Terrain cache job timed out")),
        10 * 60 * 1000,
      );
      timer.unref?.();
    } catch (error) {
      finish(error);
    }
  };

  return {
    start: async (req, res) => {
      const id = Number(req.body?.bailiwick_id);
      if (!Number.isSafeInteger(id) || id <= 0)
        return res.status(400).json({ error: "Invalid bailiwick id" });
      try {
        const record = await get_record(id, req);
        if (!record || Number(record.id) !== id)
          throw Object.assign(new Error("Freeform bailiwick not found"), {
            status: 404,
          });
        const level = terrain_level(terrain_region(record), 1000);
        const plan = plan_terrain_tiles(record, get_codes(level), 1000);
        if (!plan.tiles.length)
          return res.status(422).json({
            error: "No indexed source tiles meet the minimum resolution",
          });
        const identity = createHash("sha256")
          .update(JSON.stringify(plan))
          .digest("hex");
        for (const job of jobs.values()) {
          if (
            job.identity === identity &&
            ["queued", "running"].includes(job.status)
          )
            return res.status(202).json({ job: snapshot(job) });
        }
        if (
          [...jobs.values()].filter((job) =>
            ["queued", "running"].includes(job.status),
          ).length >= 8
        )
          return res.status(429).json({ error: "Terrain cache queue is full" });
        while (jobs.size >= 50) {
          const oldest = [...jobs.values()].find(
            (job) => !["queued", "running"].includes(job.status),
          );
          if (!oldest) break;
          jobs.delete(oldest.id);
        }
        const job = {
          id: randomUUID(),
          identity,
          plan,
          status: "queued",
          processed: 0,
          created: 0,
          reused: 0,
          failed: 0,
        };
        jobs.set(job.id, job);
        queue.push(job);
        pump();
        return res.status(202).json({ job: snapshot(job) });
      } catch (error) {
        return res.status(error.status || 400).json({
          error: error.status
            ? error.message
            : "Unable to plan terrain cache from the saved region",
        });
      }
    },
    status: (req, res) => {
      const job = jobs.get(req.params.id);
      return job
        ? res.json({ job: snapshot(job) })
        : res.status(404).json({ error: "Terrain cache job not found" });
    },
  };
}
