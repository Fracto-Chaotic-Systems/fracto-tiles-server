import {init_canvas_buffer, tiles_in_scope} from "../../../sdk/FractoTileData.js";

const MAX_LEVELS = 35

const fill_heat_map_buffer = (focal_point, scope, image_width, aspect_ratio) => {
   const heat_map_buffer = init_canvas_buffer(image_width, aspect_ratio);
   const all_tiles = new Array(MAX_LEVELS).fill([])
   for (let level = 4; level < MAX_LEVELS; level++) {
      all_tiles[level] = tiles_in_scope(level, focal_point, scope, aspect_ratio)
      if (all_tiles[level].length > 10000) {
         break;
      }
   }
   const increment = scope / image_width
   const leftmost = focal_point.x - scope / 2
   const topmost = focal_point.y + scope / 2
   for (let col = 0; col < image_width; col++) {
      const x = leftmost + col * increment
      for (let row = 0; row < image_width; row++) {
         const y = Math.abs(topmost - row * increment)
         let found_it = false
         for (let level = MAX_LEVELS - 1; level > 0; level--) {
            all_tiles[level].forEach((tile) => {
               if (found_it) {
                  return
               }
               if (x < tile.bounds.left || x > tile.bounds.right) {
                  return
               }
               if (y > tile.bounds.top || y < tile.bounds.bottom) {
                  return
               }
               heat_map_buffer[col][row] = [0, level * 100]
               found_it = true
            })
            if (found_it) {
               break
            }
         }
      }
   }
   return heat_map_buffer
}

export const handle_heat_map_buffer = async (req, res) => {
   const width_px = parseInt(req.query.width_px)
   const focal_point = {
      x: parseFloat(req.query.focal_point_x),
      y: parseFloat(req.query.focal_point_y),
   }
   const scope = parseFloat(req.query.scope)
   const aspect_ratio = 1
   const start = performance.now()
   const heat_map_buffer = fill_heat_map_buffer(focal_point, scope, width_px, aspect_ratio);
   const end = performance.now()
   console.log(`heat_map_buffer (width=${req.query.width_px}) took ${end - start}ms`)
   res.json({heat_map_buffer})
}