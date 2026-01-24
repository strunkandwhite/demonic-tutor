/**
 * Sync decklists from 17lands to local database.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { getClient, closeClient } from "../core/db/client";
import { createSeventeenLandsClient } from "../core/seventeen-lands";
import type { SeventeenLandsDeck } from "../core/seventeen-lands";

type DbClient = Awaited<ReturnType<typeof getClient>>;

function countCards(cardIds: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

async function insertDecklist(
  db: DbClient,
  draftId: string,
  deck: SeventeenLandsDeck
): Promise<void> {
  // Insert decklist metadata
  await db.execute({
    sql: `INSERT INTO decklists (draft_id, main_colors, splash_colors)
          VALUES (?, ?, ?)`,
    args: [draftId, deck.main_colors || null, deck.splash_colors || null],
  });

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
        sql: `INSERT INTO decklist_cards (draft_id, card_name, quantity, is_maindeck)
              VALUES (?, ?, ?, ?)`,
        args: [draftId, card.name, quantity, isMaindeck],
      });
    }
  }
}

export async function syncDecklists(): Promise<void> {
  console.log("Syncing decklists from 17lands...");

  const db = await getClient();
  const api = createSeventeenLandsClient();

  try {
    // Find drafts without decklists
    const result = await db.execute(`
      SELECT d.id FROM drafts d
      LEFT JOIN decklists dl ON d.id = dl.draft_id
      WHERE dl.draft_id IS NULL
    `);

    const draftsToSync = result.rows.map((r) => r.id as string);
    console.log(`Found ${draftsToSync.length} drafts without decklists`);

    if (draftsToSync.length === 0) {
      return;
    }

    let synced = 0;
    let failed = 0;

    for (const draftId of draftsToSync) {
      try {
        // Fetch the first deck (index 0) - we don't track deck changes mid-event
        const deck = await api.getDeck(draftId, 0);
        await insertDecklist(db, draftId, deck);
        synced++;

        process.stdout.write(`\rSynced ${synced}/${draftsToSync.length} decklists`);
      } catch (err) {
        failed++;
        console.error(`\nFailed to sync decklist for ${draftId}:`, err);
      }

      // Rate limiting
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`\nDecklist sync complete: ${synced} synced, ${failed} failed`);
  } finally {
    await api.close();
  }
}

// Run if executed directly
const isDirectRun = process.argv[1]?.includes("decklists");
if (isDirectRun) {
  syncDecklists()
    .catch((err) => {
      console.error("Decklist sync failed:", err);
      process.exit(1);
    })
    .finally(() => closeClient());
}
