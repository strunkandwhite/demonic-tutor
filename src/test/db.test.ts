import { describe, expect, it } from "vitest";
import { createTestDb } from "./db";

const EXPECTED_TABLES = [
  "drafts",
  "picks",
  "cards",
  "card_stats",
  "games",
  "decklists",
  "decklist_cards",
  "format_color_stats",
  "format_play_draw",
  "sync_metadata",
];

describe("createTestDb", () => {
  it("creates an in-memory libsql client with all expected tables", async () => {
    const db = await createTestDb();
    try {
      const result = await db.execute("SELECT name FROM sqlite_master WHERE type='table'");
      const names = result.rows.map((r) => r.name as string);

      for (const table of EXPECTED_TABLES) {
        expect(names).toContain(table);
      }
    } finally {
      db.close();
    }
  });

  it("returns isolated databases on each call", async () => {
    const a = await createTestDb();
    const b = await createTestDb();
    try {
      await a.execute({
        sql: "INSERT INTO sync_metadata (key, value) VALUES (?, ?)",
        args: ["test", "value-a"],
      });
      const inB = await b.execute("SELECT COUNT(*) as count FROM sync_metadata");
      expect(inB.rows[0].count).toBe(0);
    } finally {
      a.close();
      b.close();
    }
  });
});
