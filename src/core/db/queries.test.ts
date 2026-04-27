import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { createTestDb } from "@/test/db";
import { getDraftWithCardData } from "./queries";
import * as clientModule from "./client";

describe("getDraftWithCardData", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
    // Route the singleton getClient() through our in-memory db for the call.
    vi.spyOn(clientModule, "getClient").mockResolvedValue(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it("LEFT JOIN preserves cards present in `cards` but missing from `card_stats`", async () => {
    await db.execute({
      sql: `INSERT INTO drafts (id, "set", format, colors, wins, losses, draft_date, synced_at)
            VALUES ('d1', 'TST', 'PremierDraft', 'WU', 7, 0, '2026-01-01', '2026-01-01T00:00:00Z')`,
      args: [],
    });
    await db.batch([
      {
        sql: `INSERT INTO cards (name, mana_cost) VALUES (?, ?)`,
        args: ["Plains", ""],
      },
      {
        sql: `INSERT INTO cards (name, mana_cost) VALUES (?, ?)`,
        args: ["Lightning Bolt", "{R}"],
      },
      {
        sql: `INSERT INTO card_stats (card_name, "set", avg_seen_at, avg_pick_at, game_in_hand_wr, times_seen, times_picked, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ["Lightning Bolt", "TST", null, null, 0.62, 100, 90, "2026-01-01"],
      },
      // Plains intentionally has NO card_stats row for set "TST"
      {
        sql: `INSERT INTO picks (draft_id, pack_number, pick_number, card_name, available_cards)
              VALUES (?, ?, ?, ?, ?)`,
        args: ["d1", 0, 0, "Lightning Bolt", JSON.stringify(["Plains", "Lightning Bolt"])],
      },
    ]);

    const result = await getDraftWithCardData("d1");

    expect(result.draft?.id).toBe("d1");
    expect(result.cardData["Lightning Bolt"]).toEqual({ manaCost: "{R}", gihWr: 0.62 });
    expect(result.cardData["Plains"]).toEqual({ manaCost: "", gihWr: null });
  });

  it("returns empty cardData when there are no picks", async () => {
    await db.execute({
      sql: `INSERT INTO drafts (id, "set", format, colors, wins, losses, draft_date, synced_at)
            VALUES ('empty', 'TST', 'PremierDraft', 'WU', 0, 0, '2026-01-01', '2026-01-01T00:00:00Z')`,
      args: [],
    });

    const result = await getDraftWithCardData("empty");
    expect(result.cardData).toEqual({});
  });

  it("returns nulls when draft does not exist", async () => {
    const result = await getDraftWithCardData("nonexistent");
    expect(result.draft).toBeNull();
    expect(result.picks).toEqual([]);
    expect(result.games).toEqual([]);
    expect(result.cardData).toEqual({});
  });

  it("ignores card_stats for a different set", async () => {
    // Same card name, different set — must NOT bleed in via the JOIN.
    await db.execute({
      sql: `INSERT INTO drafts (id, "set", format, colors, wins, losses, draft_date, synced_at)
            VALUES ('d1', 'TST', 'PremierDraft', 'WU', 7, 0, '2026-01-01', '2026-01-01T00:00:00Z')`,
      args: [],
    });
    await db.batch([
      { sql: `INSERT INTO cards (name, mana_cost) VALUES (?, ?)`, args: ["Plains", ""] },
      {
        sql: `INSERT INTO card_stats (card_name, "set", avg_seen_at, avg_pick_at, game_in_hand_wr, times_seen, times_picked, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ["Plains", "OTHER", null, null, 0.99, 1, 1, "2026-01-01"],
      },
      {
        sql: `INSERT INTO picks (draft_id, pack_number, pick_number, card_name, available_cards)
              VALUES (?, ?, ?, ?, ?)`,
        args: ["d1", 0, 0, "Plains", JSON.stringify(["Plains"])],
      },
    ]);

    const result = await getDraftWithCardData("d1");
    expect(result.cardData["Plains"]).toEqual({ manaCost: "", gihWr: null });
  });
});
