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

The [tile data access and cache lifecycle](#tile-data-access-and-cache-lifecycle)
section below describes source fetching, filesystem storage, and memory trimming.

## Tile data access and cache lifecycle

Tile access uses three distinct data layers. The compiled index described above
is metadata used to select the indexed tiles that cover a requested region. It
is built from the local packet corpus and loaded into memory before the service
opens port 3004. It is separate from both the compressed tile files and the
runtime cache of decoded tile data.

For each selected tile, `FractoTileCache.get_tile()` checks these layers in
order:

1. **In-memory tile cache:** A previously loaded tile is returned directly as
   decoded data, avoiding file I/O, download, and decompression. Access updates
   the tile's last-access time.
2. **Persistent filesystem cache:** If the tile is not in memory, its `.gz`
   file is read from the tile-data directory and decompressed. The directory is
   `FRACTO_TILE_DATA_DIR` when configured, otherwise the root `tiles/` directory;
   Docker mounts the production volume at `/var/lib/fracto/tiles`. Tile names
   are stored in nested directories derived from their short codes.
3. **Source of truth:** If there is no local tile file, the service fetches
   `<level-directory>/<short-code>.gz` from the `fracto-prod` URL in the root
   `config/network.json`. The response must be HTTP 200 and valid gzip data
   before it is accepted. In writable mode it is downloaded to a temporary file
   and atomically renamed into the filesystem cache, then decoded and parsed for
   the request. Failed responses and invalid tile data are counted as failures;
malformed JSON discovered after the rename leaves the compressed file in the
filesystem cache and will be encountered again on a later request.

The request path is therefore:

```text
HTTP raster request
  -> compiled in-memory tile index selects short codes
  -> decoded memory cache
  -> remote-cache mode: persistent .gz cache -> network source when absent
  -> local-source mode: authoritative mounted .gz file when absent from memory
```

The compiled index is a selection structure, not another tile-payload cache.
Both modes use the decoded memory cache after loading a tile. In remote-cache
mode the filesystem cache is checked before the network source and writable
production stores successful downloads there. In local-source mode the
authoritative tree replaces those two lower layers: each memory miss reads the
mounted source file, with no network fallback and no persistent copy.

Concurrent requests for the same tile share one in-flight load or download.
Once loaded, the decoded tile is retained in memory. The tile service trims
that memory cache every ten seconds; raster completion can also schedule a
trim. Trimming is based on inactivity, not least-recently-used ranking or a
strict maximum size. Remote-cache mode keeps its existing policy: when at least
750 tiles are resident, entries idle for more than two minutes are removed;
above 1,250 tiles, the idle timeout is one minute. Local-source mode uses a
smaller working set because it can reread authoritative files: trimming starts
at 100 resident tiles after 30 seconds idle, and above 250 tiles the idle
timeout is 15 seconds. These are soft thresholds, not hard caps; recently used
tiles remain cached. The mode-specific values are constants in
`sdk/FractoTileCache.js`, not environment settings.
Frequently accessed tiles remain available because each memory hit refreshes
its last-access time. `/cache_status` reports current memory usage, evictions,
and the configured threshold values. It identifies `source_mode` and reports
local-source reads and failures separately from demand-cache disk hits and
remote downloads. Its `last_source_error` includes a safe error kind and tile
short code without a filesystem path; no source or cache path is included in
the response. In local-source mode, memory and in-flight cache identities also
include the source generation and tile short code.

Production may write downloaded tile files to its persistent volume. Development
sets `FRACTO_TILE_CACHE_READ_ONLY=true`: it can reuse existing files, but an
uncached tile is downloaded and decoded for the current process without being
written to disk. Writable downloads are refused when free disk space is below
`FRACTO_TILE_MIN_FREE_BYTES`, which defaults to 1 GiB. The index-generation
cache has a separate lifecycle and is refreshed with `npm run tiles:index`;
tile-file downloads do not update or rebuild that index.

### Local-source deployment contract

The local-source variant is intended for a tile server running on the host that
stores the authoritative tile files. Its configuration contract is:

- Select the mode explicitly with `FRACTO_TILE_SOURCE_MODE=local`, provide
  `FRACTO_TILE_SOURCE_DIR` as the absolute path to the source tree, and set
  `FRACTO_TILE_SOURCE_GENERATION` to a non-secret immutable dataset identifier.
- The source tree is read-only to the tile service and contains files at
  `L<two-digit-level>/<short-code>.gz`, matching the cloud source layout.
- A tile request reads and validates that source file directly. It does not
  create a persistent tile-cache copy or contact the network.
- A missing or invalid source file is an error. Local-source mode never falls
  back to remote fetching or to `FRACTO_TILE_DATA_DIR`. Tile-load errors stay
  distinct through raster generation, and `/canvas_buffer` responds with HTTP
  503 and a structured error containing the tile short code but no filesystem
  path.
- `FRACTO_TILE_DATA_DIR` continues to configure the existing demand-filled
  cache in remote mode. It is not the source path in local-source mode.
- The compiled tile index remains a separate required input. The source root
  must contain `fracto-tile-release.json` with schema version 1, the same
  `source_generation` configured in the process, and the selected compiled
  index's `index_fingerprint` (the compiled-index source descriptor
  fingerprint) and `index_tile_count`. The compiled index metadata
  independently records the same `tile_source_generation`.
  Local preflight rejects a missing, malformed, or mismatched binding before
  the service starts.
- A source directory is immutable after publication. To update the data,
  publish a new source directory and matching index generation, set the new
  source path and a new identifier that is never reused for different tile
  content, then restart the tile service. Never replace files in a live
  generation; the process retains decoded tiles in memory.
- Decoded tiles remain in the process memory cache. Local-source mode starts
  trimming at 100 entries after 30 seconds idle, and uses a 15-second idle
  timeout above 250 entries. These are soft thresholds, not hard caps; active
  tiles remain cached. Remote-cache mode retains its 750/1,250-entry thresholds
  and two-minute/one-minute idle timeouts. The values are constants, not env
  settings. Cache identity includes the immutable source-generation identifier
  so different datasets cannot share entries.

The local-source reader is selected by the dedicated startup command below.
The ordinary startup commands continue to default to remote-cache mode.
Use remote-cache for installations without direct access to authoritative tile
files. Use local-source only when the authoritative dataset is available on the
tile server's filesystem through a read-only mount. Installation and operation
instructions, including recovery steps, are in
[`DEPLOYMENT.md`](DEPLOYMENT.md).

In `/cache_status`, `source_mode`, `source_generation`, `local_source_reads`,
`local_source_failures`, and `last_source_error` distinguish direct source
reads from the existing `disk_hits` and `downloads` counters. The generation is
an operator-defined non-secret identifier. Status output does not include the
source or cache directory path.

#### Start the local-source service

The startup script reads the root `.env` file when present; variables already
provided by the process environment take precedence. Configure the source as a
read-only, immutable generation directory, for example:

```dotenv
FRACTO_TILE_SOURCE_MODE=local
FRACTO_TILE_SOURCE_DIR=/srv/fracto/tiles/source/generation-2026-09-27
FRACTO_TILE_SOURCE_GENERATION=2026-09-27
```

The account running Fracto needs read and directory-search permission on the
source tree; mount it read-only and verify access under the service's OS user.
Prepare the matching compiled index from the same packet generation using
`npm run tiles:index`; if the indexed packets or manifest need refreshing, run
the `npm run tiles:refresh` workflow first. By default,
`FRACTO_TILE_INDEX_DIR` selects the index root that contains the published
`generations/` and `CURRENT` pointer. For a pinned generation,
`FRACTO_TILE_INDEX_GENERATION_DIR` selects its completed directory directly.
When preparing an index for local-source mode, set
`FRACTO_TILE_SOURCE_MODE=local` and the release's
`FRACTO_TILE_SOURCE_GENERATION` while compiling it. The compiled index
metadata records that generation. After the matching source files are staged,
run `npm run tiles:source-release` with the same source/index configuration;
it writes the release manifest once and refuses to overwrite one already
published. The preflight checks the generation binding, index fingerprint,
index tile count, compiled packets, and one representative tile.

