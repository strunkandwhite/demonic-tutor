/**
 * Sync drafts from 17lands to local database.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { getClient, closeClient } from "../core/db/client";
import { createSeventeenLandsClient } from "../core/seventeen-lands";
import type { SeventeenLandsDraftDetail } from "../core/seventeen-lands";

type DbClient = Awaited<ReturnType<typeof getClient>>;

async function sync() {
  const fullSync = process.argv.includes("--full");
  console.log(fullSync ? "Running full sync..." : "Running incremental sync...");

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
      // Clear all data for full sync
      await db.execute("DELETE FROM picks");
      await db.execute("DELETE FROM card_stats");
      await db.execute("DELETE FROM drafts");
    }

    // Fetch user data from 17lands
    // Query last 2 years of data (API requires date range)
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const userData = await api.getUserData(startDate, endDate);
    const draftsToSync = userData.drafts.filter(
      (d) => d.has_picks && !existingDrafts.has(d.id)
    );

    console.log(`Found ${draftsToSync.length} new drafts to sync`);

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

      // Rate limiting - be nice to 17lands
      await new Promise((r) => setTimeout(r, 1500));
    }

    const summary = Object.entries(syncedSets)
      .map(([set, count]) => `${set}: ${count}`)
      .join(", ");
    console.log(`Synced ${draftsToSync.length} drafts (${summary || "none"})`);

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

async function updateCardStats(
  db: DbClient,
  set: string,
  detail: SeventeenLandsDraftDetail
) {
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
