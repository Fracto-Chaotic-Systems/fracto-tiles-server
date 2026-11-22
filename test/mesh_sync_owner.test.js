import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { once } from "node:events";
import { MeshInventoryStore } from "@fracto/sdk/terrain/InventoryStore.js";
import { mesh_relative_path } from "@fracto/sdk/terrain/Paths.js";
import { build_terrain_tile } from "@fracto/sdk/terrain/Mesh.js";
import {
  encode_terrain_mesh,
  terrain_namespace,
} from "@fracto/sdk/terrain/Cache.js";
import { read_mesh_file } from "@fracto/sdk/terrain/Storage.js";
import {
  MeshFileSync,
  create_mesh_file_sync_router,
} from "../terrain/Sync.js";
import { create_mesh_job_queue } from "../terrain/Queue.js";
import {
  require_internal_service,
  internal_service_headers,
} from "@fracto/sdk/utils/ServiceAuthorization.js";
const identity = { generation: "mesh-sync-fixture" };
const geometry = build_terrain_tile(
  Array.from({ length: 256 }, () => Array.from({ length: 256 }, () => [2, 42])),
);
const encoded = (code, variant = "same") =>
  encode_terrain_mesh(geometry, {
    short_code: code,
    namespace: terrain_namespace(identity),
    variant,
  }).compressed;

test("a scanning store reports progress and releases an abandoned reservation when its scan finishes", async () => {
  let finish, notify;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const store = {
    journal: { pending: new Set() },
    inventory: { namespace: "0".repeat(32), snapshot: () => ({ records: [] }) },
    reconcile: async ({ on_progress }) => {
      notify = on_progress;
      await gate;
    },
  };
  const sync = new MeshFileSync({ inventory_store: store });
  const opened = sync.start();
  const completion = sync.sessions.get(opened.id).completion;
  notify({ files_checked: 64 });
  assert.equal(sync.status(opened.id).files_checked, 64);
  assert.equal(sync.status(opened.id).status, "checking");
  assert.throws(() => sync.start(), /mesh_jobs_active/);
  sync.close(opened.id);
  assert.ok(
    store.sync_owner,
    "scan owns the store until its outstanding reads finish",
  );
  finish();
  await completion;
  assert.equal(store.sync_owner, null);
});
test("mesh imports reject checksum failures, symlink escapes, and abandoned store reservations", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "fracto-mesh-sync-security-"),
  );
  let sync, opened;
  try {
    const root = path.join(directory, "meshes"),
      outside = path.join(directory, "outside");
    const store = await new MeshInventoryStore({
      root,
      layout: "shortcode",
      source_identity: identity,
    }).initialize();
    sync = new MeshFileSync({
      inventory_store: store,
      capacity: async () => {},
    });
    opened = await sync.open();
    const data = encoded("000000");
    const { createHash } = await import("node:crypto");
    const record = {
      sha256: createHash("sha256").update(data).digest("hex"),
      bytes: data.length,
    };
    await assert.rejects(
      sync.with_session(opened.id, () =>
        sync.write("000000", {
          data: data.toString("base64"),
          record: { ...record, sha256: "0".repeat(64) },
          expected: null,
        }),
      ),
      /mesh_checksum_mismatch/,
    );
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, "000000.gz"), "keep");
    await fs.symlink(outside, path.join(root, "0000"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      sync.with_session(opened.id, () =>
        sync.write("000000", {
          data: data.toString("base64"),
          record,
          expected: null,
        }),
      ),
      /unsafe_mesh_path/,
    );
    assert.equal(
      await fs.readFile(path.join(outside, "000000.gz"), "utf8"),
      "keep",
    );
    sync.close(opened.id);
    const expiring = new MeshFileSync({ inventory_store: store, ttl_ms: 20 });
    await expiring.open();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(store.sync_owner, null);
  } finally {
    if (opened) sync.close(opened.id);
    assert.ok(
      path
        .resolve(directory)
        .startsWith(path.join(os.tmpdir(), "fracto-mesh-sync-security-")),
    );
    await fs.rm(directory, { recursive: true, force: true });
  }
});