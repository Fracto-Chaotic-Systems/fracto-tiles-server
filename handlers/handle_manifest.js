import path from 'path';
import fs from "fs";
import chalk from "chalk";
import {TILE_DATA_DIRECTORY} from '../../../sdk/FractoTilePaths.js'

const SEPARATOR = path.sep;
const TILES_DIR = TILE_DATA_DIRECTORY

let file_count = 0
let manifest = {}

export const traverseAndQuery = (dir, filter = /.*/, is_root = false) => {
   const native_path = path.relative(TILES_DIR, dir)
   const relative_path = native_path.replaceAll(SEPARATOR, '/')
   const key_path = relative_path

   if (is_root) {
      manifest = {}
      file_count = 0
      console.log('--------------------')
      console.log(chalk.cyan(`${key_path}`))
   }

   manifest[key_path] = []

   const entries = fs.readdirSync(dir, {withFileTypes: true});
   for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
         traverseAndQuery(fullPath, filter);
      } else if (entry.isFile() && filter.test(entry.name)) {
         const short_code = entry.name.replace('.gz', '')
         file_count++
         if (file_count % 1000 === 0) {
            console.log(file_count)
         }
         manifest[key_path].push(short_code)
      }
   }

   if (is_root) {
      if (file_count) {
         console.log(`total for ${key_path}`, file_count)
      }
   }
   return manifest
};

export const handle_manifest = async (req, res) => {
   const manifest = traverseAndQuery(TILES_DIR, /\.gz$/, true);
   fs.writeFile(`${TILES_DIR}/manifest.json`, JSON.stringify(manifest), 'utf8', (err) => {
      if (err) {
         console.error("An error occurred while writing JSON Object to File.", err);
         return;
      }
      console.log(`JSON file has been saved.`);
   });
   res.json({result: "success"})
}
