import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { createTestDb } from "@/test/db";
import { upsertDecklist } from "./decklists";
import type { SeventeenLandsDeck } from "@/core/seventeen-lands";

function makeDeck(): SeventeenLandsDeck {
  return {
    groups: [
      { name: "Maindeck", cards: [1, 1, 2, 3, 3, 3] },
      { name: "Sideboard", cards: [4] },
    ],
    cards: {
      "1": {
        id: 1,
        name: "Plains",
        cmc: 0,
        color_identity: [],
        mana_cost: "",
        image_url: "https://example.com/plains.jpg",
        rarity: "common",
        types: ["Land"],
      },
      "2": {
        id: 2,
        name: "Lightning Bolt",
        cmc: 1,
        color_identity: ["R"],
        mana_cost: "{R}",
        image_url: "https://example.com/bolt.jpg",
        rarity: "common",
        types: ["Instant"],
      },
      "3": {
        id: 3,
        name: "Mountain",
        cmc: 0,
        color_identity: [],
        mana_cost: "",
        image_url: "https://example.com/mountain.jpg",
        rarity: "common",
        types: ["Land"],
      },
      "4": {
        id: 4,
        name: "Counterspell",
        cmc: 2,
        color_identity: ["U"],
        mana_cost: "{U}{U}",
        image_url: "https://example.com/counter.jpg",
        rarity: "common",
        types: ["Instant"],
      },
    },
    main_colors: "R",
    splash_colors: "",
    event_info: {
      id: "deck-1",
      expansion: "TST",
      format: "PremierDraft",
      wins: 7,
      losses: 0,
      deck_links: [],
    },
  };
}

describe("upsertDecklist", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('writes one decklists row and decklist_cards rows for source="trophy"', async () => {
    const deck = makeDeck();

    const result = await upsertDecklist(db, "draft-1", "TST", deck, "trophy");

    expect(result.inserted).toBe(true);

    const decklists = await db.execute({
      sql: `SELECT draft_id, "set", main_colors, source FROM decklists WHERE draft_id = ?`,
      args: ["draft-1"],
    });
    expect(decklists.rows).toHaveLength(1);
    expect(decklists.rows[0].draft_id).toBe("draft-1");
    expect(decklists.rows[0].set).toBe("TST");
    expect(decklists.rows[0].main_colors).toBe("R");
    expect(decklists.rows[0].source).toBe("trophy");

    const cards = await db.execute({
      sql: `SELECT card_name, quantity, is_maindeck FROM decklist_cards WHERE draft_id = ? ORDER BY card_name, is_maindeck`,
      args: ["draft-1"],
    });
    // Maindeck: 2× Plains, 1× Lightning Bolt, 3× Mountain. Sideboard: 1× Counterspell.
    expect(cards.rows).toEqual([
      { card_name: "Counterspell", quantity: 1, is_maindeck: 0 },
      { card_name: "Lightning Bolt", quantity: 1, is_maindeck: 1 },
      { card_name: "Mountain", quantity: 3, is_maindeck: 1 },
      { card_name: "Plains", quantity: 2, is_maindeck: 1 },
    ]);

    const cardRegistry = await db.execute(`SELECT name FROM cards ORDER BY name`);
    expect(cardRegistry.rows.map((r) => r.name)).toEqual([
      "Counterspell",
      "Lightning Bolt",
      "Mountain",
      "Plains",
    ]);
  });

  it('is a no-op when called twice with source="trophy" for the same draft', async () => {
    const deck = makeDeck();

    const first = await upsertDecklist(db, "draft-1", "TST", deck, "trophy");
    expect(first.inserted).toBe(true);

    const second = await upsertDecklist(db, "draft-1", "TST", deck, "trophy");
    expect(second.inserted).toBe(false);
    expect(second.cardsInserted).toBe(0);

    // Still exactly one decklists row, no extra decklist_cards.
    const decklists = await db.execute(
      `SELECT COUNT(*) as count FROM decklists WHERE draft_id = 'draft-1'`
    );
    expect(decklists.rows[0].count).toBe(1);
  });

  it("writes through db.batch in a single call (no per-row execute)", async () => {
    const deck = makeDeck();

    const batchSpy = vi.spyOn(db, "batch");

    await upsertDecklist(db, "draft-2", "TST", deck, "user");

    expect(batchSpy).toHaveBeenCalledTimes(1);
    batchSpy.mockRestore();
  });
});
