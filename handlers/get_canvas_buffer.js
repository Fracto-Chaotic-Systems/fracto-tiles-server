import {raster_worker_pool} from '../raster_worker_pool.js'

export const handle_get_canvas_buffer = async (req, res) => {
   try {
      const width_px = parseInt(req.query.width_px)
      const scope = parseFloat(req.query.scope)
      const focal_point = {
         x: parseFloat(req.query.focal_point_x),
         y: parseFloat(req.query.focal_point_y),
      }
      const aspect_ratio = parseFloat(req.query.aspect_ratio)
      const resolution_factor = parseFloat(req.query.resolution_factor)
      const strategy = req.query.strategy || process.env.FRACTO_RASTER_STRATEGY || 'turbo'
      const canvas_buffer = await raster_worker_pool.run({
         type: 'canvas_buffer', width_px, focal_point, scope, aspect_ratio,
         resolution_factor, strategy,
      })
      res.json({canvas_buffer})
   } catch (error) {
      res.json({error})
   }
}
