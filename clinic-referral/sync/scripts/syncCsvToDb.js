#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Lightweight local CSV sync for admin data maintenance.
 *
 * Usage:
 *   1. Set DATABASE_URL or POSTGRES_URL.
 *   2. Place any of these files in sync/input/:
 *      clinics.csv, services.csv, clinic_services.csv, clinic_service_documents.csv
 *   3. Run: npm run sync:csv
 *
 * Notes:
 *   - This script only upserts rows. It never deletes database rows that are
 *     missing from CSV.
 *   - Files are processed in dependency order and moved only after the full run
 *     succeeds.
 *   - CSV exports include metadata rows: row 1 is the header, rows 2-4 are
 *     ignored, and data starts at row 5.
 *   - clinic_service_documents has only an auto-generated id in the current
 *     schema. The sync does not insert that id, so document rows use
 *     ON CONFLICT DO NOTHING and require a future stable key for true updates.
 */

const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { Pool } = require("pg");

function loadEnvFile(filePath) {
  if (!fsSync.existsSync(filePath)) return;

  const content = fsSync.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (!key || process.env[key] != null) continue;

    const hasMatchingDoubleQuotes = value.startsWith('"') && value.endsWith('"');
    const hasMatchingSingleQuotes = value.startsWith("'") && value.endsWith("'");
    if (hasMatchingDoubleQuotes || hasMatchingSingleQuotes) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

const PROJECT_ROOT = path.resolve(__dirname, "../..");
loadEnvFile(path.join(PROJECT_ROOT, ".env.local"));
loadEnvFile(path.join(PROJECT_ROOT, ".env.development.local"));
loadEnvFile(path.join(PROJECT_ROOT, ".env"));

const SYNC_DIR = path.resolve(__dirname, "..");
const INPUT_DIR = path.join(SYNC_DIR, "input");
const PROCESSED_DIR = path.join(SYNC_DIR, "processed");
const FAILED_DIR = path.join(SYNC_DIR, "failed");
const LOG_DIR = path.join(SYNC_DIR, "logs");
const GOOGLE_DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

const TABLES = [
  {
    fileName: "clinics.csv",
    tableName: "clinics",
    conflictColumns: ["clinic_id"],
    columns: {
      clinic_id: "text",
      clinic_key: "text",
      name: "text",
      location_label: "text",
      address: "text",
      city: "text",
      state: "text",
      zip: "text",
      map_url: "text",
      phone: "text",
      contact_person: "text",
      email: "text",
      founded: "date",
      website: "text",
      hours: "text",
      accepting_referrals: "boolean",
      referral_notes: "text",
      last_verified_at: "date",
      tags: "array",
      referral_methods: "array",
      created_at: "timestamp",
      updated_at: "timestamp"
    },
    generatedColumns: new Set(["created_at", "updated_at"]),
    requiredColumns: ["clinic_id", "clinic_key", "name"],
    updateTimestampColumn: "updated_at"
  },
  {
    fileName: "services.csv",
    tableName: "services",
    conflictColumns: ["service_id"],
    columns: {
      service_id: "text",
      display_name: "text",
      description: "text",
      icon: "text",
      service_type: "text",
      created_at: "timestamp",
      updated_at: "timestamp"
    },
    generatedColumns: new Set(["created_at", "updated_at"]),
    requiredColumns: ["service_id", "display_name", "service_type"],
    updateTimestampColumn: "updated_at"
  },
  {
    fileName: "clinic_services.csv",
    tableName: "clinic_services",
    conflictColumns: ["clinic_id", "service_id"],
    columns: {
      clinic_service_id: "text",
      clinic_id: "text",
      service_id: "text",
      notes: "text",
      accepting_referrals: "boolean",
      status: "text",
      last_verified_at: "date",
      created_at: "timestamp",
      updated_at: "timestamp"
    },
    generatedColumns: new Set(["created_at", "updated_at"]),
    requiredColumns: ["clinic_service_id", "clinic_id", "service_id"],
    updateTimestampColumn: "updated_at"
  },
  {
    fileName: "clinic_service_documents.csv",
    tableName: "clinic_service_documents",
    conflictColumns: ["id"],
    columns: {
      id: "integer",
      clinic_service_id: "text",
      doc_name: "text",
      doc_type: "text",
      doc_description: "text",
      url: "text",
      google_drive_file_id: "text",
      sort_order: "integer",
      created_at: "timestamp"
    },
    generatedColumns: new Set(["id", "created_at"]),
    requiredColumns: ["clinic_service_id", "doc_name", "doc_type"],
    dedupeColumns: ["clinic_service_id", "doc_name", "doc_type"],
    useUntargetedConflict: true
  }
];

function stampForFile(date = new Date()) {
  return date.toISOString().replace("T", "_").replace(/\..+$/, "").replace(/:/g, "-");
}

function lineTimestamp(date = new Date()) {
  return date.toISOString();
}

function createLogger(logPath) {
  const writeQueue = [];

  async function flush() {
    while (writeQueue.length > 0) {
      const line = writeQueue.shift();
      await fs.appendFile(logPath, line, "utf8");
    }
  }

  function log(level, message, error) {
    const details = error ? `\n${error.stack || error.message || String(error)}` : "";
    const line = `[${lineTimestamp()}] [${level}] ${message}${details}\n`;
    writeQueue.push(line);

    if (level === "ERROR") {
      console.error(`[${level}] ${message}`);
    } else {
      console.log(`[${level}] ${message}`);
    }
  }

  return {
    info(message) {
      log("INFO", message);
    },
    error(message, error) {
      log("ERROR", message, error);
    },
    flush
  };
}

function extractGoogleDriveFileId(input) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) return null;

  if (GOOGLE_DRIVE_FILE_ID_PATTERN.test(value) && !value.includes(".")) {
    return value;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();

    if (!isGoogleHost(host)) {
      return null;
    }

    const idFromQuery = parsed.searchParams.get("id");
    if (idFromQuery && GOOGLE_DRIVE_FILE_ID_PATTERN.test(idFromQuery)) {
      return idFromQuery;
    }

    const pathMatch = parsed.pathname.match(/\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/);
    if (pathMatch?.[1] && GOOGLE_DRIVE_FILE_ID_PATTERN.test(pathMatch[1])) {
      return pathMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

function buildGoogleDriveViewUrl(fileId) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

function isGoogleHost(host) {
  return host === "google.com" || host.endsWith(".google.com");
}

function isGoogleUrl(input) {
  const value = typeof input === "string" ? input.trim() : "";
  if (!value) return false;

  try {
    return isGoogleHost(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}


async function ensureSyncDirectories() {
  await Promise.all([INPUT_DIR, PROCESSED_DIR, FAILED_DIR, LOG_DIR].map((dir) => fs.mkdir(dir, { recursive: true })));
}

function matchesConfiguredFile(actualFileName, expectedFileName) {
  if (actualFileName === expectedFileName) return true;

  if (!actualFileName.toLowerCase().endsWith(expectedFileName.toLowerCase())) {
    return false;
  }

  const prefix = actualFileName.slice(0, actualFileName.length - expectedFileName.length);
  return prefix.trim().length > 0;
}

function getPool() {
  let connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or POSTGRES_URL is required for CSV sync.");
  }

  if (connectionString.includes("sslmode=require") && !connectionString.includes("uselibpqcompat")) {
    connectionString += "&uselibpqcompat=true";
  }

  const useSsl = !connectionString.includes("localhost");
  return new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  });
}

function parseCsvRows(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inQuotes) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        index += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unterminated quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseAdminCsv(content) {
  const rows = parseCsvRows(content);
  if (rows.length === 0 || rows.every((currentRow) => currentRow.every((value) => value.trim() === ""))) {
    return { headers: [], records: [] };
  }

  const headers = rows[0].map((header, index) => {
    const cleaned = index === 0 ? header.replace(/^\uFEFF/, "").trim() : header.trim();
    if (!cleaned) {
      throw new Error(`Malformed CSV: header column ${index + 1} is empty.`);
    }
    return cleaned;
  });

  const dataRows = rows
    .slice(4)
    .map((currentRow, index) => ({ currentRow, sourceRowNumber: index + 5 }))
    .filter(({ currentRow }) => currentRow.some((value) => value.trim() !== ""));
  const records = dataRows.map(({ currentRow, sourceRowNumber }) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = currentRow[index] ?? "";
    });
    return { record, sourceRowNumber };
  });

  return { headers, records };
}

