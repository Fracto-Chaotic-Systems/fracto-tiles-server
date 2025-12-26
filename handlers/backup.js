import fs from "fs";
import https from "https";
import network from "../../../config/network.json" with {type: "json"};
import FractoIndexedTiles from "../../../sdk/FractoIndexedTiles.js";
import path from "path";

const SEPARATOR = path.sep;

const TILES_DIR = `..${SEPARATOR}..${SEPARATOR}..${SEPARATOR}tiles`;
if (!fs.existsSync(TILES_DIR)) {
   fs.mkdirSync(TILES_DIR)
}

const dir_from_short_code = (short_code) => {
   const pieces = short_code.match(/.{1,4}/g);
   const last_piece = pieces[pieces.length - 1];
   if (last_piece.length < 4) {
      pieces.pop()
   }
   const joined_pieces = pieces.join(SEPARATOR)
   const level_dir = joined_pieces.length
      ? `${TILES_DIR}${SEPARATOR}${joined_pieces}`
      : TILES_DIR
   if (!fs.existsSync(level_dir)) {
      fs.mkdirSync(level_dir, {recursive: true})
   }
   // console.log(`${short_code}: ${level_dir}`)
   return level_dir;
}

const https_get = (remote_filepath, localSavePath) => {
   return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(localSavePath);
      const remoteGzUrl = `${network["fracto-prod"]}/${remote_filepath}`
      https.get(remoteGzUrl, (response) => {
         response.pipe(fileStream);
         fileStream.on('finish', () => {
            fileStream.close();
            resolve()
         });
         fileStream.on('error', (err) => {
            console.error('Error writing to file:', err);
            resolve()
         });
      }).on('error', (err) => {
         console.error('Error downloading file:', err);
         resolve()
      });
   })
}

const backup_short_codes = async (short_codes, starting_index, cb) => {
   let index = starting_index
   let remote_filepath
   let localSavePath
   let count = 0
   while (index < short_codes.length) {
      const short_code = short_codes.at(index++)
      const level = short_code.length
      const remaining = short_codes.length - index
      if (remaining % 100 === 0) {
         console.log(`[${level}] ${remaining} remain (${count})`)
         count = 0
      }

      const naught = level < 10 ? '0' : ''
      const level_dirname = `L${naught}${level}`
      const coded_dir = dir_from_short_code(short_code)

      localSavePath = `${coded_dir}${SEPARATOR}${short_code}.gz`
      if (!fs.existsSync(localSavePath)) {
         count++
         remote_filepath = `${level_dirname}/${short_code}.gz`
         await https_get(remote_filepath, localSavePath)
      }
   }
   cb()
}

const backup_level_short_codes = (level_short_codes, cb) => {
   if (!level_short_codes.length) {
      console.log('complete')
      cb()
      return
   }
   const short_codes = level_short_codes.pop()
   const level = short_codes[0].length
   console.log(`backing up level ${level} (${short_codes.length} tiles)`)
   backup_short_codes(short_codes, 0, () => {
      backup_level_short_codes(level_short_codes, cb)
   })
}

FractoIndexedTiles.load_short_codes('indexed', short_codes => {
   const level_short_codes = []
   for (let level = 30; level > 2; level--) {
      const short_codes_for_level = short_codes.filter(short_code => short_code.length === level)
      level_short_codes.push(short_codes_for_level)
   }
   backup_level_short_codes(level_short_codes, () => {
      console.log('complete')
   })
})
