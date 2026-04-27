/**
 * Sync format-level stats from 17lands: play/draw rates, color ratings, card stats, and trophy decklists.
 */

import type {
  SeventeenLandsClient,
  SeventeenLandsTrophyDeck,
  SeventeenLandsDeck,
} from "../core/seventeen-lands";
import type { Client as DbClient } from "../core/db/client";

/**
 * Extract main colors from trophy deck color string.
 * Colors like "WU", "BGr", "URwb" → main colors are uppercase (first 2-3 letters).
 */
function extractMainColors(colors: string): string {
  // Extract uppercase letters (main colors, not splashes)
  const mainColors = colors.match(/[A-Z]/g) || [];
  // Sort for consistency (WUBRG order)
  const colorOrder = "WUBRG";
  return mainColors.sort((a, b) => colorOrder.indexOf(a) - colorOrder.indexOf(b)).join("");
}

/**
 * Select diverse trophy decks: up to 5 per color pair, prioritizing fewer losses.
 * Returns ~30 decks maximum.
 */
function selectDiverseTrophyDecks(decks: SeventeenLandsTrophyDeck[]): SeventeenLandsTrophyDeck[] {
  // Group by main colors
  const byColors = new Map<string, SeventeenLandsTrophyDeck[]>();
  for (const deck of decks) {
    const mainColors = extractMainColors(deck.colors);
    if (!byColors.has(mainColors)) {
      byColors.set(mainColors, []);
    }
    byColors.get(mainColors)!.push(deck);
  }

  // Sort each group by losses ascending (7-0 first)
  for (const group of byColors.values()) {
    group.sort((a, b) => a.losses - b.losses);
  }

  // Take up to 5 from each color pair
  const selected: SeventeenLandsTrophyDeck[] = [];
  for (const [, group] of byColors) {
    selected.push(...group.slice(0, 5));
  }

  // Cap at 30 total
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
 * Count existing trophy decklists for a set.
 */
async function getTrophyDecklistCount(db: DbClient, set: string): Promise<number> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM decklists WHERE "set" = ? AND source = 'trophy'`,
    args: [set],
  });
  return Number(result.rows[0].count);
}

/**
 * Insert a trophy decklist into the database.
 */
async function insertTrophyDecklist(
  db: DbClient,
  draftId: string,
  set: string,
  deck: SeventeenLandsDeck
): Promise<void> {
  const colors = deck.main_colors || "unknown";

  // Check if we already have cards for this deck
  const existing = await db.execute({
    sql: `SELECT 1 FROM decklist_cards WHERE draft_id = ? LIMIT 1`,
    args: [draftId],
  });
  if (existing.rows.length > 0) {
    console.log(`  [turso] Skipping ${draftId} (${colors}) - already exists`);
    return;
  }

  // Insert decklist metadata with source='trophy'
  await db.execute({
    sql: `INSERT OR IGNORE INTO decklists (draft_id, "set", main_colors, splash_colors, source)
          VALUES (?, ?, ?, ?, 'trophy')`,
    args: [draftId, set, deck.main_colors || null, deck.splash_colors || null],
  });
  console.log(`  [turso] Inserted decklist ${draftId} (${colors})`);

  // Count cards by ID
  const countCards = (cardIds: number[]): Map<number, number> => {
    const counts = new Map<number, number>();
    for (const id of cardIds) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  };

  // Process each group (Maindeck, Sideboard)
  let cardsInserted = 0;
  for (const group of deck.groups) {
    const isMaindeck = group.name === "Maindeck" ? 1 : 0;
    const cardCounts = countCards(group.cards);

    for (const [cardId, quantity] of cardCounts) {
      const card = deck.cards[cardId.toString()];
      if (!card) continue;

      // Upsert card if missing
      await db.execute({
        sql: `INSERT OR IGNORE INTO cards (name, image_url, types, mana_cost, colors, cmc, rarity)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          card.name,
          card.image_url,
          card.types.join(" "),
          card.mana_cost,
          card.color_identity.join(""),
          card.cmc,
          card.rarity,
        ],
      });

      // Insert decklist card
      await db.execute({
        sql: `INSERT OR IGNORE INTO decklist_cards (draft_id, card_name, quantity, is_maindeck)
              VALUES (?, ?, ?, ?)`,
        args: [draftId, card.name, quantity, isMaindeck],
      });
      cardsInserted++;
    }
  }
  console.log(`  [turso] Inserted ${cardsInserted} cards for ${draftId}`);
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

  // Get user's sets from drafts table
  const setsResult = await db.execute('SELECT DISTINCT "set" FROM drafts');
  const userSets = new Set(setsResult.rows.map((r) => r.set as string));
  console.log(`User has drafts in ${userSets.size} sets: ${[...userSets].join(", ")}`);

  // 1. Sync play/draw stats (skip if updated this week)
  if (!dryRun && (await wasUpdatedThisWeek(db, "format_play_draw"))) {
    console.log("Skipping play/draw stats - already updated this week");
  } else {
    console.log("Syncing play/draw stats...");
    const playDrawStats = await api.getPlayDrawStats();

    // Filter to user's sets only
    const relevantPlayDraw = playDrawStats.filter((s) => userSets.has(s.expansion));
    console.log(`Found ${relevantPlayDraw.length} play/draw stats for user's sets`);

    if (dryRun) {
      console.log("Play/draw stats that would be upserted:");
      for (const stat of relevantPlayDraw) {
        console.log(
          `  - ${stat.expansion} ${stat.event_type}: play WR ${(stat.win_rate_on_play * 100).toFixed(1)}%, avg ${stat.average_game_length.toFixed(1)} turns (n=${stat.sample_size})`
        );
      }
    } else {
      for (const stat of relevantPlayDraw) {
        await db.execute({
          sql: `INSERT INTO format_play_draw ("set", event_type, avg_game_length, play_win_rate, sample_size, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT("set", event_type) DO UPDATE SET
                  avg_game_length = excluded.avg_game_length,
                  play_win_rate = excluded.play_win_rate,
                  sample_size = excluded.sample_size,
                  updated_at = excluded.updated_at`,
          args: [
            stat.expansion,
            stat.event_type,
            stat.average_game_length,
            stat.win_rate_on_play,
            stat.sample_size,
            now,
          ],
        });
      }
      console.log(`[turso] Upserted ${relevantPlayDraw.length} play/draw stats`);
    }
  }

  // 2. For each set: color ratings (weekly) + trophy decks (every sync, up to 30 cap)
  for (const set of userSets) {
    try {
      // Color stats: refresh weekly
      const colorStatsUpToDate =
        !dryRun && (await wasUpdatedThisWeek(db, "format_color_stats", set));
      if (colorStatsUpToDate) {
        console.log(`Skipping ${set} color stats - already updated this week`);
      } else {
        console.log(`Syncing color stats for ${set}...`);

        // Fetch color ratings
        const colorRatings = await api.getColorRatings(set, "PremierDraft", startDate, endDate);
        console.log(`  Found ${colorRatings.length} color ratings`);

        if (dryRun) {
          console.log(`  Color ratings for ${set}:`);
          for (const rating of colorRatings.slice(0, 5)) {
            const winRate =
              rating.games > 0 ? ((rating.wins / rating.games) * 100).toFixed(1) : "N/A";
            console.log(
              `    - ${rating.color_name} (${rating.short_name}): ${winRate}% WR (${rating.games} games)`
            );
          }
          if (colorRatings.length > 5) {
            console.log(`    ... and ${colorRatings.length - 5} more`);
          }
        } else {
          for (const rating of colorRatings) {
            await db.execute({
              sql: `INSERT INTO format_color_stats ("set", event_type, color_code, color_name, wins, games, is_summary, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT("set", event_type, color_code) DO UPDATE SET
                      color_name = excluded.color_name,
                      wins = excluded.wins,
                      games = excluded.games,
                      is_summary = excluded.is_summary,
                      updated_at = excluded.updated_at`,
              args: [
                set,
                "PremierDraft", // Default event type for color ratings
                String(rating.short_name),
                rating.color_name,
                rating.wins,
                rating.games,
                rating.is_summary ? 1 : 0,
                now,
              ],
            });
          }
          console.log(`[turso] Upserted ${colorRatings.length} color ratings for ${set}`);
        }
      }

      // Card stats: refresh weekly (PremierDraft/Bo1 aggregate data)
      const cardStatsUpToDate = !dryRun && (await wasUpdatedThisWeek(db, "card_stats", set));
      if (cardStatsUpToDate) {
        console.log(`Skipping ${set} card stats - already updated this week`);
      } else {
        console.log(`Syncing card stats for ${set}...`);

        const cardRatings = await api.getCardRatings(set, "PremierDraft", startDate, endDate);
        console.log(`  Found ${cardRatings.length} card ratings`);

        if (dryRun) {
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
        } else {
          const BATCH_SIZE = 50;

          // Ensure all cards exist in cards table
          for (let i = 0; i < cardRatings.length; i += BATCH_SIZE) {
            const batch = cardRatings.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => "(?)").join(", ");
            const args = batch.map((c) => c.name);
            await db.execute({
              sql: `INSERT OR IGNORE INTO cards (name) VALUES ${placeholders}`,
              args,
            });
          }

          // Upsert card stats
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
              now,
            ]);
            await db.execute({
              sql: `INSERT OR REPLACE INTO card_stats (card_name, "set", avg_seen_at, avg_pick_at, game_in_hand_wr, times_seen, times_picked, updated_at) VALUES ${placeholders}`,
              args,
            });
          }
          console.log(`[turso] Upserted ${cardRatings.length} card stats for ${set}`);
        }
      }

      // Trophy decks: every sync, up to 30 cap
      const existingTrophyCount = await getTrophyDecklistCount(db, set);
      if (existingTrophyCount >= 30) {
        console.log(`Skipping ${set} trophy decks - already have ${existingTrophyCount}`);
      } else {
        console.log(`Syncing trophy decks for ${set}...`);

        // Fetch trophy decks
        const trophyDecks = await api.getTrophyDecks(set, "PremierDraft");
        console.log(`  Found ${trophyDecks.length} trophy decks`);

        // Select diverse subset
        const selectedDecks = selectDiverseTrophyDecks(trophyDecks);
        console.log(`  Selected ${selectedDecks.length} diverse trophy decks`);

        if (dryRun) {
          // Count by color pair for summary
          const colorCounts = new Map<string, number>();
          for (const deck of selectedDecks) {
            const colors = extractMainColors(deck.colors);
            colorCounts.set(colors, (colorCounts.get(colors) || 0) + 1);
          }
          console.log(`  Trophy decks by color pair:`);
          for (const [colors, count] of colorCounts) {
            console.log(`    - ${colors}: ${count}`);
          }
        } else {
          // Fetch and insert each trophy decklist
          let synced = 0;
          let failed = 0;
          for (const trophyDeck of selectedDecks) {
            try {
              const deck = await api.getDeck(trophyDeck.aggregate_id, trophyDeck.deck_index);
              await insertTrophyDecklist(db, trophyDeck.aggregate_id, set, deck);
              synced++;
            } catch (err) {
              failed++;
              const errMsg = err instanceof Error ? err.message : String(err);
              console.error(`  Failed to sync trophy deck ${trophyDeck.aggregate_id}: ${errMsg}`);
            }
          }
          console.log(`[turso] Synced ${synced} trophy decklists for ${set} (${failed} failed)`);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`Skipping format stats for ${set}: ${errMsg}`);
      continue;
    }
  }

  console.log("Format stats sync complete");
}
