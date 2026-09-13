# fracto-tiles-server

Express service for loading Fracto's compiled tile index and serving tile-derived coverage, raster buffers, heat maps, and manifests. It listens on port 3004 and depends on shared SDK and configuration files from the parent Fracto repository.

## Repository layout requirement

This is an independent Git repository, but it is expected to remain at:

```text
fracto/servers/fracto-tiles-server/
```

The service imports modules such as `../../constants.js` and `../../sdk/FractoTileIndexCache.js`. Moving or cloning it outside that layout breaks those shared imports.

Run Git operations for this service from this directory. Run compiled-cache and full-system commands from the root `fracto/` directory.

## Installation

From the root repository:

```powershell
npm ci --prefix servers/fracto-tiles-server
```

Or from this directory:

```powershell
npm ci
```

Node 22 is the validated runtime. The service uses native ES modules.

## Compiled tile index

The service does not parse the multi-gigabyte JSON packet corpus during normal startup. Build the binary cache explicitly from the root repository:

```powershell
npm run tiles:index
```

Sources are under `tiles/manifest/indexed/`; the generated cache is stored under `tiles/cache/indexed/<fingerprint>/`.

The builder fingerprints the manifest and packet file metadata, serializes packets individually with Node's V8 serializer, and verifies the tile count from packet contents. Generated cache data is ignored by Git.

At startup, the service recomputes the inexpensive source fingerprint and requires a matching cache. A missing, incomplete, or stale cache causes startup to fail with instructions to rerun `npm run tiles:index`. Port 3004 opens only after all cached packets have been loaded into memory.

## Starting the service

Preferred full-system startup from the root repository:

```powershell
npm run start:check
npm start
```

Start only this service through the root launcher:

```powershell
node scripts/launch_service.js fracto-tiles-server
```

For isolated development from this directory:

```powershell
npm start
```

The local `npm start` command uses `nodemon`. Do not run it while the root supervisor already owns port 3004.

## Initialization lifecycle

Startup has two distinct data phases:

1. The compiled local tile index is synchronously validated and loaded before port 3004 opens.
2. Coverage categories are downloaded asynchronously after the server begins listening.

Coverage CSV files come from the `fracto-prod` endpoint in the root `config/network.json` and include `indexed`, `blank`, `interior`, and `needs_update` short codes. They may represent a newer dataset than the local packet cache. Logs distinguish raw CSV rows from the unique short codes retained in per-level sets.

The service trims its in-memory tile cache every ten seconds.

## HTTP endpoints

All endpoints currently use `GET`.

### `GET /`

Basic health endpoint used by the root supervisor. Returns a plain-text welcome message.

### `GET /tile_coverage`

Returns coverage and generation categories around a focal point. Query parameters are `re`, `im`, and `scope`. The response is `{ "coverage": [...] }`.

### `GET /canvas_buffer`

Builds a raster buffer from indexed tile data. Query parameters are `width_px`, `focal_point_x`, `focal_point_y`, `scope`, `aspect_ratio`, and `resolution_factor`. The turbo unresolved-pixel renderer is the default; select the stable legacy renderer with `strategy=legacy` or `FRACTO_RASTER_STRATEGY=legacy`. Returns `{ "canvas_buffer": ... }` or `{ "error": ... }`.

### Benchmark reports

The root benchmark command writes dated JSON reports to the runtime-only
`benchmarks/legacy/` and `benchmarks/turbo/` directories. These directories are
ignored by Git and may be retained with the tile-server installation for later
analysis.

`GET /benchmark_results` returns the newest report envelope for each strategy,
or `null` when that strategy has no stored report.

### `GET /hyper_canvas_buffer`

Calculates a hyper-complex raster directly. Query parameters are `width_px`, `focal_point_x`, `focal_point_y`, `scope`, and `aspect_ratio`. Returns `{ "canvas_buffer": ... }`. This endpoint can be computationally expensive.

### `GET /heat_map_buffer`

Builds a square tile-level heat map and returns coverage data. Query parameters are `width_px`, `focal_point_x`, `focal_point_y`, and `scope`. Returns `{ "heat_map_buffer": ..., "coverage": ..., "timings_ms": { "index_lookup", "rasterization", "coverage", "total" } }`. The coverage calculation reuses the spatial lookup performed for the heat map, and the timing fields expose the major server-side stages for profiling.

### `GET /manifest`

Traverses the root tile directory for `.gz` files, writes `tiles/manifest.json`, and returns `{ "result": "success" }`. Despite using `GET`, this endpoint changes local state and can perform a large filesystem traversal.

### Incomplete endpoints

- `GET /tile` currently returns the generic welcome message and does not retrieve a tile.
- `GET /logs` currently has no active response implementation.

Consumers should not depend on these two endpoints until their handlers are completed.

## Index generation utilities

`tile_indexer.js` generates JSON packet files and `packet_manifest.json` from the remote indexed short-code CSV. The root `refresh_tile_index.js` workflow also runs `build_coverage_cache.js`, which packages the blank, interior, and needs-update classification CSVs into the same published generation. These are offline maintenance utilities, not part of normal server startup.

Other maintenance scripts include:

- `tile_inventory.js`: tile inventory operations.
- `tile_manifest.js`: manifest-related generation.
- `manifest_to_db.js`: sends manifest-derived coverage to the data service.
- `backup.js`: backup operations.

Review a maintenance script's paths and side effects before running it. These scripts are not exposed through package aliases and may assume root data directories or another service is available.

## Shared dependencies

Important root modules used by this service include:

- `constants.js`: port and root directory definitions.
- `sdk/FractoTileIndexCache.js`: compiled-cache build/load contract.
- `sdk/FractoIndexedTiles.js`: in-memory tile index.
- `sdk/FractoTileData.js`: tile selection and raster filling.
- `sdk/FractoCoverageUtils.js`: remote category coverage.
- `sdk/FractoTileCache.js`: loaded tile payload cache.
- `config/network.json`: remote coverage source.

Changes to these shared files belong to the root repository, not this repository.

## Validation

From the root repository:

```powershell
npm run check
npm run start:check
npm run tiles:index
```

`npm run tiles:index` is idempotent when the current fingerprint is already compiled. The service's own `npm test` command is still a placeholder and intentionally fails.

For a startup verification, launch only the tile service and request its health endpoint after it reports ready:

```powershell
node scripts/launch_service.js fracto-tiles-server
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3004/
```

Stop the launcher with Ctrl+C when finished.

## Logs and troubleshooting

When started by the root supervisor, output is appended to `logs/fracto-tiles-server-log-YYYY-MM-DD.txt` in the root repository.

Common failures:

- **Cache missing or stale:** run `npm run tiles:index` from the root.
- **Port 3004 already in use:** stop the existing supervisor or isolated tile service.
- **Coverage preload is slow:** inspect remote CSV progress in the dated log; the supervisor starts the preload after all services are healthy, and HTTP and health endpoints remain available while classification manifests load.
- **Coverage and cache counts differ:** compare unique coverage counts with the cache's verified packet count. The remote CSV and local cache may be different snapshots.
- **Shared import cannot be resolved:** restore this repository to `fracto/servers/fracto-tiles-server/`.
- **Startup update is blocked:** commit, stash, or revert tracked changes in this repository.

`tiles.csv` is a local export and is intentionally ignored by this repository.
