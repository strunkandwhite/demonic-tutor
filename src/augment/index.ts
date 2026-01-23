/**
 * Augment card data from Scryfall API.
 */

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
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

async function fetchCard(name: string, retries = 3): Promise<ScryfallCard | null> {
  const url = `${SCRYFALL_API}/cards/named?exact=${encodeURIComponent(name)}`;

  try {
    const response = await fetch(url);

    if (response.status === 404) {
      return null;
    }

    if (response.status === 429 && retries > 0) {
      console.log(`\nRate limited by Scryfall, waiting 5 seconds...`);
      await new Promise((r) => setTimeout(r, 5000));
      return fetchCard(name, retries - 1);
    }

    if (!response.ok) {
      throw new Error(`Scryfall API error: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error(`Failed to fetch ${name}:`, error);
    return null;
  }
}

export async function augmentCards() {
  console.log("Augmenting cards from Scryfall...");

  const db = await getClient();

  // Find cards missing oracle_text
  const result = await db.execute("SELECT name FROM cards WHERE oracle_text IS NULL");

  const cardsToAugment = result.rows.map((r) => r.name as string);
  console.log(`Found ${cardsToAugment.length} cards to augment`);

  if (cardsToAugment.length === 0) {
    return;
  }

  let augmented = 0;
  let notFound = 0;

  for (const cardName of cardsToAugment) {
    const card = await fetchCard(cardName);

    if (card) {
      await db.execute({
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
          cardName,
        ],
      });
      augmented++;
      process.stdout.write(`\rAugmented ${augmented}/${cardsToAugment.length} cards`);
    } else {
      notFound++;
      console.log(`\nCard not found in Scryfall: ${cardName}`);
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }

  console.log(`\nAugmentation complete: ${augmented} updated, ${notFound} not found`);
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
