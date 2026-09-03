import {Chalk} from 'chalk'
import {parentPort, workerData} from 'worker_threads'

const worker_label = `tiles-worker-${workerData.worker_index}`
// Force ANSI output for worker labels. The log viewer also understands these
// sequences, so the colors survive persistence and Docker's non-TTY output.
const worker_chalk = new Chalk({level: 1})
const worker_color = [worker_chalk.magenta, worker_chalk.cyan, worker_chalk.green,
   worker_chalk.yellow, worker_chalk.blue, worker_chalk.red, worker_chalk.white,
   worker_chalk.gray][(workerData.worker_index - 1) % 8]
const prefix = message => worker_color(`[${worker_label}]`) + ` ${message}`
const original_log = console.log
const original_error = console.error
console.log = (...args) => original_log(prefix(args.join(' ')))
console.error = (...args) => original_error(prefix(args.join(' ')))

const {fill_canvas_buffer, init_canvas_buffer} = await import('../../sdk/FractoTileData.js')
const {load_tile_index_cache} = await import('../../sdk/FractoTileIndexCache.js')
const {fill_hyper_canvas_buffer} = await import('./handlers/get_hyper_canvas_buffer.js')

// Each worker owns an index instance because ordinary JavaScript objects are
// not shared between worker threads. The filesystem tile cache remains shared.
const cache_metadata = load_tile_index_cache()
console.log(`tile index ready (${cache_metadata.tile_count} tiles)`)

parentPort.on('message', async ({id, type, width_px, focal_point, scope, aspect_ratio, resolution_factor, strategy}) => {
   try {
      const canvas_buffer = init_canvas_buffer(width_px, aspect_ratio)
      if (type === 'canvas_buffer') {
         await fill_canvas_buffer(canvas_buffer, width_px, focal_point, scope,
            aspect_ratio, resolution_factor, null, null, strategy)
      } else if (type === 'hyper_canvas_buffer') {
         await fill_hyper_canvas_buffer(canvas_buffer, width_px, focal_point, scope, aspect_ratio)
      } else {
         throw new Error(`Unsupported raster worker job: ${type}`)
      }
      parentPort.postMessage({id, canvas_buffer})
   } catch (error) {
      parentPort.postMessage({id, error: error instanceof Error ? error.message : String(error)})
   }
})
