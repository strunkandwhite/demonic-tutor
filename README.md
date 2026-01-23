# Demonic Tutor

Personal MTG Arena draft analytics powered by 17lands data.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in your credentials:
   - `SEVENTEEN_LANDS_EMAIL` - Your 17lands account email
   - `SEVENTEEN_LANDS_PASSWORD` - Your 17lands account password
   - `TURSO_DATABASE_URL` - Your Turso database URL
   - `TURSO_AUTH_TOKEN` - Your Turso auth token
   - `OPENAI_API_KEY` - Your OpenAI API key

2. Install Playwright browsers:
   ```bash
   pnpm exec playwright install chromium
   ```

## Usage

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm db:migrate

# Sync your 17lands data
pnpm sync

# Start the dev server
pnpm dev
```

## Commands

- `pnpm sync` - Sync new drafts from 17lands
- `pnpm sync --full` - Full re-sync (clears database first)
- `pnpm sync --dry-run` - Show what would sync without writing
- `pnpm augment-cards` - Manually augment card data from Scryfall
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm test` - Run tests
