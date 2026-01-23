# Games Tracking & Card Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add play/draw game tracking and expand card data with Scryfall augmentation.

**Architecture:** Extend sync to fetch games, add Scryfall augmentation as final step. Games link to drafts via ID parsed from game links.

**Tech Stack:** Playwright (existing), Scryfall API (public), Turso (libsql)

---

## Task 1: Add Games Table to Schema

**Files:**

- Modify: `/Users/arpanet/code/demonic-tutor/src/core/db/schema.ts`

**Step 1: Add Game interface**

After the `SyncMetadata` interface (around line 48), add:

```typescript
export interface Game {
  id: string;
  draft_id: string | null;
  game_number: number;
  game_time: string;
  on_play: number;
  won: number;
  turns: number | null;
  event_name: string | null;
}
```

**Step 2: Add games table to CREATE_TABLES_SQL**

Add before the CREATE INDEX statements (around line 98):

```sql
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  draft_id TEXT REFERENCES drafts(id),
  game_number INTEGER NOT NULL,
  game_time TEXT NOT NULL,
  on_play INTEGER NOT NULL,
  won INTEGER NOT NULL,
  turns INTEGER,
  event_name TEXT
);
```

**Step 3: Add games index**

Add after existing indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_games_draft ON games(draft_id);
```

**Step 4: Run migration**

Run: `pnpm db:migrate`

**Step 5: Commit**

```bash
git add src/core/db/schema.ts
git commit -m "feat(db): add games table for play/draw tracking"
```

---

## Task 2: Add Card Table Columns

**Files:**

- Modify: `/Users/arpanet/code/demonic-tutor/src/core/db/schema.ts`

**Step 1: Update Card interface**

Replace the Card interface with:

```typescript
export interface Card {
  name: string;
  image_url: string | null;
  types: string | null;
  mana_cost: string | null;
  colors: string | null;
  oracle_id: string | null;
  oracle_text: string | null;
  cmc: number | null;
  rarity: string | null;
}
```

**Step 2: Update cards table in CREATE_TABLES_SQL**

Replace the cards table definition:

```sql
CREATE TABLE IF NOT EXISTS cards (
  name TEXT PRIMARY KEY,
  image_url TEXT,
  types TEXT,
  mana_cost TEXT,
  colors TEXT,
  oracle_id TEXT,
  oracle_text TEXT,
  cmc REAL,
  rarity TEXT
);
```

**Step 3: Run migration to add columns**

Since SQLite doesn't support adding columns in CREATE TABLE IF NOT EXISTS, we need to run ALTER TABLE statements. Create a one-time migration by running in turso shell:

```bash
turso db shell demonic-tutor "ALTER TABLE cards ADD COLUMN oracle_id TEXT; ALTER TABLE cards ADD COLUMN oracle_text TEXT; ALTER TABLE cards ADD COLUMN cmc REAL; ALTER TABLE cards ADD COLUMN rarity TEXT;"
```

**Step 4: Commit**

```bash
git add src/core/db/schema.ts
git commit -m "feat(db): expand cards table with oracle_text, cmc, rarity"
```

---

## Task 3: Add Games Type to 17lands Types

**Files:**

- Modify: `/Users/arpanet/code/demonic-tutor/src/core/seventeen-lands/types.ts`

**Step 1: Add SeventeenLandsGame type**

Add at end of file:

```typescript
export interface SeventeenLandsGame {
  account_name: string;
  event_name: string;
  game_time: string;
  link: string;
  on_play: boolean;
  turns: number;
  won: boolean;
}

export interface SeventeenLandsGameList {
  games: SeventeenLandsGame[];
}
```

**Step 2: Commit**

```bash
git add src/core/seventeen-lands/types.ts
git commit -m "feat(17lands): add game list types"
```

---

## Task 4: Add getGames Method to Client

**Files:**

- Modify: `/Users/arpanet/code/demonic-tutor/src/core/seventeen-lands/client.ts`

**Step 1: Import new type**

Update the import at top of file:

```typescript
import type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
  SeventeenLandsGameList,
} from "./types";
```

**Step 2: Add getGames method**

Add after getDraftDetail method (around line 185):

```typescript
  async getGames(): Promise<SeventeenLandsGameList> {
    return withRetry(() => this.fetchApi<SeventeenLandsGameList>("/data/user_game_list"));
  }
```

**Step 3: Export type from index**

Update `/Users/arpanet/code/demonic-tutor/src/core/seventeen-lands/index.ts` to export the new type:

```typescript
export type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
  SeventeenLandsGame,
  SeventeenLandsGameList,
} from "./types";
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`

**Step 5: Commit**

```bash
git add src/core/seventeen-lands/
git commit -m "feat(17lands): add getGames method for play/draw data"
```

---

## Task 5: Create Scryfall Augmentation Script

**Files:**

- Create: `/Users/arpanet/code/demonic-tutor/src/augment/index.ts`

**Step 1: Create augment directory and script**

```typescript
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

