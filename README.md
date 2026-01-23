# Demonic Tutor

Personal MTG Arena draft analytics powered by 17lands data.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in your credentials
2. Get your 17lands session cookie from browser dev tools after logging in
3. Create a Turso database and add credentials
4. Add your OpenAI API key

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
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
