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

  console.log("Migrations complete.");
  closeClient();
}

migrate().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
