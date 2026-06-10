import fs from 'fs';

import FractoIndexedTiles from "../../sdk/FractoIndexedTiles.js";

const BIN_VERB_INDEXED = "indexed";
let bin_verb = process.argv[2]
if (!bin_verb) {
   bin_verb = BIN_VERB_INDEXED
}
const tiles_dir = '../../tiles/manifest'
if (!fs.existsSync(tiles_dir)) {
   console.log("adding tiles_dir", tiles_dir)
   fs.mkdirSync(tiles_dir);
}
const tile_bin_dir = `${tiles_dir}/${bin_verb}`
if (!fs.existsSync(tile_bin_dir)) {
   console.log("adding tile_bin_dir", tile_bin_dir)
   fs.mkdirSync(tile_bin_dir);
}

const bounds_from_short_code = (short_code) => {
   let left = -2;
   let right = 2;
   let top = 2;
   let bottom = -2;
   let scope = 4.0;
   for (let i = 0; i < short_code.length; i++) {
      const half_scope = scope / 2;
      const digit = short_code[i];
      switch (digit) {
         case "0":
            right -= half_scope;
            bottom += half_scope;
            break;
         case "1":
            left += half_scope;
            bottom += half_scope;
            break;
         case "2":
            right -= half_scope;
            top -= half_scope;
            break;
         case "3":
            left += half_scope;
            top -= half_scope;
            break;
         default:
            debugger;
      }
      scope = half_scope;
   }
   return {
      left: left,
      right: right,
      top: top,
      bottom: bottom
   }
}

const index_tiles = (level, batch_list) => {
   const level_bin = {
      level: level,
      tile_size: Math.pow(2, 2 - level),
      columns: []
   }
   let processed = 0
   for (let line_index = 0; line_index < batch_list.length; line_index++) {
      const short_code = batch_list[line_index].trim();
      if (short_code.length !== level) {
         continue
      }
      processed++
      const bounds = bounds_from_short_code(short_code)
      let tile_column = level_bin.columns
         .find(column => column.left === bounds.left)
      if (!tile_column) {
         tile_column = {
            left: bounds.left,
            tiles: []
         }
         level_bin.columns.push(tile_column)
      }
      const tile = {
         bottom: bounds.bottom,
         short_code: short_code
      }
      tile_column.tiles.push(tile)
      if (processed % 100000 === 0) {
         console.log(`level ${level} ${processed}`)
      }
   }
   console.log(`level ${level} ${processed}`)
   return level_bin
}

const TILES_IN_PACKET = 50000

const packet_manifest = {
   tile_count: 0,
   packet_files: []
}

const write_packet_file = (level, packet_columns, packet_index) => {
   const packet_indicator = packet_index === -1 ? '' : `_(${packet_index + 1})`
   const filename = `tile_packet_bin_${bin_verb}_level_${level}${packet_indicator}.json`
   const filepath = `${tile_bin_dir}/${filename}`
   const packet_data = {
      level: level,
      columns: packet_columns
   }
   console.log(`writing file ${filepath}`)
   fs.writeFileSync(filepath, JSON.stringify(packet_data))
   packet_manifest.packet_files.push(filename)
}

FractoIndexedTiles.load_short_codes("indexed", result => {
   for (let level = 2; level <= 35; level++) {
      const level_bin = index_tiles(level, result)
      console.log(`level_bin contains ${level_bin.columns.length} columns`)
      let packet_index = 0
      let tile_count = 0
      let packet_columns = []
      for (let col_index = 0; col_index < level_bin.columns.length; col_index++) {
         const column = level_bin.columns[col_index]
         packet_columns.push(column)
         tile_count += column.tiles.length
         if (tile_count > TILES_IN_PACKET) {
            write_packet_file(level, packet_columns, packet_index++)
            packet_manifest.tile_count += tile_count
            tile_count = 0
            packet_columns = []
         }
      }
      if (packet_columns.length) {
         write_packet_file(level, packet_columns, packet_index ? packet_index : -1)
      }
   }
   const manifest_path = `${tile_bin_dir}/packet_manifest.json`
   fs.writeFileSync(manifest_path, JSON.stringify(packet_manifest))
})