function parseBoolean(value, columnName) {
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value for ${columnName}: "${value}"`);
}

function parseArray(value) {
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error(`Expected JSON array but received: ${value}`);
    }
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  }

  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseDateLike(value, columnName, type) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${type} value for ${columnName}: "${value}"`);
  }

  return type === "date" ? parsed.toISOString().slice(0, 10) : parsed.toISOString();
}

function normalizeValue(value, columnName, columnType) {
  if (value == null || value.trim() === "") {
    return null;
  }

  switch (columnType) {
    case "boolean":
      return parseBoolean(value, columnName);
    case "array":
      return parseArray(value);
    case "date":
    case "timestamp":
      return parseDateLike(value, columnName, columnType);
    case "integer": {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed)) {
        throw new Error(`Invalid integer value for ${columnName}: "${value}"`);
      }
      return parsed;
    }
    case "text":
      return value.trim();
    default:
      throw new Error(`Unsupported column type "${columnType}" for ${columnName}.`);
  }
}

function normalizeRecord(record, config) {
  const normalized = {};

  for (const [columnName, rawValue] of Object.entries(record)) {
    const columnType = config.columns[columnName];
    if (!columnType) continue;
    if (config.generatedColumns?.has(columnName)) continue;

    const value = normalizeValue(rawValue, columnName, columnType);
    normalized[columnName] = value;
  }

  if (config.tableName === "clinic_service_documents") {
    const extractedFromUrl = extractGoogleDriveFileId(normalized.url);
    const fileIdFromField = extractGoogleDriveFileId(normalized.google_drive_file_id);
    const fileId = fileIdFromField ?? extractedFromUrl;

    if (normalized.google_drive_file_id && !fileIdFromField) {
      throw new Error(`Invalid Google Drive file ID/link for google_drive_file_id: "${normalized.google_drive_file_id}"`);
    }

    if (isGoogleUrl(normalized.url) && !extractedFromUrl && !fileIdFromField) {
      throw new Error(`Invalid Google Drive link for url: "${normalized.url}"`);
    }

    normalized.google_drive_file_id = fileId;

    if (!normalized.url && fileId) {
      normalized.url = buildGoogleDriveViewUrl(fileId);
    }
  }

  return normalized;
}

