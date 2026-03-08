import {detect_coverage} from "../../../sdk/FractoCoverageUtils.js";

export const handle_tile_coverage = async (req, res) => {
   const scope = parseFloat(req.query.scope)
   const focal_point = JSON.parse(req.query.focal_point)
   const coverage = detect_coverage(focal_point, scope)
   // console.log('coverage', coverage)
   res.json({coverage})
}