# Demonic Tutor - Claude Context

## Project Overview

Personal MTG Arena draft analytics app that syncs data from 17lands and provides LLM-powered chat queries.

**Single-user app with one Turso database.** No migration versioning needed - `schema.ts` is the source of truth and `db:migrate` just runs `CREATE TABLE IF NOT EXISTS` statements.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Database**: Turso (libsql)
- **LLM**: OpenAI Responses API with function tools
- **Styling**: Tailwind CSS 4

## Available Tools

- **Turso CLI**: `turso` shell is available for database operations
  - `turso db shell demonic-tutor` - interactive SQL shell
  - `turso db show demonic-tutor` - show database info
  - **NEVER drop tables without express user permission**

## Key Commands

```bash
pnpm dev          # Start dev server (runs sync first via predev)
pnpm sync         # Sync new drafts from 17lands
pnpm sync --full  # Full re-sync (clears database)
pnpm db:migrate   # Run database migrations
pnpm augment-cards # Augment card data from Scryfall
pnpm build        # Production build
pnpm test         # Run tests
pnpm typecheck    # Type-check only (tsc --noEmit)
pnpm check        # typecheck && lint && format:check && test
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/
│   │   ├── chat/          # Non-streaming chat (legacy) and chat/stream/
│   │   ├── draft/[id]/    # Draft detail JSON endpoint
│   │   ├── auth.ts        # Shared auth helper
│   │   └── rate-limit.ts  # Token-bucket rate limiter
│   ├── components/        # React components (Chat, StatsCards, DraftTable, ...)
│   ├── draft/[id]/        # Draft detail SSR page
│   ├── hooks/             # useChatStream, usePersistedChat, useCardImage
│   └── page.tsx           # Dashboard
├── augment/               # Scryfall card-data augmentation script
├── core/
│   ├── db/                # Turso client, schema, queries, validators
│   ├── llm/               # OpenAI tools, handlers, cache, archetype tags
│   └── seventeen-lands/   # 17lands API client (Playwright)
├── sync/                  # Data sync scripts (drafts, games, decklists, format-stats)
└── instrumentation.ts     # Next.js instrumentation hook (env validation)
```

## Database Schema

- `drafts` - Draft metadata (id, set, format, colors, wins, losses, ranks)
- `games` - Game results (draft_id, on_play, won, turns, game_time, replay_link)
- `picks` - Individual picks (draft_id, pack_number, pick_number, card_name, available_cards)
- `cards` - Card registry (name, image_url, types, mana_cost, colors, oracle_id, oracle_text, cmc, rarity)
- `card_stats` - 17lands stats per card per set (GIH WR, ALSA, ATA)
- `decklists` - Deck snapshots per draft (and trophy decks) keyed by source
- `decklist_cards` - Per-decklist card counts (main/side)
- `format_color_stats` - Per-set color win-rate aggregates
- `format_play_draw` - Per-set play/draw win-rate aggregates
- `sync_metadata` - Key-value store for sync state (last_sync_date)

**Note:** The column `set` is a SQL reserved word and must be quoted as `"set"` in all SQL statements.

## Sync System

The sync system uses Playwright to authenticate with 17lands and bypass WAF protection.

- Session persists to `.seventeen-lands-session.json` (gitignored)
- First sync starts from 2026-01-06
- Subsequent syncs query from last sync date (inclusive)
- 1 second minimum delay between API calls (`MIN_API_DELAY_MS`) to avoid rate limiting
- `--dry-run` flag shows what would sync without writing to DB

**Sync steps (see `src/sync/index.ts`):**

1. Sync drafts from 17lands (date-range based)
2. Sync games from 17lands (all games, dedup by ID)
3. `linkGamesToDrafts` — match games to drafts via 17lands event_details
4. Augment cards from Scryfall (only cards missing oracle_text)
5. `syncDecklists` — fetch user decklists per draft
6. `syncFormatStats` — play/draw, color ratings, card stats, trophy decks (weekly cache)

## Environment Variables

- `SEVENTEEN_LANDS_EMAIL` - Your 17lands account email
- `SEVENTEEN_LANDS_PASSWORD` - Your 17lands account password
- `TURSO_DATABASE_URL` - Turso database URL
- `TURSO_AUTH_TOKEN` - Turso auth token
- `OPENAI_API_KEY` - OpenAI API key
- `API_SECRET` - Required in production (instrumentation.ts fails closed without it)
- `SITE_ORIGIN` - Used by chat POST endpoints for same-origin checks

## LLM Tools Available

- `list_drafts` - Filter drafts by set, colors, date range, wins
- `get_draft` - Get detailed draft with all picks
- `get_my_stats` - Aggregate stats with color breakdown
- `get_my_card_history` - User's history with a specific card
- `get_card_stats` - 17lands stats for a card
- `get_format_top_cards` - Top cards by GIH win rate
- `get_deck` - Fetch a single decklist
- `search_decks` - Search decklists by card / archetype
- `analyze_deck_choices` - Compare picks against deck context
- `get_card_info` - Card oracle text, types, cost
- `set_user_context` - Set the active draft / set / format for follow-ups
- `get_format_meta` - Format-level color and play/draw aggregates
- `get_trophy_decks` - Recent trophy decks for a set

## Coding Conventions

- **Unused variables**: REMOVE them completely, do not rename to `_var`
- **Unused imports**: REMOVE them, do not leave commented out
- **Backwards compatibility**: Delete unused code, don't add `// removed` comments
- **Scripts**: Use `pnpm test`, `pnpm lint`, `pnpm format:check` etc., not `pnpm exec`
