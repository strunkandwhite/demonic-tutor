/**
 * Sync format-level stats from 17lands: play/draw rates, color ratings, card stats, and trophy decklists.
 */

import type {
  SeventeenLandsClient,
  SeventeenLandsTrophyDeck,
  SeventeenLandsColorRating,
  SeventeenLandsPlayDrawStats,
} from "../core/seventeen-lands";
import type { Client as DbClient } from "../core/db/client";
import { upsertDecklist } from "./decklists";

/**
 * Extract main colors from trophy deck color string.
 * Colors like "WU", "BGr", "URwb" → main colors are uppercase (first 2-3 letters).
 */
export function extractMainColors(colors: string): string {
  const mainColors = colors.match(/[A-Z]/g) || [];
  const colorOrder = "WUBRG";
  return mainColors.sort((a, b) => colorOrder.indexOf(a) - colorOrder.indexOf(b)).join("");
}

/**
 * Select diverse trophy decks: up to 5 per color pair, prioritizing fewer losses.
 * Returns ~30 decks maximum.
 */
export function selectDiverseTrophyDecks(
  decks: SeventeenLandsTrophyDeck[]
): SeventeenLandsTrophyDeck[] {
  const byColors = new Map<string, SeventeenLandsTrophyDeck[]>();
  for (const deck of decks) {
    const mainColors = extractMainColors(deck.colors);
    if (!byColors.has(mainColors)) {
      byColors.set(mainColors, []);
    }
    byColors.get(mainColors)!.push(deck);
  }

  for (const group of byColors.values()) {
    group.sort((a, b) => a.losses - b.losses);
  }

  const selected: SeventeenLandsTrophyDeck[] = [];
  for (const [, group] of byColors) {
    selected.push(...group.slice(0, 5));
  }

  return selected.slice(0, 30);
}

type WeeklyTable = "format_color_stats" | "format_play_draw" | "card_stats";
const WEEKLY_TABLES: readonly WeeklyTable[] = [
  "format_color_stats",
  "format_play_draw",
  "card_stats",
];

/**
 * Check if any row in the given table was updated in the last week.
 *
 * Pass `set` to scope the check to a single set (uses the `"set"` column,
 * which is a SQL reserved word and must be quoted). Table name is an
 * allowlist literal — never interpolate user input here.
 */
async function wasUpdatedThisWeek(
  db: DbClient,
  table: WeeklyTable,
  set?: string
): Promise<boolean> {
  if (!WEEKLY_TABLES.includes(table)) {
    throw new Error(`wasUpdatedThisWeek: invalid table ${table}`);
  }
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const sql =
    set === undefined
      ? `SELECT MAX(updated_at) AS last FROM ${table}`
      : `SELECT MAX(updated_at) AS last FROM ${table} WHERE "set" = ?`;
  const args = set === undefined ? [] : [set];
  const result = await db.execute({ sql, args });
  const last = result.rows[0]?.last as string | null | undefined;
  return !!last && last >= weekAgo;
}

/**
 * Upsert all play/draw stats in a single multi-row INSERT ... ON CONFLICT.
 * No-op when stats is empty.
 */
export async function upsertPlayDrawBatch(
  db: DbClient,
  stats: readonly SeventeenLandsPlayDrawStats[],
  now: string
): Promise<void> {
  if (stats.length === 0) return;
  const placeholders = stats.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
  const args = stats.flatMap((s) => [
    s.expansion,
    s.event_type,
    s.average_game_length,
    s.win_rate_on_play,
    s.sample_size,
    now,
  ]);
  await db.execute({
    sql: `INSERT INTO format_play_draw ("set", event_type, avg_game_length, play_win_rate, sample_size, updated_at)
          VALUES ${placeholders}
          ON CONFLICT("set", event_type) DO UPDATE SET
            avg_game_length = excluded.avg_game_length,
            play_win_rate = excluded.play_win_rate,
            sample_size = excluded.sample_size,
            updated_at = excluded.updated_at`,
    args,
  });
}

/**
 * Upsert all color ratings for a set in a single multi-row INSERT ... ON CONFLICT.
 * No-op when ratings is empty.
 */
