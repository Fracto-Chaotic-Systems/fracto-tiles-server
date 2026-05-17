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
         console.log(`Processing ${file}:`, Object.keys(jsonData).length);
      }
   } catch (error) {
      console.error('Error processing folder:', error);
   }
}

processJsonFiles(`${TILES_DIR}/manifest`);
