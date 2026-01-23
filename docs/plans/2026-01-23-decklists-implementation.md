# Decklists Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add decklists as a first-class data primitive with sync from 17lands and LLM query tools.

**Architecture:** Normalized schema with `decklists` and `decklist_cards` tables. Sync follows existing pattern (like augmentCards). Three new LLM tools for deck queries.

**Tech Stack:** TypeScript, Turso/libsql, OpenAI function tools, Playwright (17lands client)

---

## Task 1: Add Database Schema

**Files:**

- Modify: `src/core/db/schema.ts`

**Step 1: Add TypeScript interfaces**

Add after the `Game` interface (around line 63):

```typescript
export interface Decklist {
  draft_id: string;
  main_colors: string | null;
  splash_colors: string | null;
}

export interface DecklistCard {
  draft_id: string;
  card_name: string;
  quantity: number;
  is_maindeck: number;
}
```

**Step 2: Add SQL table definitions**

Add to `CREATE_TABLES_SQL` before the final closing backtick (after the games index, around line 133):

```sql
CREATE TABLE IF NOT EXISTS decklists (
  draft_id TEXT PRIMARY KEY REFERENCES drafts(id),
  main_colors TEXT,
  splash_colors TEXT
);

CREATE TABLE IF NOT EXISTS decklist_cards (
  draft_id TEXT REFERENCES decklists(draft_id),
  card_name TEXT REFERENCES cards(name),
  quantity INTEGER NOT NULL,
  is_maindeck INTEGER NOT NULL,
  PRIMARY KEY (draft_id, card_name, is_maindeck)
);

CREATE INDEX IF NOT EXISTS idx_decklist_cards_card ON decklist_cards(card_name);
CREATE INDEX IF NOT EXISTS idx_decklist_cards_draft ON decklist_cards(draft_id);
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/core/db/schema.ts
git commit -m "feat(db): add decklists and decklist_cards schema"
```

---

## Task 2: Add 17lands Deck Types

**Files:**

- Modify: `src/core/seventeen-lands/types.ts`

**Step 1: Add deck API response types**

Add at the end of the file:

```typescript
export interface SeventeenLandsDeckCard {
  id: number;
  name: string;
  cmc: number;
  color_identity: string[];
  mana_cost: string;
  image_url: string;
  rarity: string;
  types: string[];
}

export interface SeventeenLandsDeckEventInfo {
  id: string;
  expansion: string;
  format: string;
  wins: number;
  losses: number;
  deck_links: string[];
}

export interface SeventeenLandsDeck {
  groups: Array<{
    name: "Maindeck" | "Sideboard";
    cards: number[];
  }>;
  cards: Record<string, SeventeenLandsDeckCard>;
  main_colors: string;
  splash_colors: string;
  event_info: SeventeenLandsDeckEventInfo;
}
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/core/seventeen-lands/types.ts
git commit -m "feat(17lands): add deck API response types"
```

---

## Task 3: Add getDeck Method to 17lands Client

**Files:**

- Modify: `src/core/seventeen-lands/client.ts`

**Step 1: Add import for new type**

Update the import at line 7 to include the new type:

```typescript
import type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
  SeventeenLandsGameList,
  SeventeenLandsEventDetails,
  SeventeenLandsDeck,
} from "./types";
```

**Step 2: Add getDeck method**

Add after the `getEventDetails` method (around line 198):

```typescript
async getDeck(draftId: string, deckIndex: number): Promise<SeventeenLandsDeck> {
  const params = new URLSearchParams({
    draft_id: draftId,
    deck_index: deckIndex.toString(),
  });
  return withRetry(() => this.fetchApi<SeventeenLandsDeck>(`/data/deck?${params}`));
}
```

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/core/seventeen-lands/client.ts
git commit -m "feat(17lands): add getDeck method"
```

---

## Task 4: Export New Type from Index

**Files:**

- Modify: `src/core/seventeen-lands/index.ts`

**Step 1: Check current exports and add new type**

First read the file to see current exports, then add `SeventeenLandsDeck` to the type exports.

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/core/seventeen-lands/index.ts
git commit -m "feat(17lands): export SeventeenLandsDeck type"
```

