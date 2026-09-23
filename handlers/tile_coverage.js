import {detect_coverage} from "@fracto/sdk/FractoCoverageUtils.js";

export const handle_tile_coverage = async (req, res) => {
   const scope = parseFloat(req.query.scope)
   const re = parseFloat(req.query.re)
   const im = parseFloat(req.query.im)
   const focal_point = {
      x: re,
      y: im,
   }
   const coverage = await detect_coverage(focal_point, scope)
   // console.log('coverage', coverage)
   res.json({coverage})
}
