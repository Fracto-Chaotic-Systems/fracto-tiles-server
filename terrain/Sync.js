import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import {
  mesh_relative_path,
  assert_mesh_capacity,
} from "../../../sdk/terrain/Paths.js";
import { decode_terrain_mesh } from "../../../sdk/terrain/Cache.js";
import { durable_replace } from "../../../sdk/terrain/DurableFile.js";
import { TERRAIN_MESH_PROFILE } from "../../../sdk/terrain/Profile.js";

export const MAX_MESH_BYTES = 16 * 1024 * 1024;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (code, status = 409) =>
  Object.assign(new Error(code), { code, status });
const safe = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    res
      .status(error.status || 503)
      .json({ error: error.status ? error.code : "mesh_sync_storage_failed" });
  }
};

/** Owned by the tiles service, so every received mesh updates its live inventory. */
export class MeshFileSync {
  constructor({
    inventory_store,
    has_active_jobs = () => false,
    capacity = assert_mesh_capacity,
    ttl_ms = 300000,
  }) {
    Object.assign(this, {
      store: inventory_store,
      has_active_jobs,
      capacity,
      ttl_ms,
    });
    this.sessions = new Map();
  }
  touch(id, session) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      if (session.status === "checking") {
        session.abandoned = true;
        return;
      }
      if (session.busy) return this.touch(id, session);
      this.close(id);
    }, this.ttl_ms);
    session.timer.unref?.();
  }
  start() {
    if (
      this.store.sync_owner ||
      this.has_active_jobs() ||
      this.store.journal.pending.size
    )
      throw fail("mesh_jobs_active");
    const id = randomUUID(),
      session = { busy: true, status: "checking", files_checked: 0 };
    this.store.sync_owner = id;
    this.sessions.set(id, session);
    this.touch(id, session);
    session.completion = (async () => {
      try {
        session.catalog = await this.catalog({
          on_progress: ({ files_checked }) => {
            if (session.abandoned) throw fail("mesh_session_expired", 404);
            session.files_checked = files_checked;
          },
        });
        session.status = "ready";
      } catch (error) {
        session.status = "failed";
        session.error = error.status ? error.code : "mesh_sync_storage_failed";
      } finally {
        session.busy = false;
        if (session.abandoned) this.close(id);
        else this.touch(id, session);
      }
    })();
    return { id, status: "checking", files_checked: 0 };
  }
  async open() {
    const { id } = this.start();
    const session = this.sessions.get(id);
    // Legacy callers are actively waiting for acquisition; idle expiry begins
    // once that request can receive its catalog.
    clearTimeout(session.timer);
    await session.completion;
    if (session.error) {
      this.close(id);
      throw fail(session.error, 503);
    }
    if (session.abandoned) throw fail("mesh_session_expired", 404);
    return { id, catalog: session.catalog };
  }
  status(id) {
    const session = this.sessions.get(id);
    if (!session || session.abandoned) throw fail("mesh_session_expired", 404);
    this.touch(id, session);
    return {
      id,
      status: session.status,
      files_checked: session.files_checked,
      ...(session.status === "ready" ? { catalog: session.catalog } : {}),
      ...(session.status === "failed" ? { error: session.error } : {}),
    };
  }
  close(id) {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.busy) {
      session.abandoned = true;
      return;
    }
    clearTimeout(session.timer);
    this.sessions.delete(id);
    if (this.store.sync_owner === id) this.store.sync_owner = null;
  }
  async with_session(id, operation) {
    const session = this.sessions.get(id);
    if (!session || this.store.sync_owner !== id)
      throw fail("mesh_session_expired", 404);
    if (session.busy) throw fail("mesh_session_busy");
    session.busy = true;
    try {
      return await operation();
    } finally {
      session.busy = false;
      if (session.abandoned) this.close(id);
      else if (this.sessions.has(id)) this.touch(id, session);
    }
  }
  async catalog(options = {}) {
    await this.store.reconcile(options);
    const records = this.store.inventory
      .snapshot()
      .records.map(({ short_code }) => {
        const record = this.store.inventory.get(short_code);
        return {
          short_code,
          sha256: record.sha256,
          bytes: record.compressed_bytes,
          status: record.status,
        };
      })
      .sort((a, b) => a.short_code.localeCompare(b.short_code));
    if (records.length > 500000) throw fail("mesh_catalog_limit", 413);
    const catalog = {
      version: 1,
      namespace: this.store.inventory.namespace,
      profile: TERRAIN_MESH_PROFILE,
      records,
    };
    if (Buffer.byteLength(JSON.stringify(catalog)) > 64 * 1024 * 1024)
      throw fail("mesh_catalog_limit", 413);
    return catalog;
  }
  async filename(code, create = false) {
    let relative;
    try {
      relative = mesh_relative_path(code, this.store.layout);
    } catch {
      throw fail("invalid_mesh_code", 400);
    }
    const root = path.resolve(this.store.root);
    if ((await fs.lstat(root)).isSymbolicLink()) throw fail("unsafe_mesh_path");
    let directory = root;
    for (const part of relative.split("/").slice(0, -1)) {
      directory = path.join(directory, part);
      if (create)
        await fs.mkdir(directory).catch((e) => {
          if (e.code !== "EEXIST") throw e;
        });
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw fail("unsafe_mesh_path");
    }
    const filename = path.join(root, relative);
    try {
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw fail("unsafe_mesh_path");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return filename;
  }
  async read_bytes(filename) {
    const handle = await fs.open(
      filename,
      constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_MESH_BYTES)
        throw fail("mesh_file_limit", 413);
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }
  validate(code, data, expected) {
    if (data.length > MAX_MESH_BYTES) throw fail("mesh_file_limit", 413);
    let metadata;
    try {
      metadata = decode_terrain_mesh(data, false).metadata;
    } catch {
      throw fail("invalid_mesh_file", 422);
    }
    if (
      metadata.short_code !== code ||
      metadata.namespace !== this.store.inventory.namespace
    )
      throw fail("mesh_source_mismatch");
    if (sha(data) !== expected.sha256 || data.length !== expected.bytes)
      throw fail("mesh_checksum_mismatch", 422);
  }
  async read(code, record) {
    const bytes = await this.read_bytes(await this.filename(code));
    this.validate(code, bytes, record);
    return { data: bytes.toString("base64") };
  }
  async write(code, { data, record, expected }) {
    if (
      typeof data !== "string" ||
      data.length > Math.ceil(MAX_MESH_BYTES / 3) * 4
    )
      throw fail("mesh_file_limit", 413);
    const bytes = Buffer.from(data, "base64");
    if (bytes.toString("base64") !== data) throw fail("invalid_mesh_file", 422);
    this.validate(code, bytes, record);
    return this.store.enqueue(async () => {
      const filename = await this.filename(code, true);
      let current = null;
      try {
        current = sha(await this.read_bytes(filename));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (current === record.sha256) {
        await this.store.observe_file(code, true, true);
        return { reused: true };
      }
      if (current !== expected) throw fail("mesh_snapshot_changed");
      await this.capacity(this.store.root);
      await this.store.journal.append({ type: "begin", short_code: code });
      try {
        await durable_replace(filename, bytes);
      } finally {
        await this.store.observe_file(code, true, true);
      }
      return { stored: true };
    });
  }
}

// The caller mounts this behind require_internal_service, before body parsing.
export function create_mesh_file_sync_router(options) {
  const router = express.Router(),
    sync = new MeshFileSync(options);
  router.use(express.json({ limit: "24mb" }));
  router.post(
    "/identity",
    safe(async (_req, res) =>
      res.json({
        version: 1,
        namespace: sync.store.inventory.namespace,
        profile: TERRAIN_MESH_PROFILE,
      }),
    ),
  );
  router.post(
    "/sessions/start",
    safe(async (_req, res) => res.json(sync.start())),
  );
  router.post(
    "/sessions/:id/status",
    safe(async (req, res) => res.json(sync.status(req.params.id))),
  );
  router.post(
    "/sessions",
    safe(async (_req, res) => {
      const opened = await sync.open();
      if (res.destroyed) {
        sync.close(opened.id);
        return;
      }
      res.json(opened);
    }),
  );
  router.post(
    "/sessions/:id/close",
    safe(async (req, res) => {
      sync.close(req.params.id);
      res.json({ closed: true });
    }),
  );
  router.post(
    "/sessions/:id/catalog",
    safe(async (req, res) =>
      res.json(await sync.with_session(req.params.id, () => sync.catalog())),
    ),
  );
  for (const action of ["read", "write"])
    router.post(
      `/sessions/:id/${action}/:code`,
      safe(async (req, res) =>
        res.json(
          await sync.with_session(req.params.id, () =>
            action === "read"
              ? sync.read(req.params.code, req.body.record)
              : sync.write(req.params.code, req.body),
          ),
        ),
      ),
    );
  return router;
}
