/**
 * Sync format-level stats from 17lands: play/draw rates, color ratings, and trophy decklists.
 */

import type {
  SeventeenLandsClient,
  SeventeenLandsTrophyDeck,
  SeventeenLandsDeck,
} from "../core/seventeen-lands";

type DbClient = {
  execute: (
    sql: string | { sql: string; args: unknown[] }
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

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

/**
 * Check if format_color_stats for a set was updated today.
 */
async function wasColorStatsUpdatedToday(db: DbClient, set: string): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];
  const result = await db.execute({
    sql: `SELECT 1 FROM format_color_stats WHERE "set" = ? AND updated_at >= ? LIMIT 1`,
    args: [set, today],
  });
  return result.rows.length > 0;
}

/**
 * Insert a trophy decklist into the database.
 */
async function insertTrophyDecklist(
  db: DbClient,
  draftId: string,
  deck: SeventeenLandsDeck
): Promise<void> {
  // Insert decklist metadata with source='trophy'
  await db.execute({
    sql: `INSERT OR IGNORE INTO decklists (draft_id, main_colors, splash_colors, source)
          VALUES (?, ?, ?, 'trophy')`,
    args: [draftId, deck.main_colors || null, deck.splash_colors || null],
  });

  // Check if we actually inserted (might already exist)
  const existing = await db.execute({
    sql: `SELECT 1 FROM decklist_cards WHERE draft_id = ? LIMIT 1`,
    args: [draftId],
  });
  if (existing.rows.length > 0) {
    return; // Already have cards for this deck
  }

  // Count cards by ID
  const countCards = (cardIds: number[]): Map<number, number> => {
    const counts = new Map<number, number>();
    for (const id of cardIds) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  };

  // Process each group (Maindeck, Sideboard)
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
    }
  }
}

export async function syncFormatStats(
  api: SeventeenLandsClient,
  db: DbClient,
  dryRun: boolean
): Promise<void> {
  const now = new Date().toISOString();

  // 1. Sync play/draw stats (every sync)
  console.log("Syncing play/draw stats...");
  const playDrawStats = await api.getPlayDrawStats();

  // Get user's sets from drafts table
  const setsResult = await db.execute('SELECT DISTINCT "set" FROM drafts');
  const userSets = new Set(setsResult.rows.map((r) => r.set as string));
  console.log(`User has drafts in ${userSets.size} sets: ${[...userSets].join(", ")}`);

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

  // 2. For each set: color ratings + trophy decks
  for (const set of userSets) {
    // Check if already updated today
    if (!dryRun && (await wasColorStatsUpdatedToday(db, set))) {
      console.log(`Skipping ${set} - color stats already updated today`);
      continue;
    }

    console.log(`Syncing format stats for ${set}...`);

    // Fetch color ratings
    const colorRatings = await api.getColorRatings(set);
    console.log(`  Found ${colorRatings.length} color ratings`);

    if (dryRun) {
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

    // Fetch trophy decks
    const trophyDecks = await api.getTrophyDecks(set);
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
          await insertTrophyDecklist(db, trophyDeck.aggregate_id, deck);
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

  console.log("Format stats sync complete");
}
