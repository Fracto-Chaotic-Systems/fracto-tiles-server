import { plan_runtime_terrain } from "../../../sdk/terrain/RuntimePlan.js";

export function create_runtime_terrain_handler(inventory, count_tiles) {
  return (req, res) => {
    try {
      const plan = plan_runtime_terrain(inventory, req.query, count_tiles);
      res.setHeader("Cache-Control", "no-store");
      return res.json(plan);
    } catch (error) {
      const status = error.code === "MESH_TERRAIN_VIEW" ? 400 : 503;
      return res
        .status(status)
        .json({
          error:
            status === 400
              ? "Invalid terrain request"
              : "Terrain inventory unavailable",
        });
    }
  };
}
