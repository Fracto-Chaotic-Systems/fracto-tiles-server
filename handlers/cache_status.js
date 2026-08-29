import FractoTileCache from '../../../sdk/FractoTileCache.js'

export const handle_cache_status = (req, res) => {
   res.json(FractoTileCache.get_stats())
}
