/**
 * Run database migrations.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { getClient, closeClient } from "./client";
import { CREATE_TABLES_SQL } from "./schema";

async function migrate() {
  console.log("Running migrations...");
  const client = await getClient();

  const statements = CREATE_TABLES_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const sql of statements) {
    try {
      await client.execute(sql);
    } catch (error) {
      console.error("Migration failed:");
      console.error(sql);
      console.error(error);
      closeClient();
      process.exit(1);
    }
  }

  // Column additions (idempotent - ignores "duplicate column" errors)
  const ALTER_STATEMENTS = ["ALTER TABLE games ADD COLUMN replay_link TEXT"];

  for (const sql of ALTER_STATEMENTS) {
    try {
      await client.execute(sql);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (!msg.includes("duplicate column")) {
        console.error("ALTER TABLE failed:", sql, error);
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
