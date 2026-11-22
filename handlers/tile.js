import {
  tile_bounds,
  validate_tile_code,
  validate_tile_data,
} from "@fracto/sdk/FractoTileGeometry.js";

export const MAX_TILE_AVAILABILITY_CODES = 256;

/** Uses the loaded compiled index, never remote classification manifests or tile files. */
export function create_tile_handlers({ get_level, get_tile, source_id }) {
  if (typeof source_id !== "string" || !source_id)
    throw new TypeError("Tile source identity required");
  const availability = (codes) => {
    const result = Object.fromEntries(codes.map((code) => [code, false]));
    for (const level of new Set(codes.map((code) => code.length))) {
      const wanted = new Set(codes.filter((code) => code.length === level));
      const lefts = new Set([...wanted].map((code) => tile_bounds(code).left));
      for (const column of get_level(level)?.columns ?? []) {
        if (!lefts.has(column.left)) continue;
        for (const tile of column.tiles)
          if (wanted.has(tile.short_code)) result[tile.short_code] = true;
      }
    }
    return result;
  };
  const prepare = (res) => res.setHeader("Cache-Control", "no-store");
  return {
    availability(req, res) {
      prepare(res);
      let codes;
      try {
        if (typeof req.query.short_codes !== "string") throw new Error();
        codes = req.query.short_codes.split(",");
        if (!codes.length || codes.length > MAX_TILE_AVAILABILITY_CODES)
          throw new Error();
        codes.forEach(validate_tile_code);
      } catch {
        return res.status(400).json({ error: "INVALID_TILE_CODES" });
      }
      try {
        return res.json({
          schema_version: 1,
          source_id,
          availability: availability([...new Set(codes)]),
        });
      } catch {
        return res.status(503).json({ error: "TILE_INDEX_UNAVAILABLE" });
      }
    },
    async tile(req, res) {
      prepare(res);
      const code = req.query.short_code;
      try {
        validate_tile_code(code);
      } catch {
        return res.status(400).json({ error: "INVALID_TILE_CODE" });
      }
      try {
        if (!availability([code])[code])
          return res.status(404).json({ error: "TILE_NOT_INDEXED", source_id });
        const data = await get_tile(code);
        validate_tile_data(data);
        if (req.aborted || res.destroyed) return;
        return res.json({
          schema_version: 1,
          source_id,
          short_code: code,
          bounds: tile_bounds(code),
          tile_data: data,
        });
      } catch {
        if (!req.aborted && !res.destroyed)
          return res.status(503).json({ error: "TILE_UNAVAILABLE", source_id });
      }
    },
  };
}