---

## Task 5: Create Decklist Sync Module

**Files:**

- Create: `src/sync/decklists.ts`

**Step 1: Create the sync module**

```typescript
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
        // Fetch deck_index=0 to discover version count
        const deck = await api.getDeck(draftId, 0);
        const finalIndex = deck.event_info.deck_links.length - 1;

        // Fetch final deck if different
        const finalDeck = finalIndex > 0 ? await api.getDeck(draftId, finalIndex) : deck;

        await insertDecklist(db, draftId, finalDeck);
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
```

**Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/sync/decklists.ts
git commit -m "feat(sync): add decklist sync module"
```

---

## Task 6: Integrate Decklist Sync into Main Sync

**Files:**

- Modify: `src/sync/index.ts`

**Step 1: Add import**

Add after the `augmentCards` import (around line 11):

```typescript
import { syncDecklists } from "./decklists";
```

**Step 2: Call syncDecklists after augmentCards**

Find where `augmentCards()` is called (around line 285) and add syncDecklists call after it:

```typescript
// Augment cards from Scryfall
if (!dryRun) {
  await augmentCards();
}

// Sync decklists from 17lands
if (!dryRun) {
  await syncDecklists();
}
```

**Step 3: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/sync/index.ts
git commit -m "feat(sync): integrate decklist sync into main sync flow"
```

---

## Task 7: Add Decklist Query Functions

**Files:**

- Modify: `src/core/db/queries.ts`

**Step 1: Add imports for new types**

Update the import at line 6:

```typescript
import type { Draft, Pick, CardStats, Card, Decklist, DecklistCard } from "./schema";
```

**Step 2: Add getDeck query function**

Add at the end of the file:

```typescript
export interface DeckWithCards {
  draft_id: string;
  main_colors: string | null;
  splash_colors: string | null;
  maindeck: Array<Card & { quantity: number }>;
  sideboard: Array<Card & { quantity: number }>;
}

export async function getDeck(draftId: string): Promise<DeckWithCards | null> {
  const db = await getClient();

  // Get decklist metadata
  const deckResult = await db.execute({
    sql: "SELECT * FROM decklists WHERE draft_id = ?",
    args: [draftId],
  });

  if (deckResult.rows.length === 0) {
    return null;
  }

  const decklist = deckResult.rows[0] as unknown as Decklist;

  // Get cards with full details
  const cardsResult = await db.execute({
    sql: `SELECT dc.quantity, dc.is_maindeck, c.*
          FROM decklist_cards dc
          JOIN cards c ON dc.card_name = c.name
          WHERE dc.draft_id = ?`,
    args: [draftId],
  });

  const maindeck: Array<Card & { quantity: number }> = [];
  const sideboard: Array<Card & { quantity: number }> = [];

  for (const row of cardsResult.rows) {
    const card = {
      name: row.name as string,
      image_url: row.image_url as string | null,
      types: row.types as string | null,
      mana_cost: row.mana_cost as string | null,
      colors: row.colors as string | null,
      oracle_id: row.oracle_id as string | null,
      oracle_text: row.oracle_text as string | null,
      cmc: row.cmc as number | null,
      rarity: row.rarity as string | null,
      quantity: row.quantity as number,
    };

    if (row.is_maindeck === 1) {
      maindeck.push(card);
    } else {
      sideboard.push(card);
    }
  }

  return {
    draft_id: decklist.draft_id,
    main_colors: decklist.main_colors,
    splash_colors: decklist.splash_colors,
    maindeck,
    sideboard,
  };
}
```

**Step 3: Add searchDecks query function**

