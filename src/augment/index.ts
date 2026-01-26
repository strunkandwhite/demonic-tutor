/**
 * Augment card data from Scryfall API.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import type { InValue } from "@libsql/client";
import { getClient, closeClient } from "../core/db/client";

const SCRYFALL_API = "https://api.scryfall.com";
const RATE_LIMIT_MS = 100; // Scryfall allows 10 req/sec

interface ScryfallCard {
  oracle_id: string;
  name: string;
  oracle_text?: string;
  cmc: number;
  rarity: string;
  image_uris?: {
    large: string;
  };
  type_line: string;
  mana_cost?: string;
  colors?: string[];
}

const FETCH_TIMEOUT_MS = 30000; // 30 second timeout
const BATCH_SIZE = 75; // Scryfall collection endpoint limit

interface ScryfallCollectionResponse {
  data: ScryfallCard[];
  not_found: Array<{ name: string }>;
}

async function fetchCardsBatch(
  names: string[],
  retries = 3
): Promise<{ found: ScryfallCard[]; notFound: string[] }> {
  const url = `${SCRYFALL_API}/cards/collection`;
  const identifiers = names.map((name) => ({ name }));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status === 429 && retries > 0) {
      console.log(`\nRate limited by Scryfall, waiting 5 seconds...`);
      await new Promise((r) => setTimeout(r, 5000));
      return fetchCardsBatch(names, retries - 1);
    }

    if (!response.ok) {
      throw new Error(`Scryfall API error: ${response.status}`);
    }

    const data: ScryfallCollectionResponse = await response.json();
    return {
      found: data.data,
      notFound: data.not_found.map((c) => c.name),
    };
  } catch (error) {
    console.error(`Failed to fetch batch of ${names.length} cards:`, error);
    return { found: [], notFound: names };
  }
}

export async function augmentCards() {
  console.log("Augmenting cards from Scryfall...");

  const db = await getClient();

  // Find cards missing oracle_text (exclude cards already marked as not found)
  const result = await db.execute(
    "SELECT name FROM cards WHERE oracle_text IS NULL AND (scryfall_not_found IS NULL OR scryfall_not_found = 0)"
  );

  const cardsToAugment = result.rows.map((r) => r.name as string);
  console.log(`Found ${cardsToAugment.length} cards to augment`);

  if (cardsToAugment.length === 0) {
    return;
  }

  let augmented = 0;
  let notFoundCount = 0;

  // Process in batches of 75 (Scryfall limit)
  for (let i = 0; i < cardsToAugment.length; i += BATCH_SIZE) {
    const batch = cardsToAugment.slice(i, i + BATCH_SIZE);
    const { found, notFound } = await fetchCardsBatch(batch);

    // Build batch update statements
    const statements: Array<{ sql: string; args: InValue[] }> = [];

    // Update found cards
    for (const card of found) {
      statements.push({
        sql: `UPDATE cards SET
                oracle_id = ?,
                oracle_text = ?,
                cmc = ?,
                rarity = ?,
                image_url = COALESCE(image_url, ?),
                types = COALESCE(types, ?),
                mana_cost = COALESCE(mana_cost, ?),
                colors = COALESCE(colors, ?)
              WHERE name = ?`,
        args: [
          card.oracle_id,
          card.oracle_text || "",
          card.cmc,
          card.rarity,
          card.image_uris?.large || null,
          card.type_line,
          card.mana_cost || "",
          card.colors?.join("") || "",
          card.name,
        ],
      });
    }

    // Mark not found cards
    for (const name of notFound) {
      statements.push({
        sql: "UPDATE cards SET scryfall_not_found = 1 WHERE name = ?",
        args: [name],
      });
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    augmented += found.length;
    notFoundCount += notFound.length;
    console.log(
      `[turso] Processed batch ${Math.floor(i / BATCH_SIZE) + 1}: ${found.length} found, ${notFound.length} not found`
    );

    // Rate limiting between batches
    if (i + BATCH_SIZE < cardsToAugment.length) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  console.log(`Augmentation complete: ${augmented} updated, ${notFoundCount} not found`);
  // Note: Don't close DB client here - caller manages lifecycle
}

// Run if executed directly
const isDirectRun = process.argv[1]?.includes("augment");
if (isDirectRun) {
  augmentCards()
    .catch((err) => {
      console.error("Augmentation failed:", err);
      process.exit(1);
    })
    .finally(() => closeClient());
}
