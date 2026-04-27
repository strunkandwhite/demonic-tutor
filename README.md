# Demonic Tutor

Personal MTG Arena draft analytics powered by 17lands data. The app syncs your
drafts, games, and decklists from 17lands into a local Turso database, augments
card data from Scryfall, and exposes the result through a Next.js dashboard
backed by an LLM chat that can query everything via function tools.

## What it gives you

- A dashboard of your recent drafts with win/loss, colors, and per-pick detail
- Per-card win-rate and pick stats sourced from the 17lands `/card_ratings/data`
  endpoint (PremierDraft / Bo1)
- Format-level aggregates: color win rates, play/draw splits, trophy decklists
- A chat panel that calls function tools (`list_drafts`, `get_draft`,
  `get_my_stats`, `get_format_meta`, etc.) to answer questions about your data

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in your credentials:
   - `SEVENTEEN_LANDS_EMAIL` - Your 17lands account email
   - `SEVENTEEN_LANDS_PASSWORD` - Your 17lands account password
   - `TURSO_DATABASE_URL` - Your Turso database URL
   - `TURSO_AUTH_TOKEN` - Your Turso auth token
   - `OPENAI_API_KEY` - Your OpenAI API key

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Install the Playwright Chromium browser used by the 17lands client (one-time):

   ```bash
   pnpm playwright:install
   ```

   Note: this is intentionally **not** a `postinstall` script — running
   Playwright's Chromium download at install time breaks Vercel builds and adds
   ~150 MB to every install.

## Usage

```bash
# Run database migrations
pnpm db:migrate

# Sync your 17lands data
pnpm sync

# Start the dev server (runs `pnpm sync` first via predev)
pnpm dev
```

## Commands

- `pnpm sync` - Sync new drafts from 17lands (incremental)
- `pnpm sync --full` - Full re-sync (clears database first)
- `pnpm sync --dry-run` - Show what would sync without writing
- `pnpm augment-cards` - Manually augment card data from Scryfall
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm test` - Run tests
- `pnpm typecheck` - Type-check only (`tsc --noEmit`)
- `pnpm check` - Run `typecheck && lint && format:check && test`
