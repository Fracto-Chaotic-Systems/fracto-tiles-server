import {init_canvas_buffer, tiles_in_scope} from "@fracto/sdk/FractoTileData.js";
import {detect_coverage} from "@fracto/sdk/FractoCoverageUtils.js";

const MAX_LEVELS = 35

const fill_heat_map_buffer = (all_level_tiles, focal_point, scope, image_width, aspect_ratio) => {
   const heat_map_buffer = init_canvas_buffer(image_width, aspect_ratio);
   const image_height = heat_map_buffer[0]?.length || 0
   if (!image_height) return heat_map_buffer

   const increment = scope / image_width
   const leftmost = focal_point.x - scope / 2
   const topmost = focal_point.y + scope / 2

   // A flat byte mask avoids repeatedly scanning all candidate tiles for each
   // pixel and keeps the existing nested-array response format unchanged.
   const filled = new Uint8Array(image_width * image_height)
   const clamp = (value, minimum, maximum) =>
      Math.max(minimum, Math.min(maximum, value))
   const fill_rows = (col_start, col_end, value_min, value_max, level) => {
      // The heat-map coordinate system uses abs(topmost - row * increment),
      // so each positive tile interval has a mirrored negative interval.
      const row_start = clamp(Math.ceil((topmost - value_max) / increment), 0, image_height - 1)
      const row_end = clamp(Math.floor((topmost - value_min) / increment), 0, image_height - 1)
      if (row_end < row_start) return
      for (let col = col_start; col <= col_end; col++) {
         const column_offset = col * image_height
         for (let row = row_start; row <= row_end; row++) {
            const index = column_offset + row
            if (filled[index]) continue
            heat_map_buffer[col][row] = [0, level]
            filled[index] = 1
         }
      }
   }
   for (let level = MAX_LEVELS - 1; level > 0; level--) {
      const level_tiles = all_level_tiles[level] || []
      for (const tile of level_tiles) {
      const bounds = tile?.bounds
      if (!bounds) continue
      const value_min = Math.max(0, bounds.bottom)
      const value_max = Math.max(0, bounds.top)
      if (value_max < value_min) continue
      const col_start = clamp(Math.ceil((bounds.left - leftmost) / increment), 0, image_width - 1)
      const col_end = clamp(Math.floor((bounds.right - leftmost) / increment), 0, image_width - 1)
      if (col_end < col_start) continue
      fill_rows(col_start, col_end, value_min, value_max, level)
      if (value_min > 0) {
         fill_rows(col_start, col_end, -value_max, -value_min, level)
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
   const index_start = performance.now()
   const all_level_tiles = new Array(MAX_LEVELS).fill([])
   for (let level = 4; level < MAX_LEVELS; level++) {
      all_level_tiles[level] = tiles_in_scope(level, focal_point, scope, aspect_ratio)
      if (all_level_tiles[level].length > 25000) {
         break;
      }
   }
   const index_lookup_ms = performance.now() - index_start
   const raster_start = performance.now()
   const heat_map_buffer = fill_heat_map_buffer(all_level_tiles, focal_point, scope, width_px, aspect_ratio);
   const rasterization_ms = performance.now() - raster_start
   // const coverage = all_level_tiles.map((level_tiles) => {
   //    return level_tiles.map((tile) => tile.short_code)
   // })
   const coverage_start = performance.now()
   const coverage = await detect_coverage(focal_point, scope, all_level_tiles)
   const coverage_ms = performance.now() - coverage_start
   const total_ms = performance.now() - start
   const timings_ms = {
      index_lookup: index_lookup_ms,
      rasterization: rasterization_ms,
      coverage: coverage_ms,
      total: total_ms,
   }
   console.log(`heat_map_buffer (width=${req.query.width_px}) took ${total_ms}ms`, timings_ms)
   res.json({heat_map_buffer, coverage, timings_ms})
}