The source-side manifest has this shape:

```json
{
  "schema_version": 3,
  "source_generation": "tiles-2026-09-release-1",
  "index_fingerprint": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "index_tile_count": 123456,
  "tile_validation": {
    "method": "representative-tile-shape-v1",
    "short_code": "12"
  },
  "created_at": "2026-09-27T12:00:00.000Z"
}
```

The example fingerprint, count, and short code are illustrative. The manifest
binds the configured source generation to the compiled index and records one
representative tile check. It does not enumerate the corpus; missing or
invalid tiles are reported when requested. Never reuse the generation
identifier for a different source/index pairing.

Run preflight without starting the server:

```powershell
npm run start:tiles-local-source -- --check
```

Start only the tile server after preflight passes:

```powershell
npm run start:tiles-local-source
```

The command runs in the foreground; Ctrl+C stops the tile server. It fails
before launch for missing configuration, an unreadable source directory, an
unexpected directory layout, a stale or incomplete compiled index, or a
missing, unreadable, or malformed representative tile. The representative
check does not scan the entire source tree, so publish a complete generation
before switching production to it. If preflight reports a stale index, refresh
or rebuild the matching index generation and run `--check` again.

For updates, publish a new immutable source directory and matching compiled
index generation, update the source path and generation identifier together,
then restart this command. Never modify files in the active source directory or
reuse its generation identifier for changed tile content. Runtime cache entries
are separated by generation, and restarting clears the prior process's memory.

## HTTP endpoints

All endpoints currently use `GET`.

### `GET /`

Basic health endpoint used by the root supervisor. Returns a plain-text welcome message.

### `GET /tile_coverage`

Returns coverage and generation categories around a focal point. Query parameters are `re`, `im`, and `scope`. The response is `{ "coverage": [...] }`.

### `GET /canvas_buffer`

Builds a raster buffer from indexed tile data. Query parameters are `width_px`, `focal_point_x`, `focal_point_y`, `scope`, `aspect_ratio`, and `resolution_factor`. The turbo unresolved-pixel renderer is the default; select the stable legacy renderer with `strategy=legacy` or `FRACTO_RASTER_STRATEGY=legacy`. Returns `{ "canvas_buffer": ... }` or `{ "error": ... }`. In local-source mode, a missing or invalid authoritative tile returns HTTP 503 with a structured tile-source error.

### Measuring authenticated render bursts

The tile service emits a privacy-safe `fracto_metric_window` summary every ten
seconds when it has samples for `canvas_buffer_request`. Each summary contains
the request count, average and maximum server duration, and HTTP status counts.
The measurement begins before authentication middleware, so duration includes
the session check and raster generation. It never records query parameters,
focal points, cookies, or user identity. The data server emits
`auth_user_record_query` summaries for connection-plus-query duration, while
the root main server emits `auth_user_record_lookup` summaries for the complete
internal HTTP round trip.

On EC2, use the browser Network panel filtered to `canvas_buffer` to count and
time requests from one page refresh or rapid zoom sequence, without exporting
a HAR file that may contain cookies. Collect server summaries for the same
time window with:

```sh
docker compose -f compose.yaml -f compose.local-tiles.yaml logs --since=2m fracto \
  | grep 'fracto_metric_window'
```

Each process aggregates locally, so the Docker output may contain separate
canvas-request and user-lookup summaries. Compare their `started_at` and
`ended_at` windows to the browser test. A missing metric in a window means
that process recorded no samples for that metric during the interval.

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
- `backup.js`: host-side tile backup operation. It imports shared SDK modules
  by repository-relative path so it can run outside Docker and access the host
  tile files directly; run it from the root repository with `npm run
  tiles:backup`.

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
