# Demonic Tutor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal MTG draft analytics app that syncs data from 17lands and provides chat-based queries.

**Architecture:** Next.js web app with Turso database, sync script for 17lands API, OpenAI-powered chat with tool-based retrieval.

**Tech Stack:** Next.js 16, TypeScript, Turso (libsql), OpenAI, Tailwind CSS, Vitest

---

## Task 1: Project Setup

**Files:**
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `.env.local.example`
- Modify: `.gitignore`

**Step 1: Update package.json with dependencies**

```json
{
  "name": "demonic-tutor",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "sync": "tsx src/sync/index.ts",
    "predev": "pnpm sync",
    "prebuild": "pnpm sync"
  },
  "dependencies": {
    "@libsql/client": "^0.17.0",
    "next": "16.1.1",
    "openai": "^4.77.0",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.1",
    "tailwindcss": "^4",
    "tsx": "^4.21.0",
    "typescript": "^5",
    "vitest": "^4.0.16"
  }
}
```

**Step 2: Run install**

Run: `pnpm install`
Expected: Dependencies installed

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 4: Create minimal Next.js app structure**

Create `src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Demonic Tutor",
  description: "Personal MTG draft analytics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `src/app/globals.css`:
```css
@import "tailwindcss";
```

Create `src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">Demonic Tutor</h1>
      <p className="text-gray-600">Draft analytics coming soon...</p>
    </main>
  );
}
```

**Step 5: Create .env.local.example**

```
SEVENTEEN_LANDS_SESSION=your-session-cookie
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
OPENAI_API_KEY=your-key
```

**Step 6: Update .gitignore**

```
node_modules
.next
.env.local
.env
*.log
```

**Step 7: Verify setup**

Run: `pnpm dev`
Expected: App runs at http://localhost:3000

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: initialize Next.js project with dependencies"
```

---

## Task 2: Database Schema & Client

**Files:**
- Create: `src/core/db/schema.ts`
- Create: `src/core/db/client.ts`
- Create: `src/core/db/migrate.ts`
- Test: `src/core/db/client.test.ts`

**Step 1: Create type definitions**

Create `src/core/db/schema.ts`:
```typescript
/**
 * Database schema types for Demonic Tutor.
 */

export interface Draft {
  id: string;
  set: string;
  format: string;
  colors: string | null;
  wins: number;
  losses: number;
  start_rank: string | null;
  end_rank: string | null;
  draft_date: string;
  synced_at: string;
}

export interface Pick {
  draft_id: string;
  pack_number: number;
  pick_number: number;
  card_name: string;
  available_cards: string; // JSON array
}

export interface Card {
  name: string;
  image_url: string | null;
  types: string | null;
  mana_cost: string | null;
  colors: string | null;
}

export interface CardStats {
  card_name: string;
  set: string;
  avg_seen_at: number | null;
  avg_pick_at: number | null;
  game_in_hand_wr: number | null;
  times_seen: number | null;
  times_picked: number | null;
  updated_at: string;
}

/** SQL statements to create tables */
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  set TEXT NOT NULL,
  format TEXT NOT NULL,
  colors TEXT,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  start_rank TEXT,
  end_rank TEXT,
  draft_date TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS picks (
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  pack_number INTEGER NOT NULL,
  pick_number INTEGER NOT NULL,
  card_name TEXT NOT NULL,
  available_cards TEXT NOT NULL,
  PRIMARY KEY (draft_id, pack_number, pick_number)
);

CREATE TABLE IF NOT EXISTS cards (
  name TEXT PRIMARY KEY,
  image_url TEXT,
  types TEXT,
  mana_cost TEXT,
  colors TEXT
);

CREATE TABLE IF NOT EXISTS card_stats (
  card_name TEXT NOT NULL REFERENCES cards(name),
  set TEXT NOT NULL,
  avg_seen_at REAL,
  avg_pick_at REAL,
  game_in_hand_wr REAL,
  times_seen INTEGER,
  times_picked INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (card_name, set)
);

CREATE INDEX IF NOT EXISTS idx_drafts_set ON drafts(set);
CREATE INDEX IF NOT EXISTS idx_drafts_date ON drafts(draft_date);
CREATE INDEX IF NOT EXISTS idx_picks_draft ON picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_card_stats_set ON card_stats(set);
`;
```

**Step 2: Create database client**

Create `src/core/db/client.ts`:
```typescript
/**
 * Turso database client singleton.
 */

