import fs from 'fs'
import { fileURLToPath } from 'url';
import path from 'path';

const SEPARATOR = path.sep;

export const handle_logs = (req, res) => {
   const __filename = fileURLToPath(import.meta.url);
   const __dirname = path.dirname(__filename);
   const root_folder_length = __dirname.indexOf('servers')
   const root_folder = __dirname.slice(0, root_folder_length)
   try {
      const true_folder_name = root_folder.replaceAll('\\', SEPARATOR)
      const files = fs.readdirSync(`${true_folder_name}${SEPARATOR}logs`);
      const found_logfile = files.find((file) => file.indexOf('tiles') >= 0);
      const contents = fs.readFileSync(`${true_folder_name}${SEPARATOR}logs${SEPARATOR}${found_logfile}`, 'utf8');
      const lines = contents.split('\n')
      const response = {
         found_logfile,
         lines
      }
      res.json(response);
   } catch (err) {
      console.error("Error reading directory:", err);
      res.error(err);
   }
}
