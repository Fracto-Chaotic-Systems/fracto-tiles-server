import {collect_category_tiles} from "../../sdk/FractoCoverageUtils.js";
import {FRACTO_DATA_PORT} from "../../constants.js";
import {
   bounds_from_short_code,
   dir_from_short_code
} from "./tiles_utils.js";

const fetch_level_codes = async (level) => {
   const url = `http://localhost:${FRACTO_DATA_PORT}/tile_coverage?level=${level}`
   try {
      const response = await fetch(url)
      return await response.json()
   } catch (e) {
      console.log(e.message)
      return []
   }
}

const fetch_tile = async (short_code) => {
   const url = `http://localhost:${FRACTO_DATA_PORT}/tile?short_code=${short_code}`
   try {
      const response = await fetch(url)
      return await response.json()
   } catch (e) {
      // console.log(e.message)
      return null
   }
}

const add_tile = async (short_code) => {
   const url = `http://localhost:${FRACTO_DATA_PORT}/tile`
   const parent = short_code.slice(0, -1)
   const level = short_code.length
   const relative_folder = dir_from_short_code(short_code)
   const folder = level > 4
      ? relative_folder
         .replaceAll('\\', '/')
         .replaceAll('../', '')
         .replaceAll('tiles', '')
      : '/'
   const bounds = bounds_from_short_code(short_code)
   const data = {
      short_code: short_code,
      parent: parent,
      level: level,
      folder: folder,
      bounds_top: bounds.top,
      bounds_bottom: bounds.bottom,
      bounds_left: bounds.left,
      bounds_right: bounds.right,
   };
   // console.log('data', data)
   try {
      const response = await fetch(url, {
         method: 'PUT', // Specify the method
         headers: {
            'Content-Type': 'application/json', // Inform the server about the data type
         },
         body: JSON.stringify(data), // The data payload
      });
      const result = await response.json();
      // console.log('Success:', result);
   } catch (error) {
      console.error('Error:', error);
   }
}

collect_category_tiles('indexed', async all_tiles => {
   for (const level_tiles of all_tiles) {
      const first = level_tiles.values().next().value
      if (!first) {
         continue
      }
      const level = first.length
      if (level < 16) {
         continue
      }
      // const db_short_codes = await fetch_level_codes(level)
      let counter = 0
      let existing_counter = 0
      for (const level_tile of level_tiles) {
         const existing = await fetch_tile(level_tile)
         // console.log(existing)
         if (!existing || !existing.result.length) {
            await add_tile(level_tile)
            counter++
            if (counter % 1000 === 0) {
               console.log(`added ${counter}`)
            }
         } else {
            existing_counter++
            if (existing_counter % 1000 === 0) {
               console.log(`existing ${existing_counter}`)
            }
         }

      }
      console.log(`level ${level} added ${counter} existing ${existing_counter}`)
   }
})