import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;
let initialized = false;

export async function getClient(): Promise<Client> {
  if (client && initialized) {
    return client;
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL environment variable is not set");
  }

  if (!authToken) {
    throw new Error("TURSO_AUTH_TOKEN environment variable is not set");
  }

  client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys = ON");
  initialized = true;

  return client;
}

export function closeClient(): void {
  if (client) {
    client.close();
    client = null;
    initialized = false;
  }
}

export type { Client } from "@libsql/client";
```

**Step 3: Create migration script**

Create `src/core/db/migrate.ts`:
```typescript
/**
 * Run database migrations.
 */

import "dotenv/config";
import { getClient, closeClient } from "./client";
import { CREATE_TABLES_SQL } from "./schema";

async function migrate() {
  console.log("Running migrations...");
  const client = await getClient();

  // Split by semicolon and execute each statement
  const statements = CREATE_TABLES_SQL
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const sql of statements) {
    await client.execute(sql);
  }

  console.log("Migrations complete.");
  closeClient();
}

migrate().catch(console.error);
```

**Step 4: Add dotenv dependency and migrate script**

Run: `pnpm add dotenv`

Add to package.json scripts:
```json
"db:migrate": "tsx src/core/db/migrate.ts"
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add database schema and client"
```

---

## Task 3: 17lands API Client

**Files:**
- Create: `src/core/seventeen-lands/client.ts`
- Create: `src/core/seventeen-lands/types.ts`
- Test: `src/core/seventeen-lands/client.test.ts`

**Step 1: Create API types**

Create `src/core/seventeen-lands/types.ts`:
```typescript
/**
 * Types for 17lands API responses.
 */

export interface SeventeenLandsDraft {
  id: string;
  expansion: string;
  format: string;
  colors: string;
  wins: number;
  losses: number;
  start_rank: string | null;
  end_rank: string | null;
  first_pick_time: string;
  has_picks: boolean;
}

export interface SeventeenLandsUserData {
  drafts: SeventeenLandsDraft[];
  token: string;
}

export interface SeventeenLandsPick {
  pack_number: number;
  pick_number: number;
  pick: {
    name: string;
    image_url: string;
    types: string[];
    mana_cost: string;
  };
  available: Array<{
    name: string;
    image_url: string;
    types: string[];
    mana_cost: string;
  }>;
}

export interface SeventeenLandsDraftDetail {
  expansion: string;
  num_seats: number;
  picks: SeventeenLandsPick[];
  card_performance_data: Record<string, {
    total_times_seen: number;
    avg_seen_position: number;
    total_times_picked: number;
    avg_pick_position: number;
    game_in_hand_win_rate: number | null;
  }>;
}
```

**Step 2: Create API client**

Create `src/core/seventeen-lands/client.ts`:
```typescript
/**
 * 17lands API client.
 */

import type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
} from "./types";

const BASE_URL = "https://www.17lands.com";

export class SeventeenLandsClient {
  private session: string;

  constructor(session: string) {
    if (!session) {
      throw new Error("17lands session cookie is required");
    }
    this.session = session;
  }

