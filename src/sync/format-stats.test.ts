import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { createTestDb } from "@/test/db";
import {
  extractMainColors,
  selectDiverseTrophyDecks,
  upsertColorRatingsBatch,
  upsertPlayDrawBatch,
} from "./format-stats";
import type {
  SeventeenLandsColorRating,
  SeventeenLandsPlayDrawStats,
  SeventeenLandsTrophyDeck,
} from "@/core/seventeen-lands";

function makeTrophy(
  partial: Partial<SeventeenLandsTrophyDeck> & { aggregate_id: string; colors: string }
): SeventeenLandsTrophyDeck {
  return {
    wins: 7,
    losses: 0,
    start_rank: "Gold-1",
    end_rank: "Platinum-4",
    deck_index: 0,
    time: "2026-01-01 00:00:00",
    has_draft: true,
    ...partial,
  };
}

describe("extractMainColors", () => {
  it("returns uppercase main colors only", () => {
    expect(extractMainColors("WU")).toBe("WU");
    expect(extractMainColors("BG")).toBe("BG");
  });

  it("strips lowercase splash colors", () => {
    expect(extractMainColors("BGr")).toBe("BG");
    expect(extractMainColors("URwb")).toBe("UR");
  });

  it("sorts colors in WUBRG order", () => {
    expect(extractMainColors("UB")).toBe("UB");
    expect(extractMainColors("BU")).toBe("UB"); // re-sorted
    expect(extractMainColors("RGW")).toBe("WRG");
  });

  it("returns empty string when there are no main colors", () => {
    expect(extractMainColors("")).toBe("");
    expect(extractMainColors("rgb")).toBe("");
  });
});

describe("selectDiverseTrophyDecks", () => {
  it("returns empty for empty input", () => {
    expect(selectDiverseTrophyDecks([])).toEqual([]);
  });

  it("caps at 5 decks per color pair", () => {
    const decks = Array.from({ length: 8 }, (_, i) =>
      makeTrophy({ aggregate_id: `wu-${i}`, colors: "WU", losses: i })
    );
    const result = selectDiverseTrophyDecks(decks);
    expect(result).toHaveLength(5);
    // Sorted by losses ascending — first 5 of [0..7] = [0..4]
    expect(result.map((d) => d.aggregate_id)).toEqual(["wu-0", "wu-1", "wu-2", "wu-3", "wu-4"]);
  });

  it("keeps up to 5 per pair across multiple color pairs", () => {
    const decks = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeTrophy({ aggregate_id: `wu-${i}`, colors: "WU", losses: 0 })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeTrophy({ aggregate_id: `bg-${i}`, colors: "BG", losses: i })
      ),
    ];
    const result = selectDiverseTrophyDecks(decks);
    // 3 WU + 5 BG = 8 total
    expect(result).toHaveLength(8);
    expect(result.filter((d) => d.colors === "WU")).toHaveLength(3);
    expect(result.filter((d) => d.colors === "BG")).toHaveLength(5);
  });

  it("caps total result at 30", () => {
    // 10 color pairs × 5 decks each = 50; should cap at 30
    const colorPairs = ["WU", "WB", "WR", "WG", "UB", "UR", "UG", "BR", "BG", "RG"];
    const decks = colorPairs.flatMap((colors) =>
      Array.from({ length: 5 }, (_, i) => makeTrophy({ aggregate_id: `${colors}-${i}`, colors }))
    );
    const result = selectDiverseTrophyDecks(decks);
    expect(result).toHaveLength(30);
  });

  it("treats splash variants of the same main pair as one bucket", () => {
    const decks = [
      makeTrophy({ aggregate_id: "wu-clean", colors: "WU" }),
      makeTrophy({ aggregate_id: "wu-rsplash", colors: "WUr" }), // same main pair WU
    ];
    const result = selectDiverseTrophyDecks(decks);
    // Both have main colors "WU", so they live in the same bucket of size 2 (≤5 cap).
    expect(result).toHaveLength(2);
  });
});

