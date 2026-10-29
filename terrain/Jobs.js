import FractoIndexedTiles from "../../../sdk/FractoIndexedTiles.js";
import {
  terrain_region,
  terrain_level,
  plan_terrain_tiles,
} from "../../../sdk/terrain/Plan.js";
import { plan_mesh_transform } from "../../../sdk/terrain/TransformPlan.js";
import { internal_service_headers } from "../../../utils/service_authorization.js";
import { create_mesh_job_queue } from "./Queue.js";

const read_record = async (id, req) => {
  let response;
  try {
    response = await fetch(
      `http://127.0.0.1:${Number(process.env.FRACTO_DATA_PORT || 3002)}/minibrot/${id}/terrain-region`,
      {
        headers: internal_service_headers(
          req.headers.cookie ? { cookie: req.headers.cookie } : {},
        ),
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw Object.assign(new Error("Freeform display region unavailable"), {
      status: 503,
    });
  }
  if (!response.ok)
    throw Object.assign(new Error("Freeform display region unavailable"), {
      status: response.status === 404 ? 404 : 503,
    });
  return (await response.json()).result;
};
const failure = (res, error) =>
  res.status(error.status || 400).json({
    error: error.status
      ? error.message
      : "Unable to plan mesh construction from this region",
  });

export function create_terrain_cache_handlers({
  source_identity,
  cache_root,
  inventory_store = null,
  get_record = read_record,
  get_codes = (level) =>
    new Set(
      (
        FractoIndexedTiles.get_set_level("indexed", level)?.columns || []
      ).flatMap((column) => column.tiles.map((tile) => tile.short_code)),
    ),
  get_level = (level) => FractoIndexedTiles.get_set_level("indexed", level),
  create_worker,
  timeout_ms,
} = {}) {
  const queue = create_mesh_job_queue({
    source_identity,
    cache_root,
    inventory_store,
    create_worker,
    timeout_ms,
  });
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
        return res.status(202).json({ job: queue.enqueue(plan) });
      } catch (error) {
        return failure(res, error);
      }
    },
    start_region: (req, res) => {
      if (!inventory_store)
        return res.status(503).json({ error: "Mesh inventory unavailable" });
      try {
        const plan = plan_mesh_transform(
          req.body,
          get_level(req.body?.level),
          inventory_store.inventory,
        );
        return res.status(202).json({ job: queue.enqueue(plan) });
      } catch (error) {
        return failure(res, error);
      }
    },
    status: (req, res) => {
      const job = queue.get(req.params.id);
      return job
        ? res.json({ job })
        : res.status(404).json({ error: "Terrain cache job not found" });
    },
    cancel: async (req, res) => {
      const job = await queue.cancel(req.params.id);
      return job
        ? res.json({ job })
        : res.status(404).json({ error: "Terrain cache job not found" });
    },
  };
}