  private async fetch<T>(path: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        cookie: `session=${this.session}`,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`17lands API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  async getUserData(): Promise<SeventeenLandsUserData> {
    return this.fetch<SeventeenLandsUserData>("/data/user");
  }

  async getDraftDetail(draftId: string): Promise<SeventeenLandsDraftDetail> {
    return this.fetch<SeventeenLandsDraftDetail>(`/data/draft?draft_id=${draftId}`);
  }
}

export function createSeventeenLandsClient(): SeventeenLandsClient {
  const session = process.env.SEVENTEEN_LANDS_SESSION;
  if (!session) {
    throw new Error("SEVENTEEN_LANDS_SESSION environment variable is not set");
  }
  return new SeventeenLandsClient(session);
}
```

**Step 3: Create index export**

Create `src/core/seventeen-lands/index.ts`:
```typescript
export { SeventeenLandsClient, createSeventeenLandsClient } from "./client";
export type * from "./types";
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add 17lands API client"
```

---

## Task 4: Sync Script

**Files:**
- Create: `src/sync/index.ts`
- Test: `src/sync/index.test.ts`

**Step 1: Create sync script**

Create `src/sync/index.ts`:
```typescript
/**
 * Sync drafts from 17lands to local database.
 */

import "dotenv/config";
import { getClient, closeClient } from "../core/db/client";
import { createSeventeenLandsClient } from "../core/seventeen-lands";
import type { SeventeenLandsDraftDetail } from "../core/seventeen-lands";

async function sync() {
  const fullSync = process.argv.includes("--full");
  console.log(fullSync ? "Running full sync..." : "Running incremental sync...");

  const db = await getClient();
  const api = createSeventeenLandsClient();

  // Get existing draft IDs
  const existingDrafts = new Set<string>();
  if (!fullSync) {
    const result = await db.execute("SELECT id FROM drafts");
    for (const row of result.rows) {
      existingDrafts.add(row.id as string);
    }
  } else {
    // Clear all data for full sync
    await db.execute("DELETE FROM picks");
    await db.execute("DELETE FROM card_stats");
    await db.execute("DELETE FROM drafts");
  }

  // Fetch user data from 17lands
  const userData = await api.getUserData();
  const draftsToSync = userData.drafts.filter(
    (d) => d.has_picks && !existingDrafts.has(d.id)
  );

  console.log(`Found ${draftsToSync.length} new drafts to sync`);

  const syncedSets: Record<string, number> = {};

  for (const draft of draftsToSync) {
    console.log(`Syncing draft ${draft.id} (${draft.expansion})...`);

    // Fetch draft details
    const detail = await api.getDraftDetail(draft.id);

    // Insert draft
    await db.execute({
      sql: `INSERT INTO drafts (id, set, format, colors, wins, losses, start_rank, end_rank, draft_date, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        draft.id,
        draft.expansion,
        draft.format,
        draft.colors,
        draft.wins,
        draft.losses,
        draft.start_rank,
        draft.end_rank,
        draft.first_pick_time,
        new Date().toISOString(),
      ],
    });

    // Insert picks and cards
    await insertPicksAndCards(db, draft.id, detail);

    // Update card stats
    await updateCardStats(db, draft.expansion, detail);

    syncedSets[draft.expansion] = (syncedSets[draft.expansion] || 0) + 1;

    // Rate limiting - be nice to 17lands
    await new Promise((r) => setTimeout(r, 500));
  }

  const summary = Object.entries(syncedSets)
    .map(([set, count]) => `${set}: ${count}`)
    .join(", ");
  console.log(`Synced ${draftsToSync.length} drafts (${summary || "none"})`);

  closeClient();
}

async function insertPicksAndCards(
  db: Awaited<ReturnType<typeof getClient>>,
  draftId: string,
  detail: SeventeenLandsDraftDetail
) {
  for (const pick of detail.picks) {
    // Upsert the picked card
    await db.execute({
      sql: `INSERT OR REPLACE INTO cards (name, image_url, types, mana_cost, colors)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        pick.pick.name,
        pick.pick.image_url,
        pick.pick.types.join(" "),
        pick.pick.mana_cost,
        extractColors(pick.pick.mana_cost),
      ],
    });

    // Insert pick
    await db.execute({
      sql: `INSERT INTO picks (draft_id, pack_number, pick_number, card_name, available_cards)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        draftId,
        pick.pack_number,
        pick.pick_number,
        pick.pick.name,
        JSON.stringify(pick.available.map((c) => c.name)),
      ],
    });

    // Upsert available cards
    for (const card of pick.available) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO cards (name, image_url, types, mana_cost, colors)
              VALUES (?, ?, ?, ?, ?)`,
        args: [
          card.name,
          card.image_url,
          card.types.join(" "),
          card.mana_cost,
          extractColors(card.mana_cost),
        ],
      });
    }
  }
}

async function updateCardStats(
  db: Awaited<ReturnType<typeof getClient>>,
  set: string,
  detail: SeventeenLandsDraftDetail
) {
  const now = new Date().toISOString();

  for (const [cardName, stats] of Object.entries(detail.card_performance_data)) {
    // Ensure card exists
    await db.execute({
      sql: `INSERT OR IGNORE INTO cards (name) VALUES (?)`,
      args: [cardName],
    });

    await db.execute({
      sql: `INSERT OR REPLACE INTO card_stats
            (card_name, set, avg_seen_at, avg_pick_at, game_in_hand_wr, times_seen, times_picked, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        cardName,
        set,
        stats.avg_seen_position,
        stats.avg_pick_position,
        stats.game_in_hand_win_rate,
        stats.total_times_seen,
        stats.total_times_picked,
        now,
      ],
    });
  }
}

