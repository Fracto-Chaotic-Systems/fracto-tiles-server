# Terrain cache jobs

`Jobs.js` owns queued test jobs launched from the freeform bailiwick panel.
POST `/terrain-cache/jobs` accepts a bailiwick ID, loads its saved display region
from the data service and plans a minimum 1000-sample native resolution. GET
`/terrain-cache/jobs/:id` reports progress and the final relative cache manifest.
Both routes inherit tile-service authentication and mutation-origin checks.
The data service exposes only ID/display settings for a freeform record.

One worker runs at a time, with at most eight active/queued jobs. Identical
active plans are deduplicated. Worker construction, source reads and cache writes
stay off the HTTP event loop. Ten-minute timeouts and worker failures release
the queue; up to 50 recent job summaries are retained in memory. Jobs do not
survive a service restart, but complete tile files and manifests do.

Mesh storage is now the `meshes/` subtree on the active numerical tile volume.
The former service-local `terrain-cache/` and `FRACTO_TERRAIN_CACHE_DIR` override
are no longer used. Old files remain untouched; rerun selected-entry tests to
populate the new layout. Source identities remain inside files, not directories.

`Access.js` implements GET `/meshes/:short_code`, returning the complete gzip
binary asset (`application/gzip`, no HTTP Content-Encoding). It checks the
current source/profile before returning bytes. Missing files return 404, stale
files 409, invalid shortcodes 400, and unreadable/corrupt files 503. Reads never
generate meshes or download numerical tiles. This route uses the same service
authentication as the other tile routes. The SDK `read_mesh_file()` also decodes
typed arrays for server-side consumers; browser assembly remains future work.

Before listening, the service initializes and verifies the mesh directory with
an atomic write/rename/read-back probe. An unwritable store or mismatched layout
stops startup instead of silently falling back to an ephemeral directory.
Builds enforce the existing tile-volume minimum free-space setting. See the SDK
README for preparation commands and the read-only local-source mount exception.
The SDK's `terrain/README.md` defines the binary format and transform contract.
Missing tiles produce partial results. Neighbor seam repair and flight-simulator
assembly are deferred; this button only preconstructs and stores the meshes.

The service owns one `MeshInventoryStore` for the mesh volume. It loads durable
snapshots/journals and recovers pending publications before listening; an absent
or corrupt index is rebuilt by scanning the existing mesh files. Workers use
acknowledged begin/observe messages so progress follows durable index updates.
Job completion/failure recovers pending writes after worker termination.
`Access.js` observes retrievals to repair missing/corrupt inventory records.

GET `/mesh_inventory` returns counts, revision and `inventory_epoch`, which
identifies the revision history across index recovery. POST
`/mesh_inventory/reconcile` verifies files, incorporates external additions or
changes, and removes deleted entries. Both use existing authentication and
the POST uses the existing mutation-origin checks. The SDK terrain README
describes snapshot/journal recovery and the single-owner deployment contract.

`HeatMap.js` registers GET `/mesh_heat_map_buffer`, backed by the SDK's pure
inventory rasterizer. It returns `[0, level]` pixels, per-level ready-mesh counts
and compressed sizes, visible pixel counts, uncovered pixels, dimensions, timings,
namespace and inventory revision. Only ready meshes contribute; finer levels
win and upper-half coverage is mirrored. Empty pixels have level 0. The route
does not read files or use numerical tile classifications. See the SDK terrain
README for query parameters, dimension/candidate limits and error responses.
The production handler injects an in-memory compiled-index counter and includes
`tile_count` and `can_do = tile_count - mesh_count` in each coverage row. Rows
include tile-only levels as well as ready-mesh levels. This reads index metadata
only; it neither downloads numerical tiles nor scans the filesystem.

### Navigator transform jobs

POST /mesh-transforms/jobs accepts {count, level, region: {focal_point: {x,y}, scope, aspect_ratio}}. It selects indexed tiles without ready meshes and returns {job} with HTTP 202. Invalid selections return 400, changed counts 409, queue saturation 429. GET /terrain-cache/jobs/:id polls both region and bailiwick jobs; POST /terrain-cache/jobs/:id/cancel stops either kind. Unknown IDs return 404. All routes retain service authentication and mutation-origin guards.

Queue.js owns the shared single-worker queue (eight pending/active jobs, fifty retained terminal records, ten-minute job timeout). Stop terminates the worker and recovers pending inventory publications before returning counters. Completed mesh files remain available for a new selection or Resume. Terminal records discard tile arrays. Jobs are process-local; durable mesh files and inventory survive restart. Neighbor stitching remains deferred.

Job snapshots include preview_short_code, the latest successfully published mesh sampled by progress. A failed source tile updates job counters without replacing this preview. Previews use the existing authenticated GET /meshes/:short_code binary endpoint.
