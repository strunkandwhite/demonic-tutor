# Decklists Feature Design

## Overview

Add decklists as a first-class data primitive. Each draft has one decklist (the final version), containing maindeck and sideboard cards. This enables the LLM to analyze deck building decisions and suggest improvements.

## Data Model

### Tables

```sql
CREATE TABLE decklists (
  draft_id TEXT PRIMARY KEY REFERENCES drafts(id),
  main_colors TEXT,
  splash_colors TEXT
);

CREATE TABLE decklist_cards (
  draft_id TEXT REFERENCES decklists(draft_id),
  card_name TEXT REFERENCES cards(name),
  quantity INTEGER NOT NULL,
  is_maindeck INTEGER NOT NULL,  -- 1 = maindeck, 0 = sideboard
  PRIMARY KEY (draft_id, card_name, is_maindeck)
);

CREATE INDEX idx_decklist_cards_card ON decklist_cards(card_name);
```

### Schema Types

```typescript
interface Decklist {
  draft_id: string;
  main_colors: string | null;
  splash_colors: string | null;
}

interface DecklistCard {
  draft_id: string;
  card_name: string;
  quantity: number;
  is_maindeck: number;
}
```

## 17lands API

**Endpoint:** `GET /data/deck?draft_id={id}&deck_index={n}`

**Response structure:**

```typescript
interface SeventeenLandsDeck {
  groups: Array<{
    name: "Maindeck" | "Sideboard";
    cards: number[]; // Card IDs, duplicates = quantities
  }>;
  cards: Record<
    string,
    {
      id: number;
      name: string;
      cmc: number;
      color_identity: string[];
      mana_cost: string;
      image_url: string;
      rarity: string;
      types: string[];
    }
  >;
  main_colors: string; // e.g., "WG"
  splash_colors: string; // e.g., "ubr" (lowercase)
  event_info: {
    deck_links: string[]; // All deck versions
    // ... other fields
  };
}
```

**Finding the final deck:**

1. Fetch with `deck_index=0`
2. Read `event_info.deck_links.length - 1` for final index
3. If > 0, fetch again with final index

## Sync Flow

### New File: `src/sync/decklists.ts`

```typescript
export async function syncDecklists() {
  console.log("Syncing decklists from 17lands...");

  const db = await getClient();
  const api = createSeventeenLandsClient();

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
      console.error(`\nFailed to sync decklist for ${draftId}:`, err);
    }

    await new Promise((r) => setTimeout(r, 2000)); // Rate limit
  }

  console.log(`\nDecklist sync complete: ${synced} synced`);
  await api.close();
}
```

### Integration

In `src/sync/index.ts`, add after `augmentCards()`:

```typescript
if (!dryRun) {
  await syncDecklists();
}
```

## LLM Tools

### 1. get_deck

Get the decklist for a specific draft.

```typescript
{
  name: "get_deck",
  description: "Get the decklist for a draft, including maindeck and sideboard with full card details",
  parameters: {
    draft_id: { type: "string", required: true }
  }
}
```

**Returns:**

```typescript
{
  draft_id: string;
  main_colors: string;
  splash_colors: string;
  maindeck: Array<{ name: string; quantity: number; types: string; cmc: number; ... }>;
  sideboard: Array<{ name: string; quantity: number; types: string; cmc: number; ... }>;
}
```

### 2. search_decks

Find drafts where a specific card appeared in maindeck or sideboard.

```typescript
{
  name: "search_decks",
  description: "Find drafts where a card was in maindeck or sideboard",
  parameters: {
    card_name: { type: "string", required: true },
    in_maindeck: { type: "boolean" },  // null = either
    set: { type: "string" },
    min_wins: { type: "integer" }
  }
}
```

**Returns:**

```typescript
Array<{
  draft_id: string;
  set: string;
  wins: number;
  losses: number;
  in_maindeck: boolean;
  quantity: number;
}>;
```

### 3. analyze_deck_choices

Compare sideboard cards against their 17lands stats to identify potential misbuilds.

```typescript
{
  name: "analyze_deck_choices",
  description: "Get sideboard cards with their 17lands stats to identify potentially wrong cuts",
  parameters: {
    draft_id: { type: "string", required: true }
  }
}
```

**Returns:**

```typescript
{
  draft_id: string;
  result: "win" | "loss"; // Final record context
  sideboard_analysis: Array<{
    name: string;
    quantity: number;
    gih_wr: number | null;
    avg_taken_at: number | null;
    assessment: string; // e.g., "High GIH WR (58%) - consider playing"
  }>;
}
```

## Edge Cases

1. **Draft with no deck data** - Some old drafts may not have deck info. Log warning and skip.

2. **Cards not in cards table** - Deck API returns full card details. Upsert missing cards before inserting decklist_cards.

3. **Basic lands** - Include them. Enables mana base analysis ("8 Plains but only 6 white cards").

4. **Multiple deck versions** - Always use final version (highest deck_index).

## Migration

1. Add tables to `CREATE_TABLES_SQL` in `src/core/db/schema.ts`
2. Run `pnpm db:migrate`
3. Run `pnpm sync` to backfill existing drafts
