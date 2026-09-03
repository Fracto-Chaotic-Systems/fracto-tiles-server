import os from 'os'
import {Worker} from 'worker_threads'
import {fileURLToPath} from 'url'

const worker_path = fileURLToPath(new URL('./raster_worker.js', import.meta.url))
const configured_count = Number(process.env.FRACTO_TILE_WORKER_COUNT || 2)
const worker_count = Number.isFinite(configured_count)
   ? Math.min(8, Math.max(1, Math.floor(configured_count)))
   : Math.min(4, Math.max(1, os.cpus().length - 1))
const configured_heap_mb = Number(process.env.FRACTO_TILE_WORKER_HEAP_MB)
const worker_options = Number.isFinite(configured_heap_mb) && configured_heap_mb > 0
   ? {resourceLimits: {maxOldGenerationSizeMb: Math.floor(configured_heap_mb)}}
   : {}

class RasterWorkerPool {
   workers = []
   queue = []
   next_job_id = 1

   constructor() {
      for (let index = 0; index < worker_count; index++) this.add_worker(index)
      console.log(`tile raster worker pool started with ${worker_count} workers`)
   }

   add_worker = index => {
      const worker = new Worker(worker_path, {
         ...worker_options,
         workerData: {worker_index: index + 1},
      })
      const state = {worker, index, busy: false, job: null}
      worker.on('message', message => this.on_message(state, message))
      worker.on('error', error => this.on_error(state, error))
      worker.on('exit', code => {
         if (code !== 0) this.on_error(state, new Error(`raster worker exited with code ${code}`))
      })
      this.workers[index] = state
   }

   run = payload => new Promise((resolve, reject) => {
      this.queue.push({id: this.next_job_id++, payload, resolve, reject})
      this.dispatch()
   })

   dispatch = () => {
      for (const state of this.workers) {
         if (!state || state.busy || !this.queue.length) continue
         const job = this.queue.shift()
         state.busy = true
         state.job = job
         state.worker.postMessage({id: job.id, ...job.payload})
      }
   }

   on_message = (state, message) => {
      if (!state.job || message.id !== state.job.id) return
      const job = state.job
      state.busy = false
      state.job = null
      if (message.error) job.reject(new Error(message.error))
      else job.resolve(message.canvas_buffer)
      this.dispatch()
   }

   on_error = (state, error) => {
      if (state.job) state.job.reject(error)
      state.busy = false
      state.job = null
      // The worker is replaced so a transient worker failure does not take
      // down the HTTP server or permanently reduce pool capacity.
      state.worker.terminate().finally(() => {
         this.add_worker(state.index)
         this.dispatch()
      })
   }
}

export const raster_worker_pool = new RasterWorkerPool()
