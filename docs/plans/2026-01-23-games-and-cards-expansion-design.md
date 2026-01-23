# Games Tracking & Card Data Expansion Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add play/draw game tracking and expand card data with Scryfall augmentation.

**Architecture:** Extend the sync flow to fetch games from 17lands and augment card data from Scryfall. Games link to drafts via ID extracted from game links.

**Tech Stack:** Playwright (existing), Scryfall API (public, no auth), Turso (libsql)

---

## Games Table

New table to track play/draw data:

```sql
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,           -- "{draft_id}_{game_number}"
  draft_id TEXT REFERENCES drafts(id),
  game_number INTEGER NOT NULL,  -- 0, 1, 2 (from link suffix)
  game_time TEXT NOT NULL,
  on_play INTEGER NOT NULL,      -- 1 = on play, 0 = on draw
  won INTEGER NOT NULL,          -- 1 = won, 0 = lost
  turns INTEGER,
  event_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_games_draft ON games(draft_id);
```

### Game Link Parsing

The 17lands `/data/user_game_list` endpoint returns games with links like:

```
/user/game_replay/20240820/acabda3cc65c45de92b0a08c9f6feeab/0
```

Parse as: `/user/game_replay/{date}/{draft_id}/{game_number}`

- `draft_id`: 32-char hex, matches our drafts table IDs
- `game_number`: 0, 1, 2 for games within an event
- Construct `id` as `{draft_id}_{game_number}` for uniqueness

Games from drafts not in our database (pre-2026-01-06) are stored with `draft_id = NULL`.

## Card Table Expansion

Add columns to existing `cards` table:

```sql
ALTER TABLE cards ADD COLUMN oracle_id TEXT;
ALTER TABLE cards ADD COLUMN oracle_text TEXT;
ALTER TABLE cards ADD COLUMN cmc REAL;
ALTER TABLE cards ADD COLUMN rarity TEXT;
```

### Updated Schema

```sql
CREATE TABLE IF NOT EXISTS cards (
  name TEXT PRIMARY KEY,
  image_url TEXT,
  types TEXT,
  mana_cost TEXT,
  colors TEXT,
  oracle_id TEXT,      -- Scryfall oracle ID (same across printings)
  oracle_text TEXT,    -- Rules text
  cmc REAL,            -- Converted mana cost
  rarity TEXT          -- common/uncommon/rare/mythic
);
```

## Scryfall Augmentation

Fill missing card data from Scryfall's public API:

1. Query cards with missing data: `SELECT name FROM cards WHERE oracle_text IS NULL`
2. For each card, fetch: `https://api.scryfall.com/cards/named?exact={name}`
3. Update card row with Scryfall data
4. Rate limit: 100ms between requests (Scryfall limit is 10 req/sec)

Cards not found in Scryfall (custom cubes) are logged and skipped.

## Updated Sync Flow

`pnpm sync` performs three steps in sequence:

```
1. Sync drafts from 17lands
   - Date-range based (last_sync_date to tomorrow)
   - Incremental with draft ID deduplication

2. Sync games from 17lands
   - Fetch all games from /data/user_game_list
   - Parse links to extract draft_id and game_number
   - INSERT OR IGNORE for deduplication
   - Link to draft if exists, NULL otherwise

3. Augment cards from Scryfall
   - Find cards with NULL oracle_text
   - Fetch from Scryfall API
   - Update card records
```

## Commands

```bash
pnpm sync              # Full sync: drafts + games + card augmentation
pnpm sync --full       # Clear DB and re-sync everything
pnpm sync --dry-run    # Show what would sync
pnpm augment-cards     # Manual: just augment cards
```

## Error Handling

- **Scryfall card not found:** Log warning, skip card, continue
- **Scryfall rate limit (429):** Wait and retry
- **Game with unknown draft_id:** Store with draft_id = NULL
- **Network errors:** Retry with exponential backoff (existing)

## File Structure

```
src/
├── sync/
│   └── index.ts           # Updated: add games sync + call augment
├── augment/
│   └── index.ts           # New: Scryfall card augmentation
└── core/
    ├── db/
    │   ├── schema.ts      # Updated: games table, card columns
    │   └── queries.ts     # Updated: games queries
    └── seventeen-lands/
        └── client.ts      # Updated: add getGames() method
```
