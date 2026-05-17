import fs from 'fs'
import path from 'path'

const TILES_DIR = '../../../tiles'

const processJsonFiles = async (directoryPath) => {
   try {
      const files = fs.readdirSync(directoryPath);
      const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
      for (const file of jsonFiles) {
         const filePath = path.join(directoryPath, file);
         const fileData = fs.readFileSync(filePath, 'utf-8');
         const jsonData = JSON.parse(fileData);
         const tile_paths = Object.keys(jsonData)
         for (const tile_path of tile_paths) {
            console.log(`tile_path: ${tile_path}`);
         }
      }
   } catch (error) {
      console.error('Error processing folder:', error);
   }
}

processJsonFiles(`${TILES_DIR}/manifest`);