export async function upsertColorRatingsBatch(
  db: DbClient,
  set: string,
  ratings: readonly SeventeenLandsColorRating[],
  now: string
): Promise<void> {
  if (ratings.length === 0) return;
  const placeholders = ratings.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const args = ratings.flatMap((r) => [
    set,
    "PremierDraft",
    String(r.short_name),
    r.color_name,
    r.wins,
    r.games,
    r.is_summary ? 1 : 0,
    now,
  ]);
  await db.execute({
    sql: `INSERT INTO format_color_stats ("set", event_type, color_code, color_name, wins, games, is_summary, updated_at)
          VALUES ${placeholders}
          ON CONFLICT("set", event_type, color_code) DO UPDATE SET
            color_name = excluded.color_name,
            wins = excluded.wins,
            games = excluded.games,
            is_summary = excluded.is_summary,
            updated_at = excluded.updated_at`,
    args,
  });
}

/**
 * Count existing trophy decklists for a set.
 */
async function getTrophyDecklistCount(db: DbClient, set: string): Promise<number> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM decklists WHERE "set" = ? AND source = 'trophy'`,
    args: [set],
  });
  return Number(result.rows[0].count);
}

interface SyncContext {
  api: SeventeenLandsClient;
  db: DbClient;
  dryRun: boolean;
  /** ISO timestamp captured once at the top of the run, used as updated_at. */
  now: string;
  /** YYYY-MM-DD lower bound for stat lookups (last 30 days). */
  startDate: string;
  /** YYYY-MM-DD upper bound. */
  endDate: string;
}

async function syncPlayDraw(ctx: SyncContext, userSets: ReadonlySet<string>): Promise<void> {
  if (!ctx.dryRun && (await wasUpdatedThisWeek(ctx.db, "format_play_draw"))) {
    console.log("Skipping play/draw stats - already updated this week");
    return;
  }

  console.log("Syncing play/draw stats...");
  const playDrawStats = await ctx.api.getPlayDrawStats();
  const relevantPlayDraw = playDrawStats.filter((s) => userSets.has(s.expansion));
  console.log(`Found ${relevantPlayDraw.length} play/draw stats for user's sets`);

  if (ctx.dryRun) {
    console.log("Play/draw stats that would be upserted:");
    for (const stat of relevantPlayDraw) {
      console.log(
        `  - ${stat.expansion} ${stat.event_type}: play WR ${(stat.win_rate_on_play * 100).toFixed(1)}%, avg ${stat.average_game_length.toFixed(1)} turns (n=${stat.sample_size})`
      );
    }
    return;
  }

  await upsertPlayDrawBatch(ctx.db, relevantPlayDraw, ctx.now);
  console.log(`[turso] Upserted ${relevantPlayDraw.length} play/draw stats`);
}

async function syncColorStats(ctx: SyncContext, set: string): Promise<void> {
  if (!ctx.dryRun && (await wasUpdatedThisWeek(ctx.db, "format_color_stats", set))) {
    console.log(`Skipping ${set} color stats - already updated this week`);
    return;
  }

  console.log(`Syncing color stats for ${set}...`);
  const colorRatings = await ctx.api.getColorRatings(
    set,
    "PremierDraft",
    ctx.startDate,
    ctx.endDate
  );
  console.log(`  Found ${colorRatings.length} color ratings`);

  if (ctx.dryRun) {
    console.log(`  Color ratings for ${set}:`);
    for (const rating of colorRatings.slice(0, 5)) {
      const winRate = rating.games > 0 ? ((rating.wins / rating.games) * 100).toFixed(1) : "N/A";
      console.log(
        `    - ${rating.color_name} (${rating.short_name}): ${winRate}% WR (${rating.games} games)`
      );
    }
    if (colorRatings.length > 5) {
      console.log(`    ... and ${colorRatings.length - 5} more`);
    }
    return;
  }

  await upsertColorRatingsBatch(ctx.db, set, colorRatings, ctx.now);
  console.log(`[turso] Upserted ${colorRatings.length} color ratings for ${set}`);
}

