import path from 'path';
import fs from "fs";

const SEPARATOR = path.sep;
const TILES_DIR = '../../../tiles'

let path_count = 0
const manifest = {}

export const traverseAndQuery = (dir, filter = /.*/) => {

   const native_path = dir.replace(`..${SEPARATOR}..${SEPARATOR}..${SEPARATOR}tiles${SEPARATOR}`, '')
   const relative_path = native_path.replaceAll(SEPARATOR, '/')

   manifest[relative_path] = []
   path_count++

   if (path_count % 1000 === 0) {
      console.log(`${path_count} bins`)
   }

   const entries = fs.readdirSync(dir, {withFileTypes: true});
   for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
         traverseAndQuery(fullPath, filter);
      } else if (entry.isFile() && filter.test(entry.name)) {
         const short_code = entry.name.replace('.gz', '')
         manifest[relative_path].push(short_code)
      }
   }
   return manifest
};

export const handle_manifest = async (req, res) => {
   const manifest = traverseAndQuery(TILES_DIR, /\.gz$/);
   fs.writeFile(`${TILES_DIR}/manifest.json`, JSON.stringify(manifest), 'utf8', (err) => {
      if (err) {
         console.error("An error occurred while writing JSON Object to File.", err);
         return;
      }
      console.log("JSON file has been saved.");
   });
   res.json({result: "success"})
}
