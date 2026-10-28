import { read_mesh_file } from "../../../sdk/terrain/Storage.js";

/** Meshes are prebuilt; reads never trigger generation or numerical downloads. */
export function create_mesh_handler(options = {}) {
  const { inventory_store, ...storage_options } = options;
  return async (req, res) => {
    if (!/^[0-3]{2,34}$/.test(req.params.short_code || ""))
      return res.status(400).json({ error: "Invalid mesh short code" });
    try {
      const { compressed, metadata } = await read_mesh_file(
        req.params.short_code,
        {
          ...storage_options,
          include_attributes: false,
        },
      );
      await inventory_store?.observe(req.params.short_code);
      res.setHeader("Content-Type", "application/gzip");
      // The gzip file is the binary asset, not HTTP content encoding.
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader(
        "ETag",
        `"${metadata.namespace}-${metadata.source_sha256}"`,
      );
      return res.send(compressed);
    } catch (error) {
      try {
        await inventory_store?.observe(req.params.short_code);
      } catch {
        return res.status(503).json({ error: "Mesh inventory unavailable" });
      }
      const status =
        error.code === "ENOENT" ? 404 : error.code === "MESH_STALE" ? 409 : 503;
      return res.status(status).json({
        error:
          status === 404
            ? "Mesh not found"
            : status === 409
              ? "Mesh requires rebuilding"
              : "Mesh unavailable",
      });
    }
  };
}
