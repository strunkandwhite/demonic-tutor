import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@libsql/client";
import { createTestDb } from "@/test/db";
import { upsertColorRatingsBatch, upsertPlayDrawBatch } from "./format-stats";
import type {
  SeventeenLandsColorRating,
  SeventeenLandsPlayDrawStats,
} from "@/core/seventeen-lands";

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