function extractColors(manaCost: string): string {
  const colors = new Set<string>();
  const matches = manaCost.match(/\{([WUBRG])\}/g);
  if (matches) {
    for (const m of matches) {
      colors.add(m[1]);
    }
  }
  return Array.from(colors).sort().join("");
}

sync().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
```

**Step 2: Verify sync runs**

Run: `pnpm sync`
Expected: Outputs "Running incremental sync..." (may fail if no env vars set - that's OK)

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add sync script for 17lands data"
```

---

## Task 5: Database Queries

**Files:**
- Create: `src/core/db/queries.ts`
- Test: `src/core/db/queries.test.ts`

**Step 1: Create query functions**

Create `src/core/db/queries.ts`:
```typescript
/**
 * Database query functions for LLM tools.
 */

import { getClient } from "./client";
import type { Draft, Pick, Card, CardStats } from "./schema";

export interface ListDraftsParams {
  set?: string;
  colors?: string;
  min_wins?: number;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export async function listDrafts(params: ListDraftsParams): Promise<Draft[]> {
  const db = await getClient();
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (params.set) {
    conditions.push("set = ?");
    args.push(params.set);
  }
  if (params.colors) {
    conditions.push("colors LIKE ?");
    args.push(`%${params.colors}%`);
  }
  if (params.min_wins !== undefined) {
    conditions.push("wins >= ?");
    args.push(params.min_wins);
  }
  if (params.date_from) {
    conditions.push("draft_date >= ?");
    args.push(params.date_from);
  }
  if (params.date_to) {
    conditions.push("draft_date <= ?");
    args.push(params.date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit ? `LIMIT ${params.limit}` : "LIMIT 100";

  const result = await db.execute({
    sql: `SELECT * FROM drafts ${where} ORDER BY draft_date DESC ${limit}`,
    args,
  });

  return result.rows as unknown as Draft[];
}

export async function getDraft(draftId: string): Promise<{
  draft: Draft | null;
  picks: Pick[];
}> {
  const db = await getClient();

  const draftResult = await db.execute({
    sql: "SELECT * FROM drafts WHERE id = ?",
    args: [draftId],
  });

  const picksResult = await db.execute({
    sql: "SELECT * FROM picks WHERE draft_id = ? ORDER BY pack_number, pick_number",
    args: [draftId],
  });

  return {
    draft: (draftResult.rows[0] as unknown as Draft) || null,
    picks: picksResult.rows as unknown as Pick[],
  };
}

export interface MyStatsParams {
  set?: string;
  colors?: string;
  date_from?: string;
  date_to?: string;
}

export interface MyStats {
  total_drafts: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  trophies: number;
  color_breakdown: Record<string, { drafts: number; wins: number; losses: number }>;
}

export async function getMyStats(params: MyStatsParams): Promise<MyStats> {
  const db = await getClient();
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (params.set) {
    conditions.push("set = ?");
    args.push(params.set);
  }
  if (params.colors) {
    conditions.push("colors LIKE ?");
    args.push(`%${params.colors}%`);
  }
  if (params.date_from) {
    conditions.push("draft_date >= ?");
    args.push(params.date_from);
  }
  if (params.date_to) {
    conditions.push("draft_date <= ?");
    args.push(params.date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute({
    sql: `SELECT
            COUNT(*) as total_drafts,
            SUM(wins) as total_wins,
            SUM(losses) as total_losses,
            SUM(CASE WHEN wins = 7 THEN 1 ELSE 0 END) as trophies,
            colors
          FROM drafts ${where}
          GROUP BY colors`,
    args,
  });

  let totalDrafts = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let trophies = 0;
  const colorBreakdown: Record<string, { drafts: number; wins: number; losses: number }> = {};

  for (const row of result.rows) {
    const r = row as { total_drafts: number; total_wins: number; total_losses: number; trophies: number; colors: string };
    totalDrafts += r.total_drafts;
    totalWins += r.total_wins;
    totalLosses += r.total_losses;
    trophies += r.trophies;

    if (r.colors) {
      colorBreakdown[r.colors] = {
        drafts: r.total_drafts,
        wins: r.total_wins,
        losses: r.total_losses,
      };
    }
  }

  return {
    total_drafts: totalDrafts,
    total_wins: totalWins,
    total_losses: totalLosses,
    win_rate: totalWins + totalLosses > 0 ? totalWins / (totalWins + totalLosses) : 0,
    trophies,
    color_breakdown: colorBreakdown,
  };
}

export async function getCardStats(
  cardName: string,
  set: string
): Promise<CardStats | null> {
  const db = await getClient();
  const result = await db.execute({
    sql: "SELECT * FROM card_stats WHERE card_name = ? AND set = ?",
    args: [cardName, set],
  });
  return (result.rows[0] as unknown as CardStats) || null;
}

export async function getFormatTopCards(
  set: string,
  limit: number = 20
): Promise<CardStats[]> {
  const db = await getClient();
  const result = await db.execute({
    sql: `SELECT * FROM card_stats
          WHERE set = ? AND game_in_hand_wr IS NOT NULL
          ORDER BY game_in_hand_wr DESC
          LIMIT ?`,
    args: [set, limit],
  });
  return result.rows as unknown as CardStats[];
}

export async function getMyCardHistory(
  cardName: string,
  set?: string
): Promise<{
  times_drafted: number;
  decks_with_wins: number;
  avg_pick: number;
  drafts: Array<{ draft_id: string; pack: number; pick: number; wins: number; losses: number }>;
}> {
  const db = await getClient();
  const setCondition = set ? "AND d.set = ?" : "";
  const args = set ? [cardName, set] : [cardName];

  const result = await db.execute({
    sql: `SELECT p.draft_id, p.pack_number, p.pick_number, d.wins, d.losses
          FROM picks p
          JOIN drafts d ON p.draft_id = d.id
          WHERE p.card_name = ? ${setCondition}
          ORDER BY d.draft_date DESC`,
    args,
  });

  const drafts = result.rows.map((r) => ({
    draft_id: r.draft_id as string,
    pack: r.pack_number as number,
    pick: r.pick_number as number,
    wins: r.wins as number,
    losses: r.losses as number,
  }));

  const avgPick = drafts.length > 0
    ? drafts.reduce((sum, d) => sum + d.pick, 0) / drafts.length
    : 0;

  return {
    times_drafted: drafts.length,
    decks_with_wins: drafts.filter((d) => d.wins >= 5).length,
    avg_pick: avgPick,
    drafts,
  };
}
```

