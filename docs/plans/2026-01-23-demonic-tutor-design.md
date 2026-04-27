# Demonic Tutor - Personal MTG Draft Analytics

> **Superseded by** the later 2026-01-23 implementation plan (`2026-01-23-implementation-plan.md`)
> and the follow-on design / implementation plans for seventeen-lands sync,
> games-and-cards expansion, decklists, Bo1 card stats, and game links + draft chat.
> Kept for historical context.

Personal app for collecting and analyzing MTG Arena draft data from 17lands.

## Overview

A web app that:

- Syncs your draft history from 17lands
- Stores drafts, picks, and card stats in Turso
- Provides a chat interface (OpenAI) to query your data
- Displays visualizations of your draft performance

## Architecture

```
17lands API → Sync Script → Turso Database
                                   ↓
                         Next.js Web App
                                   ↓
                    ┌──────────────┴──────────────┐
                    ↓                              ↓
              Chat Interface                 Dashboard
           (LLM + tools)              (stats, draft table)
```

## 17lands API

**Authentication:** Session cookie (`session=...` from browser)

| Endpoint                                             | Description         | Key Data                                       |
| ---------------------------------------------------- | ------------------- | ---------------------------------------------- |
| `/data/user`                                         | All your drafts     | `drafts[]` with id, colors, wins, losses, rank |
| `/data/draft?draft_id=X`                             | Pick-by-pick detail | `picks[]` + `card_performance_data`            |
| `/data/event_metadata?draft_id=X`                    | Draft metadata      | Links, format, wins/losses                     |
| `/data/user_deck?sharing_token=X&deck=Y&timestamp=Z` | Final deck          | Maindeck/sideboard with card details           |

The `/data/draft` response includes `card_performance_data` with 17lands stats (GIH WR, ALSA, ATA) for every card in the set.

## Database Schema

```sql
-- Draft metadata (from /data/user)
drafts (
  id TEXT PRIMARY KEY,              -- "2bbe3ee5f94e400cbb949416d2591263"
  set TEXT NOT NULL,                -- "FIN", "DSK", etc.
  format TEXT NOT NULL,             -- "PremierDraft"
  colors TEXT,                      -- "UBGwr" (uppercase=main, lowercase=splash)
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  start_rank TEXT,                  -- "Platinum-3"
  end_rank TEXT,                    -- "Platinum-2"
  draft_date TEXT NOT NULL,         -- from first_pick_time
  synced_at TEXT NOT NULL           -- when we imported this
)

-- Individual picks (from /data/draft)
picks (
  draft_id TEXT REFERENCES drafts,
  pack_number INTEGER NOT NULL,     -- 0, 1, 2
  pick_number INTEGER NOT NULL,     -- 0-13
  card_name TEXT NOT NULL,          -- card picked
  available_cards TEXT NOT NULL,    -- JSON array of card names in pack
  PRIMARY KEY (draft_id, pack_number, pick_number)
)

-- Card registry (extracted from pick data + deck data)
cards (
  name TEXT PRIMARY KEY,
  image_url TEXT,
  types TEXT,                       -- "Creature - Human Wizard"
  mana_cost TEXT,                   -- "{2}{U}{U}"
  colors TEXT                       -- derived from mana_cost
)

-- 17lands stats per card per set (from card_performance_data)
card_stats (
  card_name TEXT REFERENCES cards,
  set TEXT NOT NULL,
  avg_seen_at REAL,                 -- ALSA
  avg_pick_at REAL,                 -- ATA
  game_in_hand_wr REAL,             -- GIH WR
  times_seen INTEGER,
  times_picked INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (card_name, set)
)
```

**Notes:**

- `colors` field uses 17lands convention: uppercase = main colors, lowercase = splash
- `card_stats` extracted from `card_performance_data` in draft responses
- Card details populated from pick/deck responses (no Scryfall needed)

## Sync Script

```
pnpm sync              # Fetch new drafts since last sync
pnpm sync --full       # Re-fetch everything (rebuild database)
```

**Flow:**

1. Fetch `/data/user` → get list of all drafts
2. Compare against database → identify new draft IDs
3. For each new draft:
   - Fetch `/data/draft?draft_id=X`
   - Extract picks → insert into picks table
   - Extract card_performance_data → upsert into card_stats
   - Extract card details → upsert into cards
   - Insert draft record
4. Log summary: "Synced 3 new drafts (FIN: 2, DSK: 1)"

**Build hooks:**

```json
{
  "scripts": {
    "sync": "tsx src/sync/index.ts",
    "predev": "pnpm sync",
    "prebuild": "pnpm sync"
  }
}
```

**Idempotency:**

- Draft ID is primary key - same draft never imported twice
- Card stats upserted with latest data
- `--full` flag truncates and rebuilds from scratch

## Web App

**Stack:** Next.js (same as read-the-bones)

**Pages:**

- `/` - Dashboard with chat, stats overview, draft table
- `/draft/[id]` - Single draft detail (picks, deck, performance)

**Dashboard layout:**

1. **Chat interface** (top, primary interaction)
2. **Stats summary cards** - Total drafts, win rate, trophies, color pair breakdown
3. **Draft table** (sortable, filterable) - Date, Set, Colors, Record, Rank Change

**Draft detail page:**

- Pick-by-pick timeline showing what was available
- Final deck visualization
- Compare your picks to 17lands stats

## LLM Tools

```typescript
// Draft queries
list_drafts({ set?, colors?, min_wins?, date_from?, date_to?, limit? })
get_draft({ draft_id })

// Aggregate stats
get_my_stats({ set?, colors?, date_from?, date_to? })
get_my_card_history({ card_name, set? })

// 17lands reference data
get_card_stats({ card_name, set })
get_format_top_cards({ set, limit?, min_games? })
```

**Example queries:**

- "How am I doing in FIN?" → `get_my_stats({ set: "FIN" })`
- "What's my best color pair?" → `get_my_stats({})` → analyze color_breakdown
- "Show me my BG drafts" → `list_drafts({ colors: "BG" })`
- "Is Sheoldred good?" → `get_card_stats({ card_name: "Sheoldred...", set: "FIN" })`

**Citations:**

- `[draft:2bbe3ee5...]` - link to draft detail page
- `[stats:FIN]` - format stats source

## Project Structure

```
demonic-tutor/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── page.tsx            # Dashboard (chat + stats + table)
│   │   ├── draft/[id]/page.tsx # Draft detail
│   │   └── api/chat/route.ts   # LLM chat endpoint
│   ├── core/
│   │   ├── db/                 # Turso client, schema, queries
│   │   ├── llm/                # OpenAI client, tools, system prompt
│   │   └── seventeen-lands/    # API client for 17lands
│   └── sync/                   # Sync script
│       └── index.ts
├── docs/
│   └── plans/
├── .env.local                  # Secrets (not committed)
└── package.json
```

## Environment Variables

```
SEVENTEEN_LANDS_SESSION=...     # Session cookie from browser
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
OPENAI_API_KEY=...
```

## Prior Art

Architecture based on [read-the-bones](../read-the-bones), a rotisserie draft analytics tool with similar patterns:

- Turso as single source of truth
- LLM chat with tool-based retrieval and citations
- Next.js web app
