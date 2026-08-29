import FractoTileCache from '../../../sdk/FractoTileCache.js'

const HISTORY_LIMIT = 60
const HISTORY_INTERVAL_MS = 5000
const history = []

const record_cache_status = () => {
   history.push({
      timestamp: new Date().toISOString(),
      ...FractoTileCache.get_stats(),
   })
   if (history.length > HISTORY_LIMIT) history.shift()
}

const history_timer = setInterval(record_cache_status, HISTORY_INTERVAL_MS)
history_timer.unref?.()

export const handle_cache_status = (req, res) => {
   res.json({
      ...FractoTileCache.get_stats(),
      history: [...history],
   })
}