async function fetchCard(name: string): Promise<ScryfallCard | null> {
  const url = `${SCRYFALL_API}/cards/named?exact=${encodeURIComponent(name)}`;

  try {
    const response = await fetch(url);

    if (response.status === 404) {
      return null;
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

async function augmentCards() {
  console.log("Augmenting cards from Scryfall...");

  const db = await getClient();
  try {
    // Find cards missing oracle_text
    const result = await db.execute("SELECT name FROM cards WHERE oracle_text IS NULL");

    const cardsToAugment = result.rows.map((r) => r.name as string);
    console.log(`Found ${cardsToAugment.length} cards to augment`);

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
  } finally {
    closeClient();
  }
}

// Allow running standalone or as module
export { augmentCards };

// Run if executed directly
if (process.argv[1]?.includes("augment")) {
  augmentCards().catch((err) => {
    console.error("Augmentation failed:", err);
    process.exit(1);
  });
}
```

**Step 2: Add script to package.json**

Add to scripts section:

```json
"augment-cards": "tsx src/augment/index.ts"
```

**Step 3: Verify it runs**

Run: `pnpm augment-cards`
Expected: Should find cards with missing oracle_text and augment them

**Step 4: Commit**

```bash
git add src/augment/ package.json
git commit -m "feat: add Scryfall card augmentation script"
```

---

## Task 6: Integrate Games Sync into Main Sync

**Files:**

- Modify: `/Users/arpanet/code/demonic-tutor/src/sync/index.ts`

**Step 1: Add parseGameLink helper**

Add after getDateRange function (around line 26):

```typescript
function parseGameLink(link: string): { draftId: string; gameNumber: number } | null {
  // Link format: /user/game_replay/{date}/{draft_id}/{game_number}
  const match = link.match(/\/user\/game_replay\/\d+\/([a-f0-9]+)\/(\d+)/);
  if (!match) return null;
  return {
    draftId: match[1],
    gameNumber: parseInt(match[2], 10),
  };
}
```

**Step 2: Add syncGames function**

Add before the sync() function:

```typescript
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
    if (!parsed) return false;
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
```

**Step 3: Update sync() to call syncGames**

In the sync() function, after the draft sync loop and before updating last_sync_date (around line 123), add:

```typescript
// Sync games
const allDraftIds = new Set<string>();
const draftResult = await db.execute("SELECT id FROM drafts");
for (const row of draftResult.rows) {
  allDraftIds.add(row.id as string);
}
await syncGames(db, api, allDraftIds, dryRun);
```

**Step 4: Also clear games on full sync**

In the fullSync block (around line 52), add after the other DELETE statements:

```typescript
await db.execute("DELETE FROM games");
```

**Step 5: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`

**Step 6: Commit**

```bash
git add src/sync/index.ts
git commit -m "feat(sync): add games sync for play/draw tracking"
```

---

## Task 7: Integrate Scryfall Augmentation into Sync

**Files:**

- Modify: `/Users/arpanet/code/demonic-tutor/src/sync/index.ts`

**Step 1: Import augmentCards**

Add to imports at top:

```typescript
import { augmentCards } from "../augment";
```

**Step 2: Call augmentCards at end of sync**

After the games sync and before `await api.close()` (around line 130), add:

```typescript
// Augment cards from Scryfall
if (!dryRun) {
  await augmentCards();
}
```

**Step 3: Verify sync runs end-to-end**

Run: `pnpm sync --dry-run`
Expected: Should show drafts, games, then skip augmentation in dry-run mode

**Step 4: Commit**

```bash
git add src/sync/index.ts
git commit -m "feat(sync): integrate Scryfall augmentation into sync flow"
```

---

## Task 8: Update Documentation

**Files:**

- Modify: `/Users/arpanet/code/demonic-tutor/CLAUDE.md`
- Modify: `/Users/arpanet/code/demonic-tutor/README.md`

**Step 1: Update CLAUDE.md Database Schema section**

Add to the Database Schema section:

```markdown
- `games` - Game results (draft_id, on_play, won, turns, game_time)
```

Update the cards description:

```markdown
- `cards` - Card registry (name, image_url, types, mana_cost, colors, oracle_id, oracle_text, cmc, rarity)
```

**Step 2: Update CLAUDE.md Sync System section**

Add after the existing sync system description:

```markdown
**Sync steps:**

1. Sync drafts from 17lands (date-range based)
2. Sync games from 17lands (all games, dedup by ID)
3. Augment cards from Scryfall (only cards missing oracle_text)
```

**Step 3: Update README.md Commands section**

Add:

```markdown
- `pnpm augment-cards` - Manually augment card data from Scryfall
```

**Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update documentation for games and card expansion"
```

---

## Task 9: Test Full Sync Flow

**Step 1: Run full sync to test everything**

Run: `pnpm sync`

Expected output should include:

- Drafts sync (may show 0 if already synced)
- Games sync with count of new games
- Scryfall augmentation with count of cards

**Step 2: Verify games in database**

Run: `turso db shell demonic-tutor "SELECT COUNT(*) FROM games"`

**Step 3: Verify card augmentation**

Run: `turso db shell demonic-tutor "SELECT name, oracle_text FROM cards WHERE oracle_text IS NOT NULL LIMIT 3"`

**Step 4: Test incremental sync**

Run: `pnpm sync`

Expected: Should find 0 new drafts, 0 new games, 0 cards to augment
