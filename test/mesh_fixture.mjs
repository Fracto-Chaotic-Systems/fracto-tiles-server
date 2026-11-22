import express from "express";
import assert from "node:assert/strict";
import { serve_fixture } from "@fracto/sdk/testing/ServiceFixture.js";
import { require_internal_service } from "@fracto/sdk/utils/ServiceAuthorization.js";
import { MeshInventoryStore } from "@fracto/sdk/terrain/InventoryStore.js";
import { MeshFileSync, create_mesh_file_sync_router } from "../terrain/Sync.js";
import { create_mesh_job_queue } from "../terrain/Queue.js";

if (process.argv.includes("--serve-fixture")) {
  const options = JSON.parse(process.env.FRACTO_TEST_FIXTURE_OPTIONS || "{}");
  const store = await new MeshInventoryStore({ root: options.root, layout: options.layout, source_identity: options.identity }).initialize();
  const app = express();
  app.use("/internal/mesh-sync", require_internal_service, create_mesh_file_sync_router({ inventory_store: store, capacity: async () => {} }));
  await serve_fixture(app, express, {
    state: () => ({ sync_owner: store.sync_owner || null, layout: store.layout, epoch: store.inventory.epoch, records: store.inventory.snapshot().records }),
    lock_conflicts: async () => {
      const lock = new MeshFileSync({ inventory_store: store }), opened = await lock.open();
      const queue = create_mesh_job_queue({ inventory_store: store });
      assert.throws(() => queue.enqueue({}), /synchronization is in progress/);
      await assert.rejects(lock.open(), /mesh_jobs_active/);
      lock.close(opened.id);
      await assert.rejects(new MeshFileSync({ inventory_store: store, has_active_jobs: () => true }).open(), /mesh_jobs_active/);
      return { catalog: opened.catalog };
    },
  });
}
