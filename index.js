import express from 'express'
import chalk from 'chalk'
const FRACTO_TILES_PORT = Number(process.env.FRACTO_TILES_PORT || 3004)

import {handle_main_status} from './handlers/status.js'
import {handle_tile} from './handlers/tile.js'
import {
   initialize_coverage,
} from '@fracto/sdk/FractoCoverageUtils.js'
import {handle_logs} from './handlers/logs.js'
import {handle_get_canvas_buffer} from './handlers/get_canvas_buffer.js'
import {handle_tile_coverage} from './handlers/tile_coverage.js'
import {handle_heat_map_buffer} from './handlers/heat_map.js'
import {handle_get_hyper_canvas_buffer} from './handlers/get_hyper_canvas_buffer.js'
import FractoTileCache from '@fracto/sdk/FractoTileCache.js'
import {load_tile_index_cache} from '@fracto/sdk/FractoTileIndexCache.js'
import {handle_manifest} from './handlers/handle_manifest.js'
import {handle_cache_status} from './handlers/cache_status.js'
import {handle_metrics, record_request} from './handlers/metrics.js'
import {handle_benchmark_results} from './handlers/benchmark_results.js'
import {handle_preload_coverage} from './handlers/preload_coverage.js'
import { handle_automation, handle_automation_create, handle_automation_claim, handle_automation_update } from './handlers/handle_automation.js'
import { require_enabled_user_if_configured } from '../../utils/service_authorization.js'

let latest_level = null
console.log('Loading compiled tile index cache...')
const cache_metadata = load_tile_index_cache(progress => {
   if (progress.level !== latest_level) {
      latest_level = progress.level
      console.log(`Loaded cached level ${progress.level}`)
   }
})
console.log(`Loaded ${cache_metadata.packet_count} cached packets for ${cache_metadata.tile_count} tiles`)
const format_time_ago = timestamp => {
   const elapsed_seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000))
   if (elapsed_seconds < 60) return `${elapsed_seconds} sec ago`
   const elapsed_minutes = Math.floor(elapsed_seconds / 60)
   if (elapsed_minutes < 60) return `${elapsed_minutes} min ago`
   const elapsed_hours = Math.floor(elapsed_minutes / 60)
   if (elapsed_hours < 24) return `${elapsed_hours} hr ago`
   const elapsed_days = Math.floor(elapsed_hours / 24)
   return `${elapsed_days} day${elapsed_days === 1 ? '' : 's'} ago`
}
if (cache_metadata.created_at) {
   console.log(`Tile index generated at ${cache_metadata.created_at} (${format_time_ago(cache_metadata.created_at)})`)
}

const app = express()
// Automation jobs may contain thousands of shortcodes. Keep this configurable
// for installations with larger or stricter request-size requirements.
const json_body_limit = process.env.FRACTO_JSON_BODY_LIMIT || '25mb'
app.use(express.json({limit: json_body_limit}))
app.use((req, res, next) => {
   const started = Date.now()
   res.once('finish', () => record_request(res, Date.now() - started))
   const origin = req.headers.origin
   const ui_origin = process.env.FRACTO_UI_ORIGIN || `http://localhost:${process.env.FRACTO_UI_PORT || 3006}`
   const credentialed = Boolean(origin && (origin === ui_origin || process.env.FRACTO_ALLOW_CORS_ALL === 'true'))
   res.setHeader('Access-Control-Allow-Origin', credentialed ? origin : '*')
   res.vary('Origin')
   if (credentialed) res.setHeader('Access-Control-Allow-Credentials', 'true')
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-Fracto-Service-Token')
   if (req.method === 'OPTIONS') return res.status(204).end()
   next()
})

app.listen(FRACTO_TILES_PORT, () => {
   console.log(chalk.green(`fracto-tiles-server is running on http://localhost:${FRACTO_TILES_PORT}`))
   initialize_coverage(() => {
      console.log(chalk.blue('local indexed coverage is initialized; remote classification preload is awaiting supervisor'))
   })
})

app.get('/', handle_main_status)
app.use((req, res, next) => req.path === '/' ? next() : require_enabled_user_if_configured(req, res, next))
app.get('/tile', handle_tile)
app.get('/logs', handle_logs)
app.get('/tile_coverage', handle_tile_coverage)
app.get('/canvas_buffer', handle_get_canvas_buffer)
app.get('/hyper_canvas_buffer', handle_get_hyper_canvas_buffer)
app.get('/heat_map_buffer', handle_heat_map_buffer)
app.get('/manifest', handle_manifest)
app.get('/cache_status', handle_cache_status)
app.get('/metrics', handle_metrics)
app.get('/benchmark_results', handle_benchmark_results)
app.get('/preload_coverage', handle_preload_coverage)
app.get('/automation', handle_automation)
app.post('/automation', handle_automation_create)
app.post('/automation/claim', handle_automation_claim)
app.put('/automation/:id', handle_automation_update)

setInterval(() => {
   FractoTileCache.trim_cache()
}, 10000)
