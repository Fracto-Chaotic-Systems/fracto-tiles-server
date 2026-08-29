import express from 'express'
import chalk from 'chalk'
import {FRACTO_TILES_PORT} from '../../constants.js'

import {handle_main_status} from './handlers/status.js'
import {handle_tile} from './handlers/tile.js'
import {initialize_coverage} from '../../sdk/FractoCoverageUtils.js'
import {handle_logs} from './handlers/logs.js'
import {handle_get_canvas_buffer} from './handlers/get_canvas_buffer.js'
import {handle_tile_coverage} from './handlers/tile_coverage.js'
import {handle_heat_map_buffer} from './handlers/heat_map.js'
import {handle_get_hyper_canvas_buffer} from './handlers/get_hyper_canvas_buffer.js'
import FractoTileCache from '../../sdk/FractoTileCache.js'
import {load_tile_index_cache} from '../../sdk/FractoTileIndexCache.js'
import {handle_manifest} from './handlers/handle_manifest.js'
import {handle_cache_status} from './handlers/cache_status.js'

let latest_level = null
console.log('Loading compiled tile index cache...')
const cache_metadata = load_tile_index_cache(progress => {
   if (progress.level !== latest_level) {
      latest_level = progress.level
      console.log(`Loaded cached level ${progress.level}`)
   }
})
console.log(`Loaded ${cache_metadata.packet_count} cached packets for ${cache_metadata.tile_count} tiles`)

const app = express()
app.use((req, res, next) => {
   res.setHeader('Access-Control-Allow-Origin', '*')
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')
   next()
})

app.listen(FRACTO_TILES_PORT, () => {
   console.log(chalk.green(`fracto-tiles-server is running on http://localhost:${FRACTO_TILES_PORT}`))
   initialize_coverage(() => {
      console.log(chalk.blue('coverage is initialized, tile generation may commence'))
   })
})

app.get('/', handle_main_status)
app.get('/tile', handle_tile)
app.get('/logs', handle_logs)
app.get('/tile_coverage', handle_tile_coverage)
app.get('/canvas_buffer', handle_get_canvas_buffer)
app.get('/hyper_canvas_buffer', handle_get_hyper_canvas_buffer)
app.get('/heat_map_buffer', handle_heat_map_buffer)
app.get('/manifest', handle_manifest)
app.get('/cache_status', handle_cache_status)

setInterval(() => {
   FractoTileCache.trim_cache()
}, 10000)