**Step 2: Create index export**

Create `src/core/db/index.ts`:
```typescript
export { getClient, closeClient } from "./client";
export * from "./schema";
export * from "./queries";
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add database query functions"
```

---

## Task 6: LLM Tools

**Files:**
- Create: `src/core/llm/tools.ts`
- Create: `src/core/llm/handlers.ts`
- Create: `src/core/llm/index.ts`

**Step 1: Create tool definitions**

Create `src/core/llm/tools.ts`:
```typescript
/**
 * OpenAI function tool definitions.
 */

import type OpenAI from "openai";

export const tools: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "list_drafts",
    description: "Find drafts by criteria (set, colors, date range, minimum wins)",
    parameters: {
      type: "object",
      properties: {
        set: { type: "string", description: "Filter by set code (e.g., FIN, DSK)" },
        colors: { type: "string", description: "Filter by colors (e.g., UB, WG)" },
        min_wins: { type: "integer", description: "Minimum wins" },
        date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        limit: { type: "integer", description: "Max results (default 100)" },
      },
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_draft",
    description: "Get detailed information about a specific draft including all picks",
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
    name: "get_my_stats",
    description: "Get aggregate statistics across your drafts",
    parameters: {
      type: "object",
      properties: {
        set: { type: "string", description: "Filter by set code" },
        colors: { type: "string", description: "Filter by colors" },
        date_from: { type: "string", description: "Start date" },
        date_to: { type: "string", description: "End date" },
      },
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_my_card_history",
    description: "Get your history with a specific card - how often you drafted it and results",
    parameters: {
      type: "object",
      properties: {
        card_name: { type: "string", description: "Card name" },
        set: { type: "string", description: "Filter by set code" },
      },
      required: ["card_name"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_card_stats",
    description: "Get 17lands statistics for a card in a specific set (GIH WR, ALSA, ATA)",
    parameters: {
      type: "object",
      properties: {
        card_name: { type: "string", description: "Card name" },
        set: { type: "string", description: "Set code" },
      },
      required: ["card_name", "set"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_format_top_cards",
    description: "Get the top performing cards in a format by GIH win rate",
    parameters: {
      type: "object",
      properties: {
        set: { type: "string", description: "Set code" },
        limit: { type: "integer", description: "Number of cards (default 20)" },
      },
      required: ["set"],
    },
    strict: false,
  },
];

export type ToolName =
  | "list_drafts"
  | "get_draft"
  | "get_my_stats"
  | "get_my_card_history"
  | "get_card_stats"
  | "get_format_top_cards";

export function isValidToolName(name: string): name is ToolName {
  return [
    "list_drafts",
    "get_draft",
    "get_my_stats",
    "get_my_card_history",
    "get_card_stats",
    "get_format_top_cards",
  ].includes(name);
}
```

