import fs from 'fs'
import path from 'path'

const TILES_DIR = '../../../tiles'

const processJsonFiles = async (directoryPath) => {
   try {
      const files = fs.readdirSync(directoryPath);
      const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
      let grand_total = 0
      const totals = {}
      for (const file of jsonFiles) {
         const filePath = path.join(directoryPath, file);
         const fileData = fs.readFileSync(filePath, 'utf-8');
         const jsonData = JSON.parse(fileData);
         const tile_paths = Object.keys(jsonData)
         let total = 0;
         for (const tile_path of tile_paths) {
            total += jsonData[tile_path].length
            grand_total += jsonData[tile_path].length
            console.log(`tile_path: ${tile_path}`, jsonData[tile_path].length);
         }
         totals[file] = total
      }
      console.log(totals);
      console.log('grand total', grand_total);
   } catch (error) {
      console.error('Error processing folder:', error);
   }
}

processJsonFiles(`${TILES_DIR}/manifest`);
