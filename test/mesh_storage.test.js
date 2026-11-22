import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  initialize_mesh_storage,
  mesh_relative_path,
} from "@fracto/sdk/terrain/Paths.js";
import { read_mesh_file } from "@fracto/sdk/terrain/Storage.js";
import { build_terrain_tile } from "@fracto/sdk/terrain/Mesh.js";
import {
  encode_terrain_mesh,
  terrain_namespace,
} from "@fracto/sdk/terrain/Cache.js";
import { create_mesh_handler } from "../terrain/Access.js";

const identity = { generation: "mesh-test" };
const with_store = async (run) => {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "fracto-mesh-storage-"),
  );
  try {
    await run(temporary);
  } finally {
    assert.ok(
      path
        .resolve(temporary)
        .startsWith(path.join(os.tmpdir(), "fracto-mesh-storage-")),
    );
    await fs.rm(temporary, { recursive: true, force: true });
  }
};
const response = () => ({
  code: 200,
  headers: {},
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  setHeader(key, value) {
    this.headers[key] = value;
  },
  send(body) {
    this.body = body;
    return this;
  },
});

test("mesh paths mirror level and four-character tile layouts and reject traversal", () => {
  assert.equal(mesh_relative_path("01", "shortcode"), "01.gz");
  assert.equal(mesh_relative_path("0123", "shortcode"), "0123/0123.gz");
  assert.equal(
    mesh_relative_path("0123012301", "shortcode"),
    "0123/0123/0123012301.gz",
  );
  assert.equal(mesh_relative_path("0123012301", "level"), "L10/0123012301.gz");
  for (const code of [
    "../01",
    "01/23",
    "01\\23",
    "04",
    "",
    "0",
    "0".repeat(35),
  ])
    assert.throws(() => mesh_relative_path(code));
  assert.throws(() => mesh_relative_path("01", "invalid"));
});



test("initialization is idempotent, preserves numerical tiles, and fails on incompatible storage", async () =>
  with_store(async (directory) => {
    const tile = path.join(directory, "01.gz");
    await fs.writeFile(tile, "numerical tile");
    const root = path.join(directory, "meshes");
    const options = { root, layout: "shortcode" };
    assert.deepEqual(
      await initialize_mesh_storage(options),
      await initialize_mesh_storage(options),
    );
    assert.equal(await fs.readFile(tile, "utf8"), "numerical tile");
    assert.deepEqual(await fs.readdir(root), [".fracto-mesh-store.json"]);
    await assert.rejects(
      initialize_mesh_storage({ root, layout: "level" }),
      /does not match/,
    );
    await assert.rejects(
      initialize_mesh_storage({ root: tile }),
      /EEXIST|ENOTDIR/,
    );
  }));

test("stored gzip meshes can be loaded into typed arrays and retrieved without generation", async () =>
  with_store(async (directory) => {
    const root = path.join(directory, "meshes"),
      layout = "level",
      short_code = "012301";
    await initialize_mesh_storage({ root, layout });
    const source = Array.from({ length: 256 }, () =>
      Array.from({ length: 256 }, () => [2, 42]),
    );
    const mesh = build_terrain_tile(source);
    const { compressed } = encode_terrain_mesh(mesh, {
      short_code,
      namespace: terrain_namespace(identity),
      bounds: { left: 0, right: 1, top: 1, bottom: 0 },
      coordinate_system: "tile-local-xz-0-to-1",
      runtime_height_scale: "navigator_scope/25",
    });
    const file = path.join(root, mesh_relative_path(short_code, layout));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, compressed);
    const loaded = await read_mesh_file(short_code, {
      root,
      layout,
      source_identity: identity,
    });
    assert.deepEqual(loaded.positions, mesh.positions);
    assert.deepEqual(loaded.indices, mesh.indices);
    assert.deepEqual(loaded.uvs, mesh.uvs);
    assert.deepEqual(loaded.patterns, mesh.patterns);
    assert.deepEqual(loaded.iterations, mesh.iterations);
    const handler = create_mesh_handler({
      root,
      layout,
      source_identity: identity,
    });
    const res = response();
    await handler({ params: { short_code } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, compressed);
    assert.equal(res.headers["Content-Type"], "application/gzip");
    assert.equal(res.headers["Content-Encoding"], undefined);
    assert.ok(res.headers.ETag);
    const missing = response();
    await handler({ params: { short_code: "33" } }, missing);
    assert.equal(missing.code, 404);
    const invalid = response();
    await handler({ params: { short_code: "../secret" } }, invalid);
    assert.equal(invalid.code, 400);
    const stale = response();
    await create_mesh_handler({
      root,
      layout,
      source_identity: { generation: "other" },
    })({ params: { short_code } }, stale);
    assert.equal(stale.code, 409);
    const raw = gunzipSync(compressed);
    const header_length = raw.readUInt32LE(8);
    const header = JSON.parse(raw.toString("utf8", 16, 16 + header_length));
    header.profile.version = 9;
    const changed_header = Buffer.from(JSON.stringify(header));
    assert.equal(changed_header.length, header_length);
    changed_header.copy(raw, 16);
    await fs.writeFile(file, gzipSync(raw));
    const incompatible = response();
    await handler({ params: { short_code } }, incompatible);
    assert.equal(incompatible.code, 409);
    await fs.writeFile(file, "corrupt");
    const corrupt = response();
    await handler({ params: { short_code } }, corrupt);
    assert.equal(corrupt.code, 503);
    assert.equal(JSON.stringify(corrupt.body).includes(directory), false);
  }));
