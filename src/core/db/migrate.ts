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

// Complex migrations that need special handling (table recreation for FK removal)
const COMPLEX_MIGRATIONS = [
  {
    name: "003_remove_decklist_fk_constraints",
    check: async (client: Awaited<ReturnType<typeof getClient>>) => {
      // Check if the old FK constraint still exists by inspecting the schema
      const result = await client.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='decklists'"
      );
      const sql = result.rows[0]?.sql as string | undefined;
      return sql?.includes("REFERENCES drafts");
    },
    run: async (client: Awaited<ReturnType<typeof getClient>>) => {
      console.log("Removing FK constraints from decklists tables...");

      // Disable FK checks during table recreation
      await client.execute("PRAGMA foreign_keys = OFF");

      // Recreate decklists table without FK
      await client.execute(`
        CREATE TABLE IF NOT EXISTS decklists_new (
          draft_id TEXT PRIMARY KEY,
          main_colors TEXT,
          splash_colors TEXT,
          source TEXT DEFAULT 'user'
        )
      `);
      await client.execute(`
        INSERT OR IGNORE INTO decklists_new (draft_id, main_colors, splash_colors, source)
        SELECT draft_id, main_colors, splash_colors, COALESCE(source, 'user') FROM decklists
      `);
      await client.execute("DROP TABLE decklists");
      await client.execute("ALTER TABLE decklists_new RENAME TO decklists");

      // Recreate decklist_cards table without FK
      await client.execute(`
        CREATE TABLE IF NOT EXISTS decklist_cards_new (
          draft_id TEXT NOT NULL,
          card_name TEXT NOT NULL,
          quantity INTEGER NOT NULL,
          is_maindeck INTEGER NOT NULL,
          PRIMARY KEY (draft_id, card_name, is_maindeck)
        )
      `);
      await client.execute(`
        INSERT OR IGNORE INTO decklist_cards_new (draft_id, card_name, quantity, is_maindeck)
        SELECT draft_id, card_name, quantity, is_maindeck FROM decklist_cards
      `);
      await client.execute("DROP TABLE decklist_cards");
      await client.execute("ALTER TABLE decklist_cards_new RENAME TO decklist_cards");

      // Recreate indexes
      await client.execute(
        "CREATE INDEX IF NOT EXISTS idx_decklist_cards_card ON decklist_cards(card_name)"
      );
      await client.execute(
        "CREATE INDEX IF NOT EXISTS idx_decklist_cards_draft ON decklist_cards(draft_id)"
      );

      // Re-enable FK checks
      await client.execute("PRAGMA foreign_keys = ON");

      console.log("FK constraints removed from decklists tables.");
    },
  },
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

  // Run complex migrations (table recreation, etc.)
  for (const migration of COMPLEX_MIGRATIONS) {
    try {
      const needsRun = await migration.check(client);
      if (needsRun) {
        await migration.run(client);
        console.log(`Applied complex migration: ${migration.name}`);
      }
    } catch (error) {
      console.error(`Complex migration failed: ${migration.name}`);
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
