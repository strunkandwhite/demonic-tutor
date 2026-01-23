/**
 * Sync drafts from 17lands to local database.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { getClient, closeClient } from "../core/db/client";
import { createSeventeenLandsClient } from "../core/seventeen-lands";
import type { SeventeenLandsDraftDetail } from "../core/seventeen-lands";
import { getSyncMetadata, setSyncMetadata } from "../core/db/queries";
import { augmentCards } from "../augment";

const INITIAL_START_DATE = "2026-01-06";

function getDateRange(lastSyncDate: string | null): { startDate: string; endDate: string } {
  const start = lastSyncDate || INITIAL_START_DATE;

  // End date is tomorrow to catch any timezone edge cases
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const end = tomorrow.toISOString().split("T")[0];

  return {
    startDate: `${start}T00:00:00Z`,
    endDate: `${end}T23:59:59Z`,
  };
}

export function parseGameLink(link: string): { draftId: string; gameNumber: number } | null {
  // Link format: /user/game_replay/{date}/{draft_id}/{game_number}
  const match = link.match(/\/user\/game_replay\/\d+\/([a-f0-9]+)\/(\d+)/);
  if (!match) return null;
  return {
    draftId: match[1],
    gameNumber: parseInt(match[2], 10),
  };
}

type DbClient = Awaited<ReturnType<typeof getClient>>;

async function syncGames(
  db: DbClient,
  api: ReturnType<typeof createSeventeenLandsClient>,
  existingDraftIds: Set<string>,
  dryRun: boolean
) {
  console.log("Syncing games...");

  const gameData = await api.getGames();
  const games = gameData.games;

  // Get existing game IDs
  const existingGames = new Set<string>();
  const result = await db.execute("SELECT id FROM games");
  for (const row of result.rows) {
    existingGames.add(row.id as string);
  }

  const newGames = games.filter((game) => {
    const parsed = parseGameLink(game.link);
    if (!parsed) {
      console.warn(`Could not parse game link: ${game.link}`);
      return false;
    }
    const id = `${parsed.draftId}_${parsed.gameNumber}`;
    return !existingGames.has(id);
  });

  console.log(`Found ${newGames.length} new games to sync`);

  if (dryRun) {
    console.log("Games that would be synced:");
    for (const game of newGames.slice(0, 10)) {
      const parsed = parseGameLink(game.link);
      console.log(
        `  - ${parsed?.draftId}_${parsed?.gameNumber} (${game.on_play ? "play" : "draw"}, ${game.won ? "won" : "lost"})`
      );
    }
    if (newGames.length > 10) {
      console.log(`  ... and ${newGames.length - 10} more`);
    }
    return;
  }

  let inserted = 0;
  for (const game of newGames) {
    const parsed = parseGameLink(game.link);
    if (!parsed) continue;

    const id = `${parsed.draftId}_${parsed.gameNumber}`;
    const draftId = existingDraftIds.has(parsed.draftId) ? parsed.draftId : null;

    await db.execute({
      sql: `INSERT OR IGNORE INTO games (id, draft_id, game_number, game_time, on_play, won, turns, event_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        draftId,
        parsed.gameNumber,
        game.game_time,
        game.on_play ? 1 : 0,
        game.won ? 1 : 0,
        game.turns,
        game.event_name,
      ],
    });
    inserted++;
  }

  console.log(`Synced ${inserted} games`);
}

export function parseGameIdFromS3Path(s3Path: string): string | null {
  // s3://17lands-game-histories/20260122/{game_id}.json.gz
  const match = s3Path.match(/\/([a-f0-9]+)\.json\.gz$/);
  return match ? match[1] : null;
}

async function linkGamesToDrafts(
  db: DbClient,
  api: ReturnType<typeof createSeventeenLandsClient>,
  draftIds: Set<string>
) {
  // Only process if there are unlinked games
  const unlinkedResult = await db.execute(
    "SELECT COUNT(*) as count FROM games WHERE draft_id IS NULL"
  );
  const unlinkedCount = unlinkedResult.rows[0].count as number;

  if (unlinkedCount === 0) {
    return;
  }

  console.log(`Linking ${unlinkedCount} unlinked games to drafts...`);

  // Get unlinked game IDs for matching (extract ID before underscore)
  const gamesResult = await db.execute(
    "SELECT DISTINCT SUBSTR(id, 1, INSTR(id, '_') - 1) as game_id FROM games WHERE draft_id IS NULL"
  );
  const unlinkedGameIds = new Set(gamesResult.rows.map((r) => r.game_id as string));

  let updated = 0;
  for (const draftId of draftIds) {
    try {
      const eventDetails = await api.getEventDetails(draftId);

      for (const match of eventDetails.details.match_results) {
        for (const game of match.game_results) {
          const gameId = parseGameIdFromS3Path(game.history_s3_path);
          if (gameId && unlinkedGameIds.has(gameId)) {
            const result = await db.execute({
              sql: "UPDATE games SET draft_id = ?, game_number = ? WHERE id LIKE ?",
              args: [draftId, game.game_number, `${gameId}%`],
            });
            if (result.rowsAffected > 0) {
              updated++;
              unlinkedGameIds.delete(gameId);
            }
          }
        }
      }

      // Stop early if all games are linked
      if (unlinkedGameIds.size === 0) break;

      // Rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Failed to get event details for ${draftId}:`, err);
    }
  }

  console.log(`Linked ${updated} games to drafts`);
}

async function sync() {
  const fullSync = process.argv.includes("--full");
  const dryRun = process.argv.includes("--dry-run");
  console.log(fullSync ? "Running full sync..." : "Running incremental sync...");
  if (dryRun) {
    console.log("DRY RUN MODE - no changes will be made");
  }

  const db = await getClient();
  try {
    const api = createSeventeenLandsClient();

    // Get existing draft IDs
    const existingDrafts = new Set<string>();
    if (!fullSync) {
      const result = await db.execute("SELECT id FROM drafts");
      for (const row of result.rows) {
        existingDrafts.add(row.id as string);
      }
    } else {
      // Clear all data for full sync (unless dry-run)
      if (!dryRun) {
        await db.execute("DELETE FROM picks");
        await db.execute("DELETE FROM card_stats");
        await db.execute("DELETE FROM drafts");
        await db.execute("DELETE FROM games");
        await setSyncMetadata("last_sync_date", "");
      }
    }

    // Fetch user data from 17lands using incremental date tracking
    const lastSyncDate = fullSync ? null : await getSyncMetadata("last_sync_date");
    const { startDate, endDate } = getDateRange(lastSyncDate);
    console.log(`Querying drafts from ${startDate} to ${endDate}`);

    const userData = await api.getUserData(startDate.split("T")[0], endDate.split("T")[0]);
    const draftsToSync = userData.drafts.filter((d) => d.has_picks && !existingDrafts.has(d.id));

    console.log(`Found ${draftsToSync.length} new drafts to sync`);

    // In dry-run mode, print what would sync and exit early
    if (dryRun) {
      console.log("Drafts that would be synced:");
      for (const draft of draftsToSync) {
        console.log(`  - ${draft.id} (${draft.expansion}, ${draft.wins}-${draft.losses})`);
      }
      console.log("DRY RUN complete - no changes made");
      await api.close();
      return;
    }

    const syncedSets: Record<string, number> = {};

    for (const draft of draftsToSync) {
      console.log(`Syncing draft ${draft.id} (${draft.expansion})...`);

      // Fetch draft details
      const detail = await api.getDraftDetail(draft.id);

      // Insert draft
      await db.execute({
        sql: `INSERT INTO drafts (id, "set", format, colors, wins, losses, start_rank, end_rank, draft_date, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          draft.id,
          draft.expansion,
          draft.format,
          draft.colors,
          draft.wins,
          draft.losses,
          draft.start_rank,
          draft.end_rank,
          draft.first_pick_time,
          new Date().toISOString(),
        ],
      });

      // Insert picks and cards
      await insertPicksAndCards(db, draft.id, detail);

      // Update card stats
      await updateCardStats(db, draft.expansion, detail);

      syncedSets[draft.expansion] = (syncedSets[draft.expansion] || 0) + 1;

      // Rate limiting - be nice to 17lands (2s between requests)
      await new Promise((r) => setTimeout(r, 2000));
    }

    const summary = Object.entries(syncedSets)
      .map(([set, count]) => `${set}: ${count}`)
      .join(", ");
    console.log(`Synced ${draftsToSync.length} drafts (${summary || "none"})`);

    // Sync games
    const allDraftIds = new Set<string>();
    const draftResult = await db.execute("SELECT id FROM drafts");
    for (const row of draftResult.rows) {
      allDraftIds.add(row.id as string);
    }
    await syncGames(db, api, allDraftIds, dryRun);

    // Link games to drafts using event_details
    if (!dryRun) {
      await linkGamesToDrafts(db, api, allDraftIds);
    }

    // Augment cards from Scryfall
    if (!dryRun) {
      await augmentCards();
    }

    // Update last sync date after successful sync
    const today = new Date().toISOString().split("T")[0];
    await setSyncMetadata("last_sync_date", today);
    console.log(`Updated last_sync_date to ${today}`);

    await api.close();
  } finally {
    closeClient();
  }
}

async function insertPicksAndCards(
  db: DbClient,
  draftId: string,
  detail: SeventeenLandsDraftDetail
) {
  for (const pick of detail.picks) {
    // Upsert the picked card
    await db.execute({
      sql: `INSERT OR REPLACE INTO cards (name, image_url, types, mana_cost, colors)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        pick.pick.name,
        pick.pick.image_url,
        pick.pick.types.join(" "),
        pick.pick.mana_cost,
        extractColors(pick.pick.mana_cost),
      ],
    });

    // Insert pick
    await db.execute({
      sql: `INSERT INTO picks (draft_id, pack_number, pick_number, card_name, available_cards)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        draftId,
        pick.pack_number,
        pick.pick_number,
        pick.pick.name,
        JSON.stringify(pick.available.map((c) => c.name)),
      ],
    });

    // Upsert available cards
    for (const card of pick.available) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO cards (name, image_url, types, mana_cost, colors)
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          card.name,
          card.image_url,
          card.types.join(" "),
          card.mana_cost,
          extractColors(card.mana_cost),
        ],
      });
    }
  }
}

async function updateCardStats(db: DbClient, set: string, detail: SeventeenLandsDraftDetail) {
  const now = new Date().toISOString();

  for (const [cardName, stats] of Object.entries(detail.card_performance_data)) {
    // Ensure card exists
    await db.execute({
      sql: `INSERT OR IGNORE INTO cards (name) VALUES (?)`,
      args: [cardName],
    });

    await db.execute({
      sql: `INSERT OR REPLACE INTO card_stats
            (card_name, "set", avg_seen_at, avg_pick_at, game_in_hand_wr, times_seen, times_picked, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        cardName,
        set,
        stats.avg_seen_position,
        stats.avg_pick_position,
        stats.game_in_hand_win_rate,
        stats.total_times_seen,
        stats.total_times_picked,
        now,
      ],
    });
  }
}

function extractColors(manaCost: string): string {
  const colors = new Set<string>();
  const regex = /\{([WUBRG])\}/g;
  let match;
  while ((match = regex.exec(manaCost)) !== null) {
    colors.add(match[1]);
  }
  return Array.from(colors).sort().join("");
}

sync().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