async function syncCardStats(ctx: SyncContext, set: string): Promise<void> {
  if (!ctx.dryRun && (await wasUpdatedThisWeek(ctx.db, "card_stats", set))) {
    console.log(`Skipping ${set} card stats - already updated this week`);
    return;
  }

  console.log(`Syncing card stats for ${set}...`);
  const cardRatings = await ctx.api.getCardRatings(set, "PremierDraft", ctx.startDate, ctx.endDate);
  console.log(`  Found ${cardRatings.length} card ratings`);

  if (ctx.dryRun) {
    const sorted = [...cardRatings]
      .filter((c) => c.ever_drawn_win_rate !== null)
      .sort((a, b) => (b.ever_drawn_win_rate ?? 0) - (a.ever_drawn_win_rate ?? 0));
    console.log(`  Top cards for ${set} by GIH WR:`);
    for (const card of sorted.slice(0, 5)) {
      console.log(
        `    - ${card.name}: ${((card.ever_drawn_win_rate ?? 0) * 100).toFixed(1)}% GIH WR`
      );
    }
    if (cardRatings.length > 5) {
      console.log(`    ... and ${cardRatings.length - 5} more`);
    }
    return;
  }

  const BATCH_SIZE = 50;

  for (let i = 0; i < cardRatings.length; i += BATCH_SIZE) {
    const batch = cardRatings.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "(?)").join(", ");
    const args = batch.map((c) => c.name);
    await ctx.db.execute({
      sql: `INSERT OR IGNORE INTO cards (name) VALUES ${placeholders}`,
      args,
    });
  }

  for (let i = 0; i < cardRatings.length; i += BATCH_SIZE) {
    const batch = cardRatings.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const args = batch.flatMap((card) => [
      card.name,
      set,
      card.avg_seen,
      card.avg_pick,
      card.ever_drawn_win_rate,
      card.seen_count,
      card.pick_count,
      ctx.now,
    ]);
    await ctx.db.execute({
      sql: `INSERT OR REPLACE INTO card_stats (card_name, "set", avg_seen_at, avg_pick_at, game_in_hand_wr, times_seen, times_picked, updated_at) VALUES ${placeholders}`,
      args,
    });
  }
  console.log(`[turso] Upserted ${cardRatings.length} card stats for ${set}`);
}

async function syncTrophyDecks(ctx: SyncContext, set: string): Promise<void> {
  const existingTrophyCount = await getTrophyDecklistCount(ctx.db, set);
  if (existingTrophyCount >= 30) {
    console.log(`Skipping ${set} trophy decks - already have ${existingTrophyCount}`);
    return;
  }

  console.log(`Syncing trophy decks for ${set}...`);
  const trophyDecks = await ctx.api.getTrophyDecks(set, "PremierDraft");
  console.log(`  Found ${trophyDecks.length} trophy decks`);

  const selectedDecks = selectDiverseTrophyDecks(trophyDecks);
  console.log(`  Selected ${selectedDecks.length} diverse trophy decks`);

  if (ctx.dryRun) {
    const colorCounts = new Map<string, number>();
    for (const deck of selectedDecks) {
      const colors = extractMainColors(deck.colors);
      colorCounts.set(colors, (colorCounts.get(colors) || 0) + 1);
    }
    console.log(`  Trophy decks by color pair:`);
    for (const [colors, count] of colorCounts) {
      console.log(`    - ${colors}: ${count}`);
    }
    return;
  }

  let synced = 0;
  let failed = 0;
  for (const trophyDeck of selectedDecks) {
    try {
      const deck = await ctx.api.getDeck(trophyDeck.aggregate_id, trophyDeck.deck_index);
      const result = await upsertDecklist(ctx.db, trophyDeck.aggregate_id, set, deck, "trophy");
      if (result.inserted) {
        synced++;
        console.log(
          `  [turso] Inserted trophy deck ${trophyDeck.aggregate_id} (${result.cardsInserted} cards)`
        );
      } else {
        console.log(`  [turso] Skipping ${trophyDeck.aggregate_id} - already exists`);
      }
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  Failed to sync trophy deck ${trophyDeck.aggregate_id}: ${errMsg}`);
    }
  }
  console.log(`[turso] Synced ${synced} trophy decklists for ${set} (${failed} failed)`);
}

export async function syncFormatStats(
  api: SeventeenLandsClient,
  db: DbClient,
  dryRun: boolean
): Promise<void> {
  const now = new Date().toISOString();

  // Calculate date range for API calls (last 30 days)
  const endDate = new Date().toISOString().split("T")[0];
  const startDateObj = new Date();
  startDateObj.setDate(startDateObj.getDate() - 30);
  const startDate = startDateObj.toISOString().split("T")[0];

  const setsResult = await db.execute('SELECT DISTINCT "set" FROM drafts');
  const userSets = new Set(setsResult.rows.map((r) => r.set as string));
  console.log(`User has drafts in ${userSets.size} sets: ${[...userSets].join(", ")}`);

  const ctx: SyncContext = { api, db, dryRun, now, startDate, endDate };

  await syncPlayDraw(ctx, userSets);

  for (const set of userSets) {
    try {
      await syncColorStats(ctx, set);
      await syncCardStats(ctx, set);
      await syncTrophyDecks(ctx, set);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Skipping format stats for ${set}: ${errMsg}`);
      continue;
    }
  }

  console.log("Format stats sync complete");
}
