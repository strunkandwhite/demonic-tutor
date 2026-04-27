/**
 * Run database migrations.
 *
 * Usable as a CLI (`tsx src/core/db/migrate.ts`) or as a library: tests and
 * other entrypoints can call `migrate(client)` directly with their own client
 * (e.g. an in-memory libsql client created by createTestDb()).
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import type { Client } from "@libsql/client";
import { getClient, closeClient } from "./client";
import { CREATE_TABLES_SQL } from "./schema";

const ALTER_STATEMENTS = ["ALTER TABLE games ADD COLUMN replay_link TEXT"];

/**
 * Apply schema (CREATE TABLE IF NOT EXISTS) and idempotent ALTERs to the
 * given client. Throws on failure of any CREATE; tolerates "duplicate column"
 * on ALTERs.
 */
export async function migrate(client: Client): Promise<void> {
  const statements = CREATE_TABLES_SQL.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const sql of statements) {
    await client.execute(sql);
  }

  for (const sql of ALTER_STATEMENTS) {
    try {
      await client.execute(sql);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (!msg.includes("duplicate column")) throw error;
    }
  }
}

async function runCli(): Promise<void> {
  console.log("Running migrations...");
  const client = await getClient();
  try {
    await migrate(client);
    console.log("Migrations complete.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    closeClient();
  }
}

const isDirectRun = process.argv[1]?.includes("db/migrate");
if (isDirectRun) {
  runCli().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
}
