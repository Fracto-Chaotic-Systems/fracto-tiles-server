import path from "path";
import fs from "fs";
import {TILE_DATA_DIRECTORY} from "@fracto/sdk/FractoTilePaths.js";

const SEPARATOR = path.sep;
const TILES_DIR = TILE_DATA_DIRECTORY;

export const dir_from_short_code = (short_code) => {
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

export { bounds_from_short_code } from "@fracto/sdk/utils/TileBounds.js";
