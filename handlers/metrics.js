const started_at = new Date().toISOString()
const metrics = {
   requests: 0,
   responses_by_status: {},
   duration_ms: 0,
   max_duration_ms: 0,
}

export const record_request = (response, duration_ms) => {
   metrics.requests++
   metrics.duration_ms += duration_ms
   metrics.max_duration_ms = Math.max(metrics.max_duration_ms, duration_ms)
   const status = String(response.statusCode)
   metrics.responses_by_status[status] = (metrics.responses_by_status[status] || 0) + 1
}

export const handle_metrics = (req, res) => {
   res.json({
      started_at,
      ...metrics,
      average_duration_ms: metrics.requests
         ? Math.round(metrics.duration_ms / metrics.requests * 100) / 100
         : 0,
   })
}
