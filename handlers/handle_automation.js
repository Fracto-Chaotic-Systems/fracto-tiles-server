const data_host = process.env.FRACTO_DATA_HOST || "127.0.0.1";
const data_port = Number(process.env.FRACTO_DATA_PORT || 3002);

/**
 * Query automation jobs owned by the Tiles server.
 *
 * @param {import("express").Request} req Express request (no query parameters).
 * @param {import("express").Response} res JSON result containing Tiles jobs.
 */
export const handle_automation = async (req, res) => {
  try {
    const response = await fetch(
      `http://${data_host}:${data_port}/automation?automation_type=tiles`,
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
};

