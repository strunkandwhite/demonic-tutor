# Demonic Tutor - Claude Context

## Project Overview

Personal MTG Arena draft analytics app that syncs data from 17lands and provides LLM-powered chat queries.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Database**: Turso (libsql)
- **LLM**: OpenAI Responses API with function tools
- **Styling**: Tailwind CSS 4

## Available Tools

- **Turso CLI**: `turso` shell is available for database operations
  - `turso db shell demonic-tutor` - interactive SQL shell
  - `turso db show demonic-tutor` - show database info

## Key Commands

```bash
pnpm dev          # Start dev server (runs sync first)
pnpm sync         # Sync new drafts from 17lands
pnpm sync --full  # Full re-sync (clears database)
pnpm db:migrate   # Run database migrations
pnpm build        # Production build
pnpm test         # Run tests
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/chat/          # Chat API endpoint
│   ├── components/        # React components (Chat, StatsCards, DraftTable)
│   ├── draft/[id]/        # Draft detail page
│   └── page.tsx           # Dashboard
├── core/
│   ├── db/                # Turso client, schema, queries
│   ├── llm/               # OpenAI tools and chat client
│   └── seventeen-lands/   # 17lands API client
└── sync/                  # Data sync script
```

## Database Schema

- `drafts` - Draft metadata (id, set, format, colors, wins, losses, ranks)
- `picks` - Individual picks (draft_id, pack_number, pick_number, card_name, available_cards)
- `cards` - Card registry (name, image_url, types, mana_cost, colors)
- `card_stats` - 17lands stats per card per set (GIH WR, ALSA, ATA)

**Note:** The column `set` is a SQL reserved word and must be quoted as `"set"` in all SQL statements.

## Environment Variables

- `SEVENTEEN_LANDS_SESSION` - Session cookie from 17lands (get from browser dev tools)
- `TURSO_DATABASE_URL` - Turso database URL
- `TURSO_AUTH_TOKEN` - Turso auth token
- `OPENAI_API_KEY` - OpenAI API key

## LLM Tools Available

- `list_drafts` - Filter drafts by set, colors, date range, wins
- `get_draft` - Get detailed draft with all picks
- `get_my_stats` - Aggregate stats with color breakdown
- `get_my_card_history` - User's history with a specific card
- `get_card_stats` - 17lands stats for a card
- `get_format_top_cards` - Top cards by GIH win rate
