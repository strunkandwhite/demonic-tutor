/**
 * Run database migrations.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { getClient, closeClient } from "./client";
import { CREATE_TABLES_SQL } from "./schema";

const MIGRATIONS = [
  // 001: Add orphaned tracking columns
  "ALTER TABLE games ADD COLUMN orphaned INTEGER DEFAULT 0",
  "ALTER TABLE cards ADD COLUMN scryfall_not_found INTEGER DEFAULT 0",
  // 002: Add source column to decklists for trophy deck support
  "ALTER TABLE decklists ADD COLUMN source TEXT DEFAULT 'user'",
];

async function migrate() {
  console.log("Running migrations...");
  const client = await getClient();

  // Run CREATE TABLE statements
  const statements = CREATE_TABLES_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i];
    try {
      await client.execute(sql);
    } catch (error) {
      console.error(`Migration failed at statement ${i + 1}:`);
      console.error(sql);
      console.error(error);
      closeClient();
      process.exit(1);
    }
  }

  // Run ALTER TABLE migrations (ignore "duplicate column" errors)
  for (const sql of MIGRATIONS) {
    try {
      await client.execute(sql);
      console.log(`Applied: ${sql}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("duplicate column")) {
        // Column already exists, skip
      } else {
        console.error(`Migration failed: ${sql}`);
        console.error(error);
        closeClient();
        process.exit(1);
      }
    }
  }

  console.log("Migrations complete.");
  closeClient();
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
