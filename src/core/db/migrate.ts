/**
 * Run database migrations.
 */

import "dotenv/config";
import { getClient, closeClient } from "./client";
import { CREATE_TABLES_SQL } from "./schema";

async function migrate() {
  console.log("Running migrations...");
  const client = await getClient();

  // Split by semicolon and execute each statement
  const statements = CREATE_TABLES_SQL
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const sql of statements) {
    await client.execute(sql);
  }

  console.log("Migrations complete.");
  closeClient();
}

migrate().catch(console.error);