**Step 2: Create tool handlers**

Create `src/core/llm/handlers.ts`:
```typescript
/**
 * Tool execution handlers.
 */

import {
  listDrafts,
  getDraft,
  getMyStats,
  getMyCardHistory,
  getCardStats,
  getFormatTopCards,
} from "../db/queries";
import type { ToolName } from "./tools";

export async function executeToolCall(
  name: ToolName,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "list_drafts":
      return JSON.stringify(await listDrafts(args));

    case "get_draft":
      return JSON.stringify(await getDraft(args.draft_id as string));

    case "get_my_stats":
      return JSON.stringify(await getMyStats(args));

    case "get_my_card_history":
      return JSON.stringify(
        await getMyCardHistory(args.card_name as string, args.set as string | undefined)
      );

    case "get_card_stats":
      return JSON.stringify(
        await getCardStats(args.card_name as string, args.set as string)
      );

    case "get_format_top_cards":
      return JSON.stringify(
        await getFormatTopCards(args.set as string, args.limit as number | undefined)
      );

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

**Step 3: Create LLM client**

Create `src/core/llm/client.ts`:
```typescript
/**
 * OpenAI LLM client with tool support.
 */

import OpenAI from "openai";
import { tools, isValidToolName } from "./tools";
import { executeToolCall } from "./handlers";

const SYSTEM_PROMPT = `You are a helpful MTG draft analytics assistant. You help users analyze their draft history and performance.

When answering questions:
- Use the available tools to fetch data before responding
- Cite your sources: [draft:ID] for specific drafts, [stats:SET] for format statistics
- Be concise but informative
- If the user asks about their performance, include relevant statistics
- Compare their picks/performance to format averages when relevant`;

export interface ChatResult {
  text: string;
  responseId: string;
  model: string;
}

