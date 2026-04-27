/**
 * Sync drafts from 17lands to local database.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import type { InValue } from "@libsql/client";
import { getClient, closeClient } from "../core/db/client";
import { createSeventeenLandsClient } from "../core/seventeen-lands";
import type { SeventeenLandsDraftDetail } from "../core/seventeen-lands";
import { getSyncMetadata, setSyncMetadata } from "../core/db/queries";
import { augmentCards } from "../augment";
import { syncDecklists } from "./decklists";
import { syncFormatStats } from "./format-stats";

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

  const gamesList = await api.getGames();
  const games = gamesList.games;

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

  // Prepare game data for batch insert
  const gameData = newGames
    .map((game) => {
      const parsed = parseGameLink(game.link);
      if (!parsed) return null;
      return {
        id: `${parsed.draftId}_${parsed.gameNumber}`,
        draftId: existingDraftIds.has(parsed.draftId) ? parsed.draftId : null,
        gameNumber: parsed.gameNumber,
        gameTime: game.game_time,
        onPlay: game.on_play ? 1 : 0,
        won: game.won ? 1 : 0,
        turns: game.turns,
        eventName: game.event_name,
        replayLink: game.link,
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null);

  if (gameData.length === 0) {
    console.log("[turso] No games to insert");
    return;
  }

  // Batch insert games (50 at a time)
  const statements: Array<{ sql: string; args: InValue[] }> = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < gameData.length; i += BATCH_SIZE) {
    const batch = gameData.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const args = batch.flatMap((g) => [
      g.id,
      g.draftId,
      g.gameNumber,
      g.gameTime,
      g.onPlay,
      g.won,
      g.turns,
      g.eventName,
      g.replayLink,
    ]);
    statements.push({
      sql: `INSERT OR IGNORE INTO games (id, draft_id, game_number, game_time, on_play, won, turns, event_name, replay_link) VALUES ${placeholders}`,
      args,
    });
  }

  await db.batch(statements);
  console.log(`[turso] Inserted ${gameData.length} games`);
}

export function parseGameIdFromS3Path(s3Path: string): string | null {
  // s3://17lands-game-histories/20260122/{game_id}.json.gz
  const match = s3Path.match(/\/([a-f0-9]+)\.json\.gz$/);
  return match ? match[1] : null;
}

export interface GameLinkUpdate {
  /** Full row id, i.e. the value of games.id (gameId + "_" + originalGameNumber) */
  fullId: string;
  draftId: string;
  /** Canonical game_number from event_details (may differ from id suffix). */
  gameNumber: number;
}

/**
 * Apply a batch of game→draft link updates in a single db.batch.
 * Pure function — does no HTTP and no orphan-marking, so tests can drive it
 * with a fixture instead of mocking the 17lands client.
 */
export async function applyGameDraftLinks(
  db: DbClient,
  updates: readonly GameLinkUpdate[]
): Promise<void> {
  if (updates.length === 0) return;
  const statements = updates.map((u) => ({
    sql: "UPDATE games SET draft_id = ?, game_number = ? WHERE id = ?",
    args: [u.draftId, u.gameNumber, u.fullId] as InValue[],
  }));
  await db.batch(statements);
}

