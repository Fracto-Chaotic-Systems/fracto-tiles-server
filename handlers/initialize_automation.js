import chalk from "chalk";

import { FRACTO_DATA_PORT } from "../../../constants.js";

const data_host = process.env.FRACTO_DATA_HOST || "127.0.0.1";
const data_request_timeout_ms = Number(
  process.env.FRACTO_DATA_REQUEST_TIMEOUT_MS || 10000,
);

/** States supported by an automation job record. */
export const AUTOMATION_STATES = [
  "draft",
  "ready",
  "running",
  "paused",
  "failed",
  "complete",
];

/** Shared automation schema used by Tiles, Assets, and future servers. */
export const AUTOMATION_TABLE_DEFINITION = {
  table: "automation",
  columns: [
    {
      name: "id",
      type: "BIGINT UNSIGNED",
      nullable: false,
      auto_increment: true,
      primary_key: true,
    },
    { name: "title", type: "VARCHAR(255)", nullable: false },
    {
      name: "automation_type",
      type: "VARCHAR(100)",
      nullable: false,
    },
    {
      name: "state",
      type: "VARCHAR(16)",
      nullable: false,
      default_value: "draft",
    },
    {
      name: "run_start",
      type: "DATETIME",
    },
    {
      name: "run_stop",
      type: "DATETIME",
    },
    {
      name: "created_at",
      type: "TIMESTAMP",
      nullable: false,
      default_current_timestamp: true,
    },
    {
      name: "updated_at",
      type: "TIMESTAMP",
      nullable: false,
      default_current_timestamp: true,
      on_update_current_timestamp: true,
    },
    { name: "tasks", type: "JSON", nullable: false },
  ],
};

/**
 * Ensure the shared automation table through the data server.
 *
 * @returns {Promise<object>} Initialization and migration result.
 */
export const initialize_automation_table = async () => {
  console.log(chalk.cyan("checking automation table schema"));
  const response = await fetch(
    `http://${data_host}:${FRACTO_DATA_PORT}/ensure_table`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(AUTOMATION_TABLE_DEFINITION),
      signal: AbortSignal.timeout(
        Number.isFinite(data_request_timeout_ms) && data_request_timeout_ms > 0
          ? data_request_timeout_ms
          : 10000,
      ),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Data server returned HTTP ${response.status}`);
  }
  if (result.migrations?.length) {
    console.log(
      chalk.yellow(
        `automation schema migration applied; added columns: ${result.migrations.join(", ")}`,
      ),
    );
  } else {
    console.log(chalk.green("automation table is ready"));
  }
  return result;
};
