# Tile server deployment

This guide covers the two tile-source modes and the specialized deployment
where the tile service reads its authoritative tile files from a local,
read-only filesystem mount.

## Choose a source mode

Use **remote-cache** for the standard Fracto installation. The tile server
does not have the authoritative tile corpus mounted. A request checks decoded
memory, then the persistent `.gz` cache, then downloads a missing tile from the
configured remote source. Production persists successful downloads; development
can be configured to download without disk writes. Existing `npm start` and
supervisor startup behavior stays in this mode by default.

Use **local-source** only when the tile server runs on the machine holding the
authoritative corpus, or the corpus is mounted there. A memory miss reads the
authoritative `.gz` file directly. This mode does not contact the network and
does not write a demand-cache copy. Missing, unreadable, corrupt, or invalid
tiles fail the request. Do not select it merely to avoid warming a remote cache.

The tile index is required in both modes. It maps viewport coordinates to tile
short codes; it does not contain the tile image data. See the service
[request and cache flow](README.md#tile-data-access-and-cache-lifecycle).

## Install local-source mode

1. Install the root application and all five service repositories using the
   normal deployment procedure. The local-source command starts only the tile
   service; it does not start the root supervisor or dependent services.
2. Mount or place the authoritative tile corpus on the tile server. It may
   remain at one permanent path; it does not need a new directory for each
   index build. Preserve the source layout
   `L<two-digit-level>/<short-code>.gz`, for example `L02/12.gz`. Mount it
   read-only where the service account can traverse every
   parent directory and read each tile. The service account needs directory
   search (`x`) and file read permission; it does not need write permission.
   Verify access as the same OS user that will run Fracto. For containers, bind
   mount the source read-only and grant the container's service UID/GID the
   needed read and traversal permissions.
3. Assign one stable dataset/index ID to the corpus. This is a logical
   identifier, not a directory name. In local-source mode,
   `npm run tiles:refresh` reads indexed short codes directly from
   `${FRACTO_TILE_SOURCE_DIR}/manifest/indexed.csv`; it does not fetch the list
   from `fracto-prod`. The twice-daily indexed manifest is trusted as generated
   from a filesystem listing. Other listings such as `interior.csv` and
   `blank.csv` are read from the same folder when requested. Release preparation
   does not enumerate the local corpus: it decodes one representative tile, and
   other missing or invalid files are reported when requested. Keep the ID
   unchanged while the same corpus/index pair is in use.
4. Set these values in the root `.env` or the process environment. Keep
   deployment-specific paths out of Git:

   ```dotenv
   FRACTO_TILE_SOURCE_MODE=local
   FRACTO_TILE_SOURCE_DIR=/srv/fracto/tiles
   FRACTO_TILE_SOURCE_GENERATION=production-tiles-v1
   ```

   The directory must be absolute. The ID is non-secret and should remain
   stable while the corpus/index pairing is unchanged. Change it when the
   corpus or matching index changes; never reuse an ID for a different pairing.
   If the normal compiled index path is not used, configure its location using the existing
   index-directory setting documented in the root configuration.
5. With the exact compiled index generation selected and marked complete, run
   `npm run tiles:source-release` while the corpus root is writable. In the
   main EC2 Compose deployment, first build the index image and publish the
   compiled generation from the local indexed manifest:

   ```sh
   docker compose -f compose.yaml -f compose.local-tiles.yaml run --rm --build index-refresh
   ```

   This refresh alone is not the match check. Use the one-time preparation
   overlay to let only the manifest-creation command write the small root
   manifest; the command still reads the tile corpus and compiled index:

   ```sh
   docker compose -f compose.yaml -f compose.local-tiles.yaml -f compose.local-tiles-prepare.yaml run --rm --no-deps --entrypoint node fracto scripts/create_tile_source_release_manifest.js
   ```

   After that command succeeds, remove the preparation overlay from all future
   commands. The regular local-tiles overlay restores the read-only mount.
   This command decodes the indexed representative tile and writes the small
   `fracto-tile-release.json` file at the corpus root. The schema-3 manifest
   contains the dataset/index ID, compiled index fingerprint, tile count, and
   representative short code. Startup validates this binding and representative
   tile. It does not enumerate the corpus. Missing or malformed tiles outside
   this check fail when requested; local mode has no network fallback. The
   command refuses to overwrite an
   existing manifest. After creating it, the corpus can remain at its
   permanent path and be mounted read-only; tile files do not move.
6. Run the preflight:

   ```powershell
   npm run start:tiles-local-source -- --check
   ```

   Preflight confirms the source directory is readable and searchable, checks
   its `LNN` layout, validates the compiled index paired with this dataset ID, and
   reads and checks the shape of one indexed representative tile. It does not
   scan every tile; ensure the corpus is complete before enabling traffic.
7. Start the tile service:

   ```powershell
   npm run start:tiles-local-source
   ```

   It runs in the foreground. Ctrl+C stops the service. This dedicated command
   forces local-source mode and refuses a conflicting mode setting. Ordinary
   startup commands retain remote-cache behavior.

## Updates and restarts

Treat each source/index pairing as an immutable release. Keep the current
source root and its compiled index generation intact while preparing the next
release beside them. Do not edit files under the active source root. Use a
filesystem snapshot or another storage-level copy-on-write method when the
corpus is unchanged; the source contains tens of millions of tiles, so a full
second byte-for-byte copy is usually wasteful. Each release root needs its own
`fracto-tile-release.json` because the manifest binds the source/index ID to a
specific compiled-index fingerprint.

For the EC2 Compose deployment, use the candidate-build, candidate-preflight,
switch, and rollback sequence in [deploy/README.md](../../deploy/README.md#publish-a-tile-release-and-rollback).
The candidate index is built without moving `CURRENT`, and preflight checks
the candidate source and exact index generation together before production is
stopped. Only after that check succeeds do you update the source path and ID,
select the candidate index, and restart Compose. Record the previous source
path, source/index ID, and index generation before switching; retain both old
source and index until the new pair has passed health checks and the rollback
window has closed.

A process restart clears decoded tiles, and the memory-cache key includes the
dataset/index ID. Never reuse an ID for changed content or switch only the
source or only the index. Local-source requests do not fall back to network.

## Health checks and observability

After startup, verify the tile service health endpoint and diagnostics:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3004/
Invoke-RestMethod http://127.0.0.1:3004/cache_status
Invoke-RestMethod http://127.0.0.1:3004/metrics
```

Use the configured service port if it differs from 3004. Confirm
`source_mode` is `local`, `source_generation` matches the deployed dataset/index
ID, `read_only` is true, and requests increase
`local_source_reads` or `memory_hits`. `disk_hits` and `downloads` should not
increase for local-source reads. A request for a missing or malformed source
tile should fail with HTTP 503 from `/canvas_buffer`; the structured response
contains a safe error code and short code, not a filesystem path. The root
supervisor's `/healthz` and `/readyz` endpoints are available only when running
the full stack. Monitor the tile service's dated logs for startup failures and
source-read errors.

## Recovery

- **Preflight cannot read/search the source:** check the configured absolute
  path, mount presence, parent-directory traversal permissions, file read
  permissions, and the service/container UID and GID. Rerun `--check`.
- **Invalid layout or representative tile:** restore a complete corpus with
  `LNN/<short-code>.gz` files and valid gzip-compressed JSON.
  Preflight checks one representative tile; also validate the completeness of
  the dataset before publishing it.
- **Compiled index is missing, incomplete, or mismatched:** restore the
  matching packet manifest and packet files, then run `npm run tiles:index`.
  If necessary, run `npm run tiles:refresh` first. Re-run preflight before
  starting the service.
- **A tile fails after startup:** inspect `/cache_status` fields
  `last_source_error`, `local_source_failures`, and `source_generation`, then
  inspect the tile file and mount permissions on the host. Local-source mode
  deliberately fails closed and will not fetch a replacement over the network.
- **A new corpus/index pairing fails health checks:** stop the service and
  restore the previous known-good manifest, compiled index, and dataset/index
  ID together; then restart and verify health. Do not clear
  production tables, mutate a live generation, or reset cache data as a routine
  recovery measure.

For remote-cache deployments, continue using the normal supervisor procedure.
If a remote cache needs to be repopulated, the service fetches missing files
from its configured source; the local-source startup command is not needed.

## Main application Compose deployment on EC2

For the main Fracto stack on EC2, keep `compose.yaml` as the base and opt into
the local source with `compose.local-tiles.yaml`. The overlay sets
`FRACTO_TILE_SOURCE_MODE=local`, points the container at the fixed path
`/mnt/fracto-tile-source`, supplies the dataset/index ID, and bind-mounts the
host source directory read-only. It also gives the maintenance `index-refresh`
container the same path and ID settings so index work uses the release
identity. The base Compose file remains remote-cache by default.
In local mode, the root supervisor checks mount permissions, layout, the
manifest/index pairing, and an indexed representative tile before opening its
main listener or starting child services. A failed preflight stops startup
with a corrective error. Tile reads remain fail-closed without network
fallback or demand-cache writes.

Add the following non-secret values to the root deployment `.env` on the EC2
host, using the absolute path to the permanent tile corpus:

```dotenv
FRACTO_TILE_SOURCE_HOST_DIR=/srv/fracto/tiles
FRACTO_TILE_SOURCE_GENERATION=production-tiles-v1
```

The directory must exist before Compose starts; the overlay disables automatic
creation of a missing host path. It must contain the paired release manifest
and tile files, and be readable and traversable by the container's service
user. The bind mount is read-only. Keep these deployment values out of Git.

Use the documented release-switch sequence for first launch and every update.
It runs the full supervisor preflight before Compose starts, and Compose waits
for `/readyz` before reporting a successful start. The tile service remains
available to nginx on host loopback port 3004; no public tile port is needed.
To use the standard remote-cache mode again, recreate `fracto` with
`compose.yaml` alone.