async function linkGamesToDrafts(
  db: DbClient,
  api: ReturnType<typeof createSeventeenLandsClient>,
  draftIds: Set<string>
) {
  // Get unlinked game IDs along with their full row id (gameId_originalNum).
  const gamesResult = await db.execute(
    "SELECT id, SUBSTR(id, 1, INSTR(id, '_') - 1) as game_id FROM games WHERE draft_id IS NULL AND (orphaned IS NULL OR orphaned = 0)"
  );
  if (gamesResult.rows.length === 0) {
    return;
  }

  console.log(`Linking ${gamesResult.rows.length} unlinked games to drafts...`);

  const unlinkedById = new Map<string, string>(); // gameId → fullId
  for (const r of gamesResult.rows) {
    unlinkedById.set(r.game_id as string, r.id as string);
  }

  // Walk drafts, fetch event_details (HTTP), and collect updates.
  const updates: GameLinkUpdate[] = [];
  for (const draftId of draftIds) {
    if (unlinkedById.size === 0) break;
    try {
      const eventDetails = await api.getEventDetails(draftId);
      for (const match of eventDetails.details.match_results) {
        for (const game of match.game_results) {
          const gameId = parseGameIdFromS3Path(game.history_s3_path);
          if (!gameId) continue;
          const fullId = unlinkedById.get(gameId);
          if (!fullId) continue;
          updates.push({ fullId, draftId, gameNumber: game.game_number });
          unlinkedById.delete(gameId);
        }
      }
      // Note: Rate limiting handled by client.enforceRateLimit()
    } catch (err) {
      console.error(`Failed to get event details for ${draftId}:`, err);
    }
  }

  await applyGameDraftLinks(db, updates);
  console.log(`[turso] Linked ${updates.length} games to drafts`);

  // Mark remaining unlinked games as orphaned
  if (unlinkedById.size > 0) {
    const orphanResult = await db.execute(
      "UPDATE games SET orphaned = 1 WHERE draft_id IS NULL AND (orphaned IS NULL OR orphaned = 0)"
    );
    if (orphanResult.rowsAffected > 0) {
      console.log(
        `[turso] Marked ${orphanResult.rowsAffected} games as orphaned (no matching draft)`
      );
    }
  }
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
        await db.execute("DELETE FROM decklist_cards");
        await db.execute("DELETE FROM decklists");
        await db.execute("DELETE FROM games");
        await db.execute("DELETE FROM picks");
        await db.execute("DELETE FROM card_stats");
        await db.execute("DELETE FROM drafts");
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
      console.log(`[turso] Inserted draft ${draft.id}`);

      // Insert picks and cards
      await insertPicksAndCards(db, draft.id, detail);

      syncedSets[draft.expansion] = (syncedSets[draft.expansion] || 0) + 1;

      // Note: Rate limiting handled by client.enforceRateLimit()
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

    // Sync decklists from 17lands (reuse existing client)
    if (!dryRun) {
      await syncDecklists(api);
    }

    // Sync format stats from 17lands
    await syncFormatStats(api, db, dryRun);

    // Update last sync date after successful sync
    const today = new Date().toISOString().split("T")[0];
    await setSyncMetadata("last_sync_date", today);
    console.log(`[turso] Updated last_sync_date to ${today}`);

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
  // Collect all cards (picked + available) for batch insert
  const cardMap = new Map<
    string,
    { imageUrl: string | null; types: string; manaCost: string; colors: string }
  >();

  // Collect pick data
  const pickData: Array<{
    packNumber: number;
    pickNumber: number;
    cardName: string;
    availableCards: string;
  }> = [];

  for (const pick of detail.picks) {
    // Add picked card
    cardMap.set(pick.pick.name, {
      imageUrl: pick.pick.image_url,
      types: pick.pick.types.join(" "),
      manaCost: pick.pick.mana_cost,
      colors: extractColors(pick.pick.mana_cost),
    });

    // Add available cards
    for (const card of pick.available) {
      if (!cardMap.has(card.name)) {
        cardMap.set(card.name, {
          imageUrl: card.image_url,
          types: card.types.join(" "),
          manaCost: card.mana_cost,
          colors: extractColors(card.mana_cost),
        });
      }
    }

    // Collect pick
    pickData.push({
      packNumber: pick.pack_number,
      pickNumber: pick.pick_number,
      cardName: pick.pick.name,
      availableCards: JSON.stringify(pick.available.map((c) => c.name)),
    });
  }

  // Build batch statements
  const statements: Array<{ sql: string; args: InValue[] }> = [];

  // Batch insert cards (50 at a time to stay under query limits)
  const cards = Array.from(cardMap.entries());
  const CARD_BATCH_SIZE = 50;
  for (let i = 0; i < cards.length; i += CARD_BATCH_SIZE) {
    const batch = cards.slice(i, i + CARD_BATCH_SIZE);
    const placeholders = batch.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const args = batch.flatMap(([name, data]) => [
      name,
      data.imageUrl,
      data.types,
      data.manaCost,
      data.colors,
    ]);
    statements.push({
      sql: `INSERT OR IGNORE INTO cards (name, image_url, types, mana_cost, colors) VALUES ${placeholders}`,
      args,
    });
  }

  // Batch insert picks (all at once since typically ~45 picks)
  if (pickData.length > 0) {
    const placeholders = pickData.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const args = pickData.flatMap((p) => [
      draftId,
      p.packNumber,
      p.pickNumber,
      p.cardName,
      p.availableCards,
    ]);
    statements.push({
      sql: `INSERT INTO picks (draft_id, pack_number, pick_number, card_name, available_cards) VALUES ${placeholders}`,
      args,
    });
  }

  // Execute all statements in a batch (transaction)
  await db.batch(statements);
  console.log(
    `[turso] Inserted ${pickData.length} picks and ${cards.length} cards for draft ${draftId}`
  );
}

export function extractColors(manaCost: string): string {
  const colors = new Set<string>();
  const regex = /\{([WUBRG])\}/g;
  let match;
  while ((match = regex.exec(manaCost)) !== null) {
    colors.add(match[1]);
  }
  return Array.from(colors).sort().join("");
}

const isDirectRun = process.argv[1]?.includes("sync/index");
if (isDirectRun) {
  sync().catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
}