```typescript
export interface SearchDecksParams {
  card_name: string;
  in_maindeck?: boolean;
  set?: string;
  min_wins?: number;
}

export interface SearchDecksResult {
  draft_id: string;
  set: string;
  wins: number;
  losses: number;
  in_maindeck: boolean;
  quantity: number;
}

export async function searchDecks(params: SearchDecksParams): Promise<SearchDecksResult[]> {
  const db = await getClient();
  const conditions: string[] = ["dc.card_name = ?"];
  const args: (string | number)[] = [params.card_name];

  if (params.in_maindeck !== undefined) {
    conditions.push("dc.is_maindeck = ?");
    args.push(params.in_maindeck ? 1 : 0);
  }

  if (params.set) {
    conditions.push('d."set" = ?');
    args.push(params.set);
  }

  if (params.min_wins !== undefined) {
    conditions.push("d.wins >= ?");
    args.push(params.min_wins);
  }

  const result = await db.execute({
    sql: `SELECT d.id as draft_id, d."set", d.wins, d.losses, dc.is_maindeck, dc.quantity
          FROM decklist_cards dc
          JOIN drafts d ON dc.draft_id = d.id
          WHERE ${conditions.join(" AND ")}
          ORDER BY d.draft_date DESC
          LIMIT 100`,
    args,
  });

  return result.rows.map((r) => ({
    draft_id: r.draft_id as string,
    set: r.set as string,
    wins: r.wins as number,
    losses: r.losses as number,
    in_maindeck: r.is_maindeck === 1,
    quantity: r.quantity as number,
  }));
}
```

**Step 4: Add analyzeDeckChoices query function**

```typescript
export interface DeckChoiceAnalysis {
  draft_id: string;
  wins: number;
  losses: number;
  sideboard_analysis: Array<{
    name: string;
    quantity: number;
    gih_wr: number | null;
    avg_taken_at: number | null;
    assessment: string;
  }>;
}

export async function analyzeDeckChoices(draftId: string): Promise<DeckChoiceAnalysis | null> {
  const db = await getClient();

  // Get draft info
  const draftResult = await db.execute({
    sql: 'SELECT id, "set", wins, losses FROM drafts WHERE id = ?',
    args: [draftId],
  });

  if (draftResult.rows.length === 0) {
    return null;
  }

  const draft = draftResult.rows[0];
  const set = draft.set as string;

  // Get sideboard cards with stats
  const sideboardResult = await db.execute({
    sql: `SELECT dc.card_name, dc.quantity, cs.game_in_hand_wr, cs.avg_pick_at
          FROM decklist_cards dc
          LEFT JOIN card_stats cs ON dc.card_name = cs.card_name AND cs."set" = ?
          WHERE dc.draft_id = ? AND dc.is_maindeck = 0
          ORDER BY cs.game_in_hand_wr DESC NULLS LAST`,
    args: [set, draftId],
  });

  const sideboardAnalysis = sideboardResult.rows.map((r) => {
    const gihWr = r.game_in_hand_wr as number | null;
    let assessment = "No stats available";

    if (gihWr !== null) {
      if (gihWr >= 0.58) {
        assessment = `High GIH WR (${(gihWr * 100).toFixed(1)}%) - consider playing`;
      } else if (gihWr >= 0.54) {
        assessment = `Above average GIH WR (${(gihWr * 100).toFixed(1)}%)`;
      } else if (gihWr >= 0.5) {
        assessment = `Average GIH WR (${(gihWr * 100).toFixed(1)}%)`;
      } else {
        assessment = `Below average GIH WR (${(gihWr * 100).toFixed(1)}%)`;
      }
    }

    return {
      name: r.card_name as string,
      quantity: r.quantity as number,
      gih_wr: gihWr,
      avg_taken_at: r.avg_pick_at as number | null,
      assessment,
    };
  });

  return {
    draft_id: draftId,
    wins: draft.wins as number,
    losses: draft.losses as number,
    sideboard_analysis: sideboardAnalysis,
  };
}
```

**Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/core/db/queries.ts
git commit -m "feat(db): add decklist query functions"
```

---

## Task 8: Add LLM Tool Definitions

**Files:**

- Modify: `src/core/llm/tools.ts`

**Step 1: Add new tool definitions**

Add to the `tools` array (before the closing bracket around line 94):

```typescript
{
  type: "function",
  name: "get_deck",
  description: "Get the decklist for a draft, including maindeck and sideboard with full card details",
  parameters: {
    type: "object",
    properties: {
      draft_id: { type: "string", description: "Draft ID" },
    },
    required: ["draft_id"],
  },
  strict: false,
},
{
  type: "function",
  name: "search_decks",
  description: "Find drafts where a card was in maindeck or sideboard",
  parameters: {
    type: "object",
    properties: {
      card_name: { type: "string", description: "Card name to search for" },
      in_maindeck: { type: "boolean", description: "Filter to maindeck only (true) or sideboard only (false)" },
      set: { type: "string", description: "Filter by set code" },
      min_wins: { type: "integer", description: "Minimum wins" },
    },
    required: ["card_name"],
  },
  strict: false,
},
{
  type: "function",
  name: "analyze_deck_choices",
  description: "Get sideboard cards with their 17lands stats to identify potentially wrong cuts",
  parameters: {
    type: "object",
    properties: {
      draft_id: { type: "string", description: "Draft ID" },
    },
    required: ["draft_id"],
  },
  strict: false,
},
```

**Step 2: Update ToolName type**

Update the type union (around line 97):

```typescript
export type ToolName =
  | "list_drafts"
  | "get_draft"
  | "get_my_stats"
  | "get_my_card_history"
  | "get_card_stats"
  | "get_format_top_cards"
  | "get_deck"
  | "search_decks"
  | "analyze_deck_choices";
```

**Step 3: Update isValidToolName function**

Update the array in the function (around line 106):

```typescript
export function isValidToolName(name: string): name is ToolName {
  return [
    "list_drafts",
    "get_draft",
    "get_my_stats",
    "get_my_card_history",
    "get_card_stats",
    "get_format_top_cards",
    "get_deck",
    "search_decks",
    "analyze_deck_choices",
  ].includes(name);
}
```

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/llm/tools.ts
git commit -m "feat(llm): add decklist tool definitions"
```

---

## Task 9: Add LLM Tool Handlers

**Files:**

- Modify: `src/core/llm/handlers.ts`

**Step 1: Update imports**

Update the import from queries (line 6):

```typescript
import {
  listDrafts,
  getDraft,
  getMyStats,
  getMyCardHistory,
  getCardStats,
  getFormatTopCards,
  getDeck,
  searchDecks,
  analyzeDeckChoices,
} from "../db/queries";
```

**Step 2: Add case handlers**

Add before the `default` case (around line 40):

```typescript
case "get_deck":
  return JSON.stringify(await getDeck(args.draft_id as string));

case "search_decks":
  return JSON.stringify(
    await searchDecks({
      card_name: args.card_name as string,
      in_maindeck: args.in_maindeck as boolean | undefined,
      set: args.set as string | undefined,
      min_wins: args.min_wins as number | undefined,
    })
  );

case "analyze_deck_choices":
  return JSON.stringify(await analyzeDeckChoices(args.draft_id as string));
```

**Step 3: Run typecheck and tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/core/llm/handlers.ts
git commit -m "feat(llm): add decklist tool handlers"
```

---

## Task 10: Run Database Migration

**Step 1: Run migration**

Run: `pnpm db:migrate`
Expected: Tables created successfully

**Step 2: Verify tables exist**

Run: `turso db shell demonic-tutor ".tables"`
Expected: Output includes `decklists` and `decklist_cards`

---

## Task 11: Test End-to-End

**Step 1: Run sync to backfill decklists**

Run: `pnpm sync`
Expected: "Syncing decklists from 17lands..." message, decklists synced

**Step 2: Verify data in database**

Run: `turso db shell demonic-tutor "SELECT COUNT(*) FROM decklists"`
Expected: Count matches number of drafts

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete decklists feature implementation"
```
