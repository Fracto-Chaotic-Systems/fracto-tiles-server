import { mesh_heat_map } from "../../../sdk/terrain/HeatMap.js";

export function create_mesh_heat_map_handler(inventory) {
  return (req, res) => {
    try {
      const result = mesh_heat_map(inventory, req.query);
      // Availability can change without the navigator moving.
      res.setHeader("Cache-Control", "no-store");
      return res.json(result);
    } catch (error) {
      const status =
        error.code === "MESH_HEAT_MAP_VIEW"
          ? 400
          : error.code === "MESH_QUERY_LIMIT"
            ? 422
            : 503;
      return res
        .status(status)
        .json({
          error:
            status === 400
              ? "Invalid mesh heat-map viewport"
              : status === 422
                ? "Too many meshes in this view; narrow the scope"
                : "Mesh heat map unavailable",
        });
    }
  };
}
