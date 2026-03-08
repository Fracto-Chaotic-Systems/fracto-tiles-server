import {
   fill_canvas_buffer,
   init_canvas_buffer
} from "../../../sdk/FractoTileData.js";

export const handle_get_canvas_buffer = async (req, res) => {
   const width_px = parseInt(req.query.width_px)
   const scope = parseFloat(req.query.scope)
   const focal_point = {
      x: parseFloat(req.query.focal_point_x),
      y: parseFloat(req.query.focal_point_y),
   }
   const aspect_ratio = parseFloat(req.query.aspect_ratio)
   const resolution_factor = parseFloat(req.query.resolution_factor)
   const canvas_buffer = init_canvas_buffer(width_px, aspect_ratio);
   await fill_canvas_buffer(
      canvas_buffer,
      width_px,
      focal_point,
      scope,
      aspect_ratio,
      resolution_factor,
   )
   res.json({canvas_buffer})
}