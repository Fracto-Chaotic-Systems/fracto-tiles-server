import fs from 'node:fs';
import {traverseAndQuery} from "./handle_manifest.js";

const TILES_DIR = '../../../tiles'
const MANIFEST_DIR = `${TILES_DIR}/manifest`;

if (!fs.existsSync(MANIFEST_DIR)) {
   fs.mkdirSync(MANIFEST_DIR)
}

for (let digit_1 = 0; digit_1 < 4; digit_1++) {
   for (let digit_2 = 0; digit_2 < 4; digit_2++) {
      for (let digit_3 = 0; digit_3 < 4; digit_3++) {
         for (let digit_4 = 0; digit_4 < 4; digit_4++) {
            const subdir = `${digit_1}${digit_2}${digit_3}${digit_4}`
            const path_dir = `${TILES_DIR}/${subdir}`
            if (!fs.existsSync(path_dir)) {
               // console.log(`${path_dir} does not exist`)
               continue
            }
            const manifest = traverseAndQuery(path_dir, /\.gz$/, true);
            fs.writeFileSync(`${MANIFEST_DIR}/${subdir}.json`, JSON.stringify(manifest), 'utf8')
         }
      }
   }
}