function missingRequiredColumns(row, config) {
  return config.requiredColumns.filter((columnName) => row[columnName] == null || row[columnName] === "");
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function buildUpsert(config, row) {
  const columns = Object.keys(row);
  if (columns.length === 0) {
    throw new Error(`No valid columns found for table ${config.tableName}.`);
  }

  for (const conflictColumn of config.conflictColumns) {
    if (!columns.includes(conflictColumn) || row[conflictColumn] == null) {
      throw new Error(`Missing required conflict column ${conflictColumn} for table ${config.tableName}.`);
    }
  }

  const insertColumns = columns.map(quoteIdentifier).join(", ");
  const values = columns.map((_, index) => `$${index + 1}`).join(", ");
  const conflictTarget = config.conflictColumns.map(quoteIdentifier).join(", ");
  const mutableColumns = columns.filter((column) => !config.conflictColumns.includes(column) && column !== "created_at");
  const updateAssignments = mutableColumns.map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`);

  if (config.updateTimestampColumn && !columns.includes(config.updateTimestampColumn)) {
    updateAssignments.push(`${quoteIdentifier(config.updateTimestampColumn)} = CURRENT_TIMESTAMP`);
  }

  const conflictAction =
    updateAssignments.length > 0 ? `DO UPDATE SET ${updateAssignments.join(", ")}` : "DO NOTHING";

  return {
    sql: `
      INSERT INTO ${quoteIdentifier(config.tableName)} (${insertColumns})
      VALUES (${values})
      ON CONFLICT (${conflictTarget}) ${conflictAction}
    `,
    values: columns.map((column) => row[column])
  };
}

function buildUntargetedConflictInsert(config, row) {
  const columns = Object.keys(row);
  const insertColumns = columns.map(quoteIdentifier).join(", ");
  const values = columns.map((_, index) => `$${index + 1}`).join(", ");
  const rowValues = columns.map((column) => row[column]);

  const dedupeColumns = config.dedupeColumns ?? columns;
  const whereClauses = dedupeColumns.map((column, index) => {
    const parameterIndex = columns.length + index + 1;
    return `${quoteIdentifier(column)} IS NOT DISTINCT FROM $${parameterIndex}`;
  });
  const dedupeValues = dedupeColumns.map((column) => row[column] ?? null);

  return {
    sql: `
      INSERT INTO ${quoteIdentifier(config.tableName)} (${insertColumns})
      SELECT ${values}
      WHERE NOT EXISTS (
        SELECT 1
        FROM ${quoteIdentifier(config.tableName)}
        WHERE ${whereClauses.join(" AND ")}
      )
    `,
    values: [...rowValues, ...dedupeValues]
  };
}

function buildStatement(config, row) {
  if (config.useUntargetedConflict) {
    return buildUntargetedConflictInsert(config, row);
  }

  return buildUpsert(config, row);
}

async function syncFile(client, config, logger) {
  const inputFileName = config.inputFileName || config.fileName;
  const filePath = path.join(INPUT_DIR, inputFileName);
  logger.info(`Starting ${config.tableName} sync from ${inputFileName}.`);

  const content = await fs.readFile(filePath, "utf8");
  const { headers, records } = parseAdminCsv(content);
  if (headers.length === 0) {
    throw new Error(`${inputFileName} does not contain a header row.`);
  }

  const validHeaders = headers.filter((header) => config.columns[header]);
  if (validHeaders.length === 0) {
    throw new Error(`${inputFileName} does not contain any columns for ${config.tableName}.`);
  }

  logger.info(`${inputFileName}: parsed ${records.length} data row(s) after skipping metadata, ${validHeaders.length} usable column(s).`);

  await client.query("BEGIN");
  try {
    let upsertedRows = 0;
    let skippedRows = 0;

    for (const { record, sourceRowNumber } of records) {
      const normalized = normalizeRecord(record, config);
      const missingColumns = missingRequiredColumns(normalized, config);
      if (missingColumns.length > 0) {
        skippedRows += 1;
        logger.info(
          `${inputFileName}: skipped source row ${sourceRowNumber}; missing required field(s): ${missingColumns.join(", ")}.`
        );
        continue;
      }

      const statement = buildStatement(config, normalized);
      await client.query(statement.sql, statement.values);
      upsertedRows += 1;
    }

    await client.query("COMMIT");
    logger.info(`${inputFileName}: upsert success for ${upsertedRows} row(s); skipped ${skippedRows} row(s).`);
    return upsertedRows;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(`${inputFileName}: transaction rollback complete.`, error);
    throw error;
  }
}

async function moveFile(sourcePath, targetDir, logger) {
  await fs.mkdir(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, path.basename(sourcePath));
  await fs.rename(sourcePath, targetPath);
  logger.info(`Moved ${sourcePath} to ${targetPath}.`);
}

async function archiveProcessedFiles(processedFiles, runStamp, logger) {
  const runDir = path.join(PROCESSED_DIR, runStamp);
  await fs.mkdir(runDir, { recursive: true });

  for (const fileName of processedFiles) {
    await moveFile(path.join(INPUT_DIR, fileName), runDir, logger);
  }
}

async function moveFailedFile(fileName, runStamp, logger) {
  const sourcePath = path.join(INPUT_DIR, fileName);
  const targetDir = path.join(FAILED_DIR, runStamp);

  try {
    await moveFile(sourcePath, targetDir, logger);
  } catch (error) {
    logger.error(`Could not move failed file ${fileName}; leaving it in input if still present.`, error);
  }
}

async function main() {
  await ensureSyncDirectories();

  const runStamp = stampForFile();
  const logPath = path.join(LOG_DIR, `sync-${runStamp}.log`);
  const logger = createLogger(logPath);
  let pool;

  logger.info(`CSV sync script start. Log file: ${logPath}`);

  try {
    const detectedFiles = await fs.readdir(INPUT_DIR);
    const detectedCsvs = TABLES.flatMap((config) => {
      const matchedFileName = detectedFiles.find((fileName) => matchesConfiguredFile(fileName, config.fileName));
      return matchedFileName ? [{ ...config, inputFileName: matchedFileName }] : [];
    });
    const unsupportedCsvs = detectedFiles.filter(
      (fileName) => fileName.endsWith(".csv") && !TABLES.some((config) => matchesConfiguredFile(fileName, config.fileName))
    );

    for (const fileName of unsupportedCsvs) {
      logger.info(`Ignoring unsupported CSV file ${fileName}; expected only the configured sync files.`);
    }

    if (detectedCsvs.length === 0) {
      logger.info("No supported CSV files found in sync/input/. Nothing to process.");
      logger.info("CSV sync completed successfully with 0 file(s).");
      return;
    }

    for (const config of detectedCsvs) {
      logger.info(`Detected ${config.inputFileName || config.fileName}.`);
    }

    pool = getPool();
    const client = await pool.connect();
    const processedFiles = [];
    let totalRows = 0;

    try {
      for (const config of detectedCsvs) {
        const rowCount = await syncFile(client, config, logger);
        processedFiles.push(config.inputFileName || config.fileName);
        totalRows += rowCount;
      }
    } catch (error) {
      const failedConfig = detectedCsvs[processedFiles.length];
      const failedFileName = failedConfig.inputFileName || failedConfig.fileName;
      logger.error(`CSV sync failed while processing ${failedFileName}. Later files were not processed.`, error);
      await moveFailedFile(failedFileName, runStamp, logger);
      throw error;
    } finally {
      client.release();
    }

    await archiveProcessedFiles(processedFiles, runStamp, logger);
    logger.info(`CSV sync completed successfully. Files: ${processedFiles.length}. Rows: ${totalRows}.`);
  } catch (error) {
    logger.error("CSV sync finished with failure.", error);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.end();
    }
    await logger.flush();
  }
}

main();
