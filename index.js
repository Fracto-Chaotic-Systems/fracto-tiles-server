import express from 'express'
import chalk from "chalk";
import {FRACTO_TILES_PORT} from "../../constants.js";

import {handle_main_status} from "./handlers/status.js";
import {handle_tile} from "./handlers/tile.js";
import {initialize_coverage} from "../../sdk/FractoCoverageUtils.js";
import {handle_logs} from "./handlers/logs.js";

const app = express();

app.use((req, res, next) => {
   res.setHeader('Access-Control-Allow-Origin', '*'); // Allow all origins
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); // Specify allowed methods
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With'); // Specify allowed headers
   next();
});

initialize_coverage(() => {
   // Start the server and listen for incoming requests
   app.listen(FRACTO_TILES_PORT, () => {
      console.log(chalk.green(`fracto-tiles-server is running on http://localhost:${FRACTO_TILES_PORT}`));
   });
})


app.get('/', handle_main_status)
app.get('/tile', handle_tile)
app.get('/logs', handle_logs)