describe("upsertPlayDrawBatch", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  const stats: SeventeenLandsPlayDrawStats[] = [
    {
      expansion: "TST",
      event_type: "PremierDraft",
      average_game_length: 8.5,
      win_rate_on_play: 0.55,
      sample_size: 10000,
      turns: [],
    },
    {
      expansion: "OTH",
      event_type: "PremierDraft",
      average_game_length: 9.0,
      win_rate_on_play: 0.54,
      sample_size: 5000,
      turns: [],
    },
  ];

  it("inserts rows on first call", async () => {
    await upsertPlayDrawBatch(db, stats, "2026-04-26");
    const rows = await db.execute(
      `SELECT "set", play_win_rate, sample_size FROM format_play_draw ORDER BY "set"`
    );
    expect(rows.rows).toEqual([
      { set: "OTH", play_win_rate: 0.54, sample_size: 5000 },
      { set: "TST", play_win_rate: 0.55, sample_size: 10000 },
    ]);
  });

  it("ON CONFLICT updates instead of duplicating", async () => {
    await upsertPlayDrawBatch(db, stats, "2026-04-26");

    const updated: SeventeenLandsPlayDrawStats[] = [
      { ...stats[0], win_rate_on_play: 0.6, sample_size: 12000 },
    ];
    await upsertPlayDrawBatch(db, updated, "2026-04-27");

    const rows = await db.execute(
      `SELECT "set", play_win_rate, sample_size, updated_at FROM format_play_draw WHERE "set" = 'TST'`
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].play_win_rate).toBe(0.6);
    expect(rows.rows[0].sample_size).toBe(12000);
    expect(rows.rows[0].updated_at).toBe("2026-04-27");
  });

  it("is a no-op on empty input", async () => {
    await upsertPlayDrawBatch(db, [], "2026-04-26");
    const rows = await db.execute(`SELECT COUNT(*) as count FROM format_play_draw`);
    expect(rows.rows[0].count).toBe(0);
  });
});

describe("upsertColorRatingsBatch", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  const ratings: SeventeenLandsColorRating[] = [
    {
      is_summary: false,
      color_name: "Azorius (WU)",
      short_name: "WU",
      wins: 1100,
      games: 2000,
    },
    {
      is_summary: false,
      color_name: "Mono-red (R)",
      short_name: "R",
      wins: 600,
      games: 1000,
    },
    {
      is_summary: true,
      color_name: "Two-color",
      short_name: 2,
      wins: 5000,
      games: 9500,
    },
  ];

  it("inserts rows on first call", async () => {
    await upsertColorRatingsBatch(db, "TST", ratings, "2026-04-26");
    const rows = await db.execute(
      `SELECT color_code, color_name, wins, games, is_summary FROM format_color_stats WHERE "set" = 'TST' ORDER BY color_code`
    );
    expect(rows.rows.length).toBe(3);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.color_code, r]));
    expect(byCode.WU.wins).toBe(1100);
    expect(byCode.R.color_name).toBe("Mono-red (R)");
    // short_name 2 (number) is stored as the string "2"
    expect(byCode["2"].is_summary).toBe(1);
  });

  it("ON CONFLICT updates instead of duplicating", async () => {
    await upsertColorRatingsBatch(db, "TST", ratings, "2026-04-26");

    const updated: SeventeenLandsColorRating[] = [{ ...ratings[0], wins: 1200, games: 2100 }];
    await upsertColorRatingsBatch(db, "TST", updated, "2026-04-27");

    const rows = await db.execute(
      `SELECT wins, games, updated_at FROM format_color_stats WHERE "set" = 'TST' AND color_code = 'WU'`
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].wins).toBe(1200);
    expect(rows.rows[0].games).toBe(2100);
    expect(rows.rows[0].updated_at).toBe("2026-04-27");
  });

  it("is a no-op on empty input", async () => {
    await upsertColorRatingsBatch(db, "TST", [], "2026-04-26");
    const rows = await db.execute(`SELECT COUNT(*) as count FROM format_color_stats`);
    expect(rows.rows[0].count).toBe(0);
  });
});
