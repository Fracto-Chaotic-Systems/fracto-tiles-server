import fs from 'fs'
import path from 'path'
import {qr} from "mathjs";

const TILES_DIR = '../../../tiles'

const inventory_path = (tile_path, short_codes) => {
   console.log(`tile_path ${tile_path}`, short_codes.length)
}

const processJsonFiles = async (directoryPath) => {
   try {
      const files = fs.readdirSync(directoryPath);
      const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
      let grand_total = 0
      let path_count = 0;
      const totals = {}
      for (const file of jsonFiles) {
         const filePath = path.join(directoryPath, file);
         const fileData = fs.readFileSync(filePath, 'utf-8');
         const jsonData = JSON.parse(fileData);
         const tile_paths = Object.keys(jsonData)
         let total = 0;
         for (const tile_path of tile_paths) {
            path_count++
            total += jsonData[tile_path].length
            grand_total += jsonData[tile_path].length
            inventory_path(tile_path, jsonData[tile_path])
         }
         totals[file] = total
      }
      console.log(totals);
      console.log('grand total', grand_total);
      console.log('path count', path_count
      qr);
   } catch (error) {
      console.error('Error processing folder:', error);
   }
}

processJsonFiles(`${TILES_DIR}/manifest`);
