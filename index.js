import express from 'express'
import chalk from "chalk";
import {FRACTO_TILES_PORT} from "../../constants.js";

import {handle_main_status} from "./handlers/status.js";
import {handle_tile} from "./handlers/tile.js";
import {initialize_coverage} from "../../sdk/FractoCoverageUtils.js";
import {handle_logs} from "./handlers/logs.js";
import FractoIndexedTiles from "../../sdk/FractoIndexedTiles.js";
import {get_manifest} from "../../sdk/FractoTileData.js";
import {handle_get_canvas_buffer} from "./handlers/get_canvas_buffer.js";
import {handle_tile_coverage} from "./handlers/tile_coverage.js";
import {handle_heat_map_buffer} from "./handlers/heat_map.js";
import {handle_get_hyper_canvas_buffer} from "./handlers/get_hyper_canvas_buffer.js";
import FractoTileCache from "../../sdk/FractoTileCache.js";
import {handle_manifest} from "./handlers/handle_manifest.js";

const app = express();

app.use((req, res, next) => {
   res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Specify allowed methods
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With'); // Specify allowed headers
   next();
});

FractoIndexedTiles.init_tile_sets()

let latest_level = 0
get_manifest((file) => {
   const level_str = file.manifest_file
      .slice(30)
      .replace('.json', '')
   const underscore_pos = level_str.indexOf('_')
   const level = underscore_pos > 0
      ? level_str.slice(0, underscore_pos)
      : level_str
   if (level !== latest_level) {
      console.log('indexed level', level)
      latest_level = level
   }
}, () => {
   // Start the server and listen for incoming requests
   app.listen(FRACTO_TILES_PORT, () => {
      console.log(chalk.green(`fracto-tiles-server is running on http://localhost:${FRACTO_TILES_PORT}`));
      initialize_coverage(() => {
         console.log(chalk.blue(`coverage is initialized, tile generation may commense`))
      })
   });
})

app.get('/', handle_main_status)
app.get('/tile', handle_tile)
app.get('/logs', handle_logs)

app.get("/tile_coverage", handle_tile_coverage)
app.get("/canvas_buffer", handle_get_canvas_buffer)
app.get("/hyper_canvas_buffer", handle_get_hyper_canvas_buffer)
app.get("/heat_map_buffer", handle_heat_map_buffer)
app.get("/manifest", handle_manifest)

setInterval(() => {
   FractoTileCache.trim_cache()
}, 10000)