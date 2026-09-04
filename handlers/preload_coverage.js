import {preload_coverage_classifications} from '../../../sdk/FractoCoverageUtils.js'

export const handle_preload_coverage = (req, res) => {
   // Start in the background so the supervisor does not wait for large CSVs.
   preload_coverage_classifications().catch(error => {
      console.error('coverage classification preload failed', error.message)
   })
   res.json({status: 'started'})
}
