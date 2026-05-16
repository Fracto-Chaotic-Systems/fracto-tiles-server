import fs from 'node:fs';
import {traverseAndQuery} from "./handle_manifest.js";

const TILES_DIR = '../../../tiles'
const manifest = traverseAndQuery(TILES_DIR, /\.gz$/);

fs.writeFile(`${TILES_DIR}/manifest.json`, JSON.stringify(manifest), 'utf8', (err) => {
   if (err) {
      console.error("An error occurred while writing JSON Object to File.", err);
      return;
   }
   console.log("JSON file has been saved.");
});
