import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { createTestDb } from "@/test/db";
import {
  analyzeDeckChoices,
  getDraftWithCardData,
  getMyCardHistory,
  getMyStats,
  listDrafts,
  searchDecks,
} from "./queries";
import * as clientModule from "./client";

interface DraftSeed {
  id: string;
  set?: string;
  format?: string;
  colors?: string;
  wins?: number;
  losses?: number;
  draft_date?: string;
}

async function seedDraft(db: Client, d: DraftSeed): Promise<void> {
  await db.execute({
    sql: `INSERT INTO drafts (id, "set", format, colors, wins, losses, draft_date, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      d.id,
      d.set ?? "TST",
      d.format ?? "PremierDraft",
      d.colors ?? null,
      d.wins ?? 0,
      d.losses ?? 0,
      d.draft_date ?? "2026-01-01",
      "2026-01-01T00:00:00Z",
    ],
  });
}

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

  // Reusable seed for the JOIN regression test
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

describe("listDrafts", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
    vi.spyOn(clientModule, "getClient").mockResolvedValue(db);
    await seedDraft(db, {
      id: "d-tst-wu",
      set: "TST",
      colors: "WU",
      wins: 5,
      losses: 3,
      draft_date: "2026-01-10",
    });
    await seedDraft(db, {
      id: "d-tst-bg",
      set: "TST",
      colors: "BG",
      wins: 7,
      losses: 0,
      draft_date: "2026-01-20",
    });
    await seedDraft(db, {
      id: "d-oth-wu",
      set: "OTH",
      colors: "WU",
      wins: 2,
      losses: 3,
      draft_date: "2026-02-01",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it("returns all drafts when no filters", async () => {
    const drafts = await listDrafts({});
    expect(drafts.map((d) => d.id)).toEqual(["d-oth-wu", "d-tst-bg", "d-tst-wu"]); // ORDER BY draft_date DESC
  });

  it("filters by set", async () => {
    const drafts = await listDrafts({ set: "TST" });
    expect(drafts.map((d) => d.id).sort()).toEqual(["d-tst-bg", "d-tst-wu"]);
  });

  it("filters by colors via LIKE %colors%", async () => {
    const drafts = await listDrafts({ colors: "WU" });
    expect(drafts.map((d) => d.id).sort()).toEqual(["d-oth-wu", "d-tst-wu"]);
  });

  it("filters by min_wins", async () => {
    const drafts = await listDrafts({ min_wins: 5 });
    expect(drafts.map((d) => d.id).sort()).toEqual(["d-tst-bg", "d-tst-wu"]);
  });

  it("filters by date range", async () => {
    const drafts = await listDrafts({ date_from: "2026-01-15", date_to: "2026-01-31" });
    expect(drafts.map((d) => d.id)).toEqual(["d-tst-bg"]);
  });

  it("respects limit", async () => {
    const drafts = await listDrafts({ limit: 1 });
    expect(drafts).toHaveLength(1);
  });

  it("combines multiple filters", async () => {
    const drafts = await listDrafts({ set: "TST", colors: "BG", min_wins: 7 });
    expect(drafts.map((d) => d.id)).toEqual(["d-tst-bg"]);
  });
});

describe("getMyStats", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
    vi.spyOn(clientModule, "getClient").mockResolvedValue(db);
    await seedDraft(db, { id: "a", colors: "WU", wins: 7, losses: 0 });
    await seedDraft(db, { id: "b", colors: "WU", wins: 4, losses: 3 });
    await seedDraft(db, { id: "c", colors: "BG", wins: 1, losses: 3 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it("aggregates totals and color_breakdown", async () => {
    const stats = await getMyStats({});
    expect(stats.total_drafts).toBe(3);
    expect(stats.total_wins).toBe(12);
    expect(stats.total_losses).toBe(6);
    expect(stats.trophies).toBe(1);
    expect(stats.win_rate).toBeCloseTo(12 / 18, 6);
    expect(stats.color_breakdown).toEqual({
      WU: { drafts: 2, wins: 11, losses: 3 },
      BG: { drafts: 1, wins: 1, losses: 3 },
    });
  });

  it("returns 0 win_rate when there are no games", async () => {
    db.close();
    db = await createTestDb();
    vi.spyOn(clientModule, "getClient").mockResolvedValue(db);

    const stats = await getMyStats({});
    expect(stats).toEqual({
      total_drafts: 0,
      total_wins: 0,
      total_losses: 0,
      win_rate: 0,
      trophies: 0,
      color_breakdown: {},
    });
  });
});

describe("searchDecks", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
    vi.spyOn(clientModule, "getClient").mockResolvedValue(db);
    await seedDraft(db, { id: "main-only", set: "TST", wins: 5 });
    await seedDraft(db, { id: "side-only", set: "TST", wins: 2 });
    await seedDraft(db, { id: "different-set", set: "OTH", wins: 7 });
    await db.batch([
      {
        sql: `INSERT INTO decklist_cards (draft_id, card_name, quantity, is_maindeck) VALUES (?, ?, ?, ?)`,
        args: ["main-only", "Lightning Bolt", 2, 1],
      },
      {
        sql: `INSERT INTO decklist_cards (draft_id, card_name, quantity, is_maindeck) VALUES (?, ?, ?, ?)`,
        args: ["side-only", "Lightning Bolt", 1, 0],
      },
      {
        sql: `INSERT INTO decklist_cards (draft_id, card_name, quantity, is_maindeck) VALUES (?, ?, ?, ?)`,
        args: ["different-set", "Lightning Bolt", 1, 1],
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it("returns both maindeck and sideboard hits when in_maindeck unset", async () => {
    const rows = await searchDecks({ card_name: "Lightning Bolt" });
    expect(rows.map((r) => r.draft_id).sort()).toEqual(["different-set", "main-only", "side-only"]);
  });

  it("filters to maindeck only when in_maindeck=true", async () => {
    const rows = await searchDecks({ card_name: "Lightning Bolt", in_maindeck: true });
    expect(rows.map((r) => r.draft_id).sort()).toEqual(["different-set", "main-only"]);
    for (const r of rows) {
      expect(r.in_maindeck).toBe(true);
    }
  });

  it("filters to sideboard only when in_maindeck=false", async () => {
    const rows = await searchDecks({ card_name: "Lightning Bolt", in_maindeck: false });
    expect(rows.map((r) => r.draft_id)).toEqual(["side-only"]);
    expect(rows[0].in_maindeck).toBe(false);
  });

  it("filters by set", async () => {
    const rows = await searchDecks({ card_name: "Lightning Bolt", set: "OTH" });
    expect(rows.map((r) => r.draft_id)).toEqual(["different-set"]);
  });

  it("filters by min_wins", async () => {
    const rows = await searchDecks({ card_name: "Lightning Bolt", min_wins: 5 });
    expect(rows.map((r) => r.draft_id).sort()).toEqual(["different-set", "main-only"]);
  });
});

describe("analyzeDeckChoices", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
    vi.spyOn(clientModule, "getClient").mockResolvedValue(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it("returns null when the draft does not exist", async () => {
    expect(await analyzeDeckChoices("nope")).toBeNull();
  });

  it("returns sideboard cards joined with card_stats and produces an assessment string", async () => {
    await seedDraft(db, { id: "d1", set: "TST", wins: 3, losses: 3 });
    await db.batch([
      { sql: `INSERT INTO cards (name) VALUES (?)`, args: ["Bomb"] },
      { sql: `INSERT INTO cards (name) VALUES (?)`, args: ["Vanilla"] },
      {
        sql: `INSERT INTO decklist_cards (draft_id, card_name, quantity, is_maindeck) VALUES (?, ?, ?, ?)`,
        args: ["d1", "Bomb", 1, 0],
      },
      {
        sql: `INSERT INTO decklist_cards (draft_id, card_name, quantity, is_maindeck) VALUES (?, ?, ?, ?)`,
        args: ["d1", "Vanilla", 1, 0],
      },
      {
        sql: `INSERT INTO decklist_cards (draft_id, card_name, quantity, is_maindeck) VALUES (?, ?, ?, ?)`,
        args: ["d1", "Maindeck Card", 23, 1],
      },
      {
        sql: `INSERT INTO card_stats (card_name, "set", avg_seen_at, avg_pick_at, game_in_hand_wr, times_seen, times_picked, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ["Bomb", "TST", null, 1.5, 0.62, 100, 90, "2026-01-01"],
      },
      {
        sql: `INSERT INTO card_stats (card_name, "set", avg_seen_at, avg_pick_at, game_in_hand_wr, times_seen, times_picked, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ["Vanilla", "TST", null, 8.0, 0.45, 100, 30, "2026-01-01"],
      },
    ]);

    const result = await analyzeDeckChoices("d1");
    expect(result).not.toBeNull();
    expect(result!.draft_id).toBe("d1");
    expect(result!.wins).toBe(3);
    expect(result!.sideboard_analysis).toHaveLength(2);

    const byName = Object.fromEntries(result!.sideboard_analysis.map((s) => [s.name, s]));
    expect(byName.Bomb.gih_wr).toBe(0.62);
    expect(byName.Bomb.assessment).toMatch(/High GIH WR/);
    expect(byName.Vanilla.assessment).toMatch(/Below average GIH WR/);
  });
});

describe("getMyCardHistory", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
    vi.spyOn(clientModule, "getClient").mockResolvedValue(db);
    await seedDraft(db, { id: "d1", set: "TST", wins: 3, losses: 3, draft_date: "2026-01-01" });
    await seedDraft(db, { id: "d2", set: "OTH", wins: 7, losses: 0, draft_date: "2026-02-01" });
    await db.batch([
      {
        sql: `INSERT INTO picks (draft_id, pack_number, pick_number, card_name, available_cards) VALUES (?, ?, ?, ?, ?)`,
        args: ["d1", 0, 0, "Plains", "[]"],
      },
      {
        sql: `INSERT INTO picks (draft_id, pack_number, pick_number, card_name, available_cards) VALUES (?, ?, ?, ?, ?)`,
        args: ["d2", 1, 4, "Plains", "[]"],
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it("returns history across all sets when set is omitted", async () => {
    const history = await getMyCardHistory("Plains");
    expect(history.times_drafted).toBe(2);
    expect(history.drafts.map((d) => d.draft_id)).toEqual(["d2", "d1"]); // ORDER BY draft_date DESC
  });

  it("filters by set when provided", async () => {
    const history = await getMyCardHistory("Plains", "TST");
    expect(history.times_drafted).toBe(1);
    expect(history.drafts.map((d) => d.draft_id)).toEqual(["d1"]);
  });
});
