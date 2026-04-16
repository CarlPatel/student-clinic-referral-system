#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs/promises");
const path = require("path");

const SYNC_DIR = path.resolve(__dirname, "..");
const TARGET_FOLDERS = ["input", "processed", "failed", "logs"];

async function clearFolder(folderName) {
  const folderPath = path.join(SYNC_DIR, folderName);

  try {
    const entries = await fs.readdir(folderPath);
    const entriesToRemove = entries.filter((entry) => entry !== ".gitkeep");
    console.log(`Clearing ${folderPath}`);

    await Promise.all(
      entriesToRemove.map((entry) => fs.rm(path.join(folderPath, entry), { recursive: true, force: true }))
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`Skipping missing folder ${folderPath}`);
      return;
    }

    throw error;
  }
}

async function main() {
  console.log("Starting sync folder clear.");

  try {
    for (const folderName of TARGET_FOLDERS) {
      await clearFolder(folderName);
    }

    console.log("Sync folders cleared successfully.");
  } catch (error) {
    console.error("Failed to clear sync folders.", error);
    process.exitCode = 1;
  }
}

main();