export async function chat(message: string): Promise<ChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const openai = new OpenAI({ apiKey });
  const model = "gpt-4o";

  const response = await openai.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input: message,
    tools,
  });

  // Handle tool calls
  let currentResponse = response;
  while (currentResponse.output.some((o) => o.type === "function_call")) {
    const toolResults: OpenAI.Responses.ResponseInputItem[] = [];

    for (const output of currentResponse.output) {
      if (output.type === "function_call") {
        const name = output.name;
        if (!isValidToolName(name)) {
          toolResults.push({
            type: "function_call_output",
            call_id: output.call_id,
            output: JSON.stringify({ error: `Unknown tool: ${name}` }),
          });
          continue;
        }

        const args = JSON.parse(output.arguments);
        const result = await executeToolCall(name, args);
        toolResults.push({
          type: "function_call_output",
          call_id: output.call_id,
          output: result,
        });
      }
    }

    currentResponse = await openai.responses.create({
      model,
      previous_response_id: currentResponse.id,
      input: toolResults,
      tools,
    });
  }

  const textOutput = currentResponse.output.find((o) => o.type === "message");
  const text = textOutput?.type === "message"
    ? textOutput.content.map((c) => (c.type === "text" ? c.text : "")).join("")
    : "";

  return {
    text,
    responseId: currentResponse.id,
    model,
  };
}
```

**Step 4: Create index export**

Create `src/core/llm/index.ts`:
```typescript
export { chat } from "./client";
export { tools, isValidToolName, type ToolName } from "./tools";
export { executeToolCall } from "./handlers";
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add LLM tools and handlers"
```

---

## Task 7: Chat API Route

**Files:**
- Create: `src/app/api/chat/route.ts`

**Step 1: Create chat API route**

Create `src/app/api/chat/route.ts`:
```typescript
/**
 * Chat API endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/core/llm";

interface ChatRequest {
  message: string;
}

interface ChatResponse {
  text: string;
  responseId: string;
  model: string;
}

interface ErrorResponse {
  error: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ChatResponse | ErrorResponse>> {
  try {
    const body = (await request.json()) as ChatRequest;

    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'message' field" },
        { status: 400 }
      );
    }

    const result = await chat(body.message);

    return NextResponse.json({
      text: result.text,
      responseId: result.responseId,
      model: result.model,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    if (error instanceof Error) {
      if (error.message.includes("OPENAI_API_KEY")) {
        return NextResponse.json(
          { error: "OpenAI API key not configured" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add chat API route"
```

---

## Task 8: Dashboard UI

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/components/Chat.tsx`
- Create: `src/app/components/StatsCards.tsx`
- Create: `src/app/components/DraftTable.tsx`

**Step 1: Create Chat component**

Create `src/app/components/Chat.tsx`:
```tsx
"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Failed to send message" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      <div className="p-4 border-b">
        <h2 className="font-semibold">Ask about your drafts</h2>
      </div>

      <div className="h-64 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm">
            Try: "How am I doing in FIN?" or "What's my best color pair?"
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${
              msg.role === "user" ? "text-right" : "text-left"
            }`}
          >
            <div
              className={`inline-block p-3 rounded-lg max-w-[80%] ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-900"
              }`}
            >
              {msg.role === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm">
                  {msg.content}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-left">
            <div className="inline-block p-3 rounded-lg bg-gray-100">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your draft history..."
            className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
```

**Step 2: Create StatsCards component**

Create `src/app/components/StatsCards.tsx`:
```tsx
import { getMyStats } from "@/core/db/queries";

export async function StatsCards() {
  let stats;
  try {
    stats = await getMyStats({});
  } catch {
    return <div className="text-gray-500">Unable to load stats</div>;
  }

  const winRate = (stats.win_rate * 100).toFixed(1);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="text-2xl font-bold">{stats.total_drafts}</div>
        <div className="text-gray-600 text-sm">Drafts</div>
      </div>
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="text-2xl font-bold">{winRate}%</div>
        <div className="text-gray-600 text-sm">Win Rate</div>
      </div>
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="text-2xl font-bold">{stats.trophies}</div>
        <div className="text-gray-600 text-sm">Trophies</div>
      </div>
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="text-2xl font-bold">
          {stats.total_wins}-{stats.total_losses}
        </div>
        <div className="text-gray-600 text-sm">Record</div>
      </div>
    </div>
  );
}
```

**Step 3: Create DraftTable component**

Create `src/app/components/DraftTable.tsx`:
```tsx
import { listDrafts } from "@/core/db/queries";
import Link from "next/link";

export async function DraftTable() {
  let drafts;
  try {
    drafts = await listDrafts({ limit: 20 });
  } catch {
    return <div className="text-gray-500">Unable to load drafts</div>;
  }

  if (drafts.length === 0) {
    return (
      <div className="text-gray-500 p-4">
        No drafts yet. Run <code>pnpm sync</code> to import from 17lands.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Date</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Set</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Colors</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Record</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Rank</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {drafts.map((draft) => (
            <tr key={draft.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <Link href={`/draft/${draft.id}`} className="text-blue-600 hover:underline">
                  {new Date(draft.draft_date).toLocaleDateString()}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-sm">{draft.set}</td>
              <td className="px-4 py-3 font-mono text-sm">{draft.colors || "-"}</td>
              <td className="px-4 py-3">
                <span className={draft.wins === 7 ? "text-yellow-600 font-bold" : ""}>
                  {draft.wins}-{draft.losses}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {draft.start_rank} → {draft.end_rank}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Step 4: Update main page**

Update `src/app/page.tsx`:
```tsx
import { Chat } from "./components/Chat";
import { StatsCards } from "./components/StatsCards";
import { DraftTable } from "./components/DraftTable";
import { Suspense } from "react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold">Demonic Tutor</h1>

        <Chat />

        <Suspense fallback={<div>Loading stats...</div>}>
          <StatsCards />
        </Suspense>

        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Drafts</h2>
          <Suspense fallback={<div>Loading drafts...</div>}>
            <DraftTable />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add dashboard with chat, stats, and draft table"
```

---

## Task 9: Draft Detail Page

**Files:**
- Create: `src/app/draft/[id]/page.tsx`

**Step 1: Create draft detail page**

Create `src/app/draft/[id]/page.tsx`:
```tsx
import { getDraft, getCardStats } from "@/core/db/queries";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DraftPage({ params }: Props) {
  const { id } = await params;
  const { draft, picks } = await getDraft(id);

  if (!draft) {
    notFound();
  }

  // Group picks by pack
  const packs: Record<number, typeof picks> = {};
  for (const pick of picks) {
    if (!packs[pick.pack_number]) {
      packs[pick.pack_number] = [];
    }
    packs[pick.pack_number].push(pick);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-blue-600 hover:underline">
            ← Back
          </Link>
          <h1 className="text-2xl font-bold">
            {draft.set} Draft - {new Date(draft.draft_date).toLocaleDateString()}
          </h1>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-gray-600 text-sm">Colors</div>
              <div className="text-xl font-mono">{draft.colors || "-"}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">Record</div>
              <div className={`text-xl ${draft.wins === 7 ? "text-yellow-600 font-bold" : ""}`}>
                {draft.wins}-{draft.losses}
              </div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">Start Rank</div>
              <div className="text-xl">{draft.start_rank || "-"}</div>
            </div>
            <div>
              <div className="text-gray-600 text-sm">End Rank</div>
              <div className="text-xl">{draft.end_rank || "-"}</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {[0, 1, 2].map((packNum) => (
            <div key={packNum} className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b bg-gray-50">
                <h2 className="font-semibold">Pack {packNum + 1}</h2>
              </div>
              <div className="divide-y">
                {(packs[packNum] || []).map((pick) => (
                  <div key={pick.pick_number} className="p-4 flex items-center gap-4">
                    <div className="w-8 text-gray-500 text-sm">P{pick.pick_number + 1}</div>
                    <div className="flex-1 font-medium">{pick.card_name}</div>
                    <div className="text-gray-500 text-sm">
                      {JSON.parse(pick.available_cards).length} cards available
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add draft detail page"
```

---

## Task 10: Final Polish

**Files:**
- Create: `src/app/not-found.tsx`
- Create: `README.md`

**Step 1: Create 404 page**

Create `src/app/not-found.tsx`:
```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-gray-600 mb-4">Page not found</p>
        <Link href="/" className="text-blue-600 hover:underline">
          Go home
        </Link>
      </div>
    </main>
  );
}
```

**Step 2: Create README**

Create `README.md`:
```markdown
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
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add 404 page and README"
```

---

Plan complete and saved to `docs/plans/2026-01-23-implementation-plan.md`.

**Ready for Subagent-Driven Development.** I'll dispatch fresh subagents per task with code review between tasks.
