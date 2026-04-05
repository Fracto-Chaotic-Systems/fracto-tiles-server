import {
   init_canvas_buffer
} from "../../../sdk/FractoTileData.js";
import FractoHyperCalc from "../../../sdk/FractoHyperCalc.js";

export const fill_hyper_canvas_buffer = async (
   canvas_buffer,
   width_px,
   focal_point,
   scope,
   aspect_ratio) => {
   const canvas_increment = scope / width_px
   const height_px = width_px * aspect_ratio
   const horz_scale = new Array(width_px)
   for (let horz_x = 0; horz_x < width_px; horz_x++) {
      horz_scale[horz_x] = focal_point.x + (horz_x - width_px / 2) * canvas_increment
   }
   const vert_scale = new Array(height_px)
   for (let vert_y = 0; vert_y < height_px; vert_y++) {
      vert_scale[vert_y] = Math.abs(focal_point.y - (vert_y - height_px / 2) * canvas_increment)
   }
   for (let canvas_x = 0; canvas_x < width_px; canvas_x++) {
      const x = horz_scale[canvas_x]
      console.log('x', x)
      for (let canvas_y = 0; canvas_y < height_px; canvas_y++) {
         const y = vert_scale[canvas_y]
         const {pattern, iteration} = FractoHyperCalc.calc(x, y)
         canvas_buffer[canvas_x][canvas_y] = [pattern, iteration]
      }
   }
}

export const handle_get_hyper_canvas_buffer = async (req, res) => {
   const width_px = parseInt(req.query.width_px)
   const scope = parseFloat(req.query.scope)
   const focal_point = {
      x: parseFloat(req.query.focal_point_x),
      y: parseFloat(req.query.focal_point_y),
   }
   const aspect_ratio = parseFloat(req.query.aspect_ratio)
   const canvas_buffer = init_canvas_buffer(width_px, aspect_ratio);
   console.log('handle_get_hyper_canvas_buffer filling buffer')
   fill_hyper_canvas_buffer(
      canvas_buffer,
      width_px,
      focal_point,
      scope,
      aspect_ratio,
   )
   console.log('handle_get_hyper_canvas_buffer returns')
   res.json({canvas_buffer})
}