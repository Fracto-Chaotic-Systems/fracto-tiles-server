const data_host = process.env.FRACTO_DATA_HOST || "127.0.0.1";
import { internal_service_headers } from "../../../utils/service_authorization.js";
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
      `http://${data_host}:${data_port}/automation?automation_type=tiles&state=ready&order=asc&limit=10`,
      { headers: internal_service_headers() },
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

/**
 * Create a Tiles automation job through the data server.
 *
 * @param {import("express").Request} req JSON automation record body.
 * @param {import("express").Response} res Created record id and insert result.
 */
export const handle_automation_create = async (req, res) => {
  try {
    const response = await fetch(`http://${data_host}:${data_port}/automation`, {
      method: "POST",
      headers: internal_service_headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(req.body || {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json(result);
      return;
    }
    res.status(201).json(result);
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
};

/**
 * Claim the oldest ready Tiles automation job through the data server.
 *
 * @param {import("express").Request} req Automation claim request body.
 * @param {import("express").Response} res Claimed job or null.
 */
export const handle_automation_claim = async (req, res) => {
  try {
    const response = await fetch(`http://${data_host}:${data_port}/automation/claim`, {
      method: "POST",
      headers: internal_service_headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(req.body || {}),
    });
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

/**
 * Update a claimed Tiles automation job through the data server.
 *
 * @param {import("express").Request} req Numeric job id and update body.
 * @param {import("express").Response} res Update result.
 */
export const handle_automation_update = async (req, res) => {
  try {
    const response = await fetch(
      `http://${data_host}:${data_port}/automation/${req.params.id}`,
      {
        method: "PUT",
        headers: internal_service_headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(req.body || {}),
      },
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
