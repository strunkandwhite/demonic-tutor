/**
 * Sync decklists from 17lands to local database.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import type { InValue } from "@libsql/client";
import { getClient, closeClient, type Client as DbClient } from "../core/db/client";
import { createSeventeenLandsClient, type SeventeenLandsClient } from "../core/seventeen-lands";
import type { SeventeenLandsDeck } from "../core/seventeen-lands";
import { countCards } from "../core/db/utils";

export type DecklistSource = "user" | "trophy";

/**
 * Insert (or skip) a decklist plus its card rows.
 *
 * - `source="trophy"` is idempotent: if any decklist_cards rows already exist
 *   for `draftId` we skip without writing. (Trophy decks are append-only;
 *   we never want to duplicate a deck we already have.)
 * - `source="user"` writes unconditionally; callers are expected to pre-filter
 *   to drafts without an existing decklist.
 *
 * All writes happen in one db.batch (single libsql transaction).
 */
export async function upsertDecklist(
  db: DbClient,
  draftId: string,
  set: string | null,
  deck: SeventeenLandsDeck,
  source: DecklistSource
): Promise<{ inserted: boolean; cardsInserted: number }> {
  if (source === "trophy") {
    const existing = await db.execute({
      sql: `SELECT 1 FROM decklist_cards WHERE draft_id = ? LIMIT 1`,
      args: [draftId],
    });
    if (existing.rows.length > 0) {
      return { inserted: false, cardsInserted: 0 };
    }
  }

  const statements: Array<{ sql: string; args: InValue[] }> = [];

  statements.push({
    sql: `INSERT OR IGNORE INTO decklists (draft_id, "set", main_colors, splash_colors, source)
          VALUES (?, ?, ?, ?, ?)`,
    args: [draftId, set, deck.main_colors || null, deck.splash_colors || null, source],
  });

  // Dedupe card upserts across all groups so we don't push the same card row twice.
  const cardRowsByName = new Map<
    string,
    {
      name: string;
      image_url: string | null;
      types: string;
      mana_cost: string | null;
      colors: string;
      cmc: number | null;
      rarity: string | null;
    }
  >();

  // Decklist card rows: keyed by (name, is_maindeck) so the same card in main
  // and side become two rows (matches the (draft_id, card_name, is_maindeck) PK).
  const decklistCardRows: Array<{ name: string; quantity: number; isMaindeck: number }> = [];

  for (const group of deck.groups) {
    const isMaindeck = group.name === "Maindeck" ? 1 : 0;
    const cardCounts = countCards(group.cards);

    for (const [cardId, quantity] of cardCounts) {
      const card = deck.cards[cardId.toString()];
      if (!card) continue;

      if (!cardRowsByName.has(card.name)) {
        cardRowsByName.set(card.name, {
          name: card.name,
          image_url: card.image_url,
          types: card.types.join(" "),
          mana_cost: card.mana_cost,
          colors: card.color_identity.join(""),
          cmc: card.cmc,
          rarity: card.rarity,
        });
      }
      decklistCardRows.push({ name: card.name, quantity, isMaindeck });
    }
  }

  for (const c of cardRowsByName.values()) {
    statements.push({
      sql: `INSERT OR IGNORE INTO cards (name, image_url, types, mana_cost, colors, cmc, rarity)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [c.name, c.image_url, c.types, c.mana_cost, c.colors, c.cmc, c.rarity],
    });
  }

  for (const r of decklistCardRows) {
    statements.push({
      sql: `INSERT OR IGNORE INTO decklist_cards (draft_id, card_name, quantity, is_maindeck)
            VALUES (?, ?, ?, ?)`,
      args: [draftId, r.name, r.quantity, r.isMaindeck],
    });
  }

  await db.batch(statements);
  return { inserted: true, cardsInserted: decklistCardRows.length };
}

export async function syncDecklists(existingClient?: SeventeenLandsClient): Promise<void> {
  console.log("Syncing decklists from 17lands...");

  const db = await getClient();
  const api = existingClient ?? createSeventeenLandsClient();
  const shouldCloseClient = !existingClient;

  try {
    // Find drafts without decklists, plus their set
    const result = await db.execute(`
      SELECT d.id, d."set" FROM drafts d
      LEFT JOIN decklists dl ON d.id = dl.draft_id
      WHERE dl.draft_id IS NULL
    `);

    const draftsToSync = result.rows.map((r) => ({
      id: r.id as string,
      set: r.set as string | null,
    }));
    console.log(`Found ${draftsToSync.length} drafts without decklists`);

    if (draftsToSync.length === 0) {
      return;
    }

    let synced = 0;
    let failed = 0;

    for (const { id: draftId, set } of draftsToSync) {
      try {
        const deck = await api.getDeck(draftId, 0);
        const maindeckCount = deck.groups.find((g) => g.name === "Maindeck")?.cards.length || 0;
        const sideboardCount = deck.groups.find((g) => g.name === "Sideboard")?.cards.length || 0;
        console.log(
          `  Deck: ${deck.main_colors || "?"} colors, ${maindeckCount} maindeck, ${sideboardCount} sideboard`
        );
        await upsertDecklist(db, draftId, set, deck, "user");
        synced++;
        console.log(`  [turso] Saved decklist ${synced}/${draftsToSync.length}`);
      } catch (err) {
        failed++;
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`  Failed to sync decklist for ${draftId}: ${errMsg}`);
      }
    }

    console.log(`Decklist sync complete: ${synced} synced, ${failed} failed`);
  } finally {
    if (shouldCloseClient) {
      await api.close();
    }
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
