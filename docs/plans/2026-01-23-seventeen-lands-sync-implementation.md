# 17lands Automated Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fetch-based 17lands client with a Playwright-based client that handles login and WAF protection automatically.

**Architecture:** Playwright manages a real browser session with persistent login. API calls execute via `page.evaluate()` inside the browser's JavaScript context. Session state persists to disk between runs.

**Tech Stack:** Playwright, TypeScript, Turso (libsql)

---

## Task 1: Update .gitignore and Environment

**Files:**
- Modify: `/Users/arpanet/code/demonic-tutor/.gitignore`
- Modify: `/Users/arpanet/code/demonic-tutor/.env.local`

**Step 1: Add session file to .gitignore**

Add to `.gitignore`:
```
.seventeen-lands-session.json
```

**Step 2: Update .env.local with new credentials**

Add to `.env.local`:
```
SEVENTEEN_LANDS_EMAIL=<user's email>
SEVENTEEN_LANDS_PASSWORD=<user's password>
```

Note: Keep `SEVENTEEN_LANDS_SESSION` for now as fallback, remove in final cleanup.

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add session file to gitignore"
```

---

## Task 2: Add sync_metadata Table to Schema

**Files:**
- Modify: `/Users/arpanet/code/demonic-tutor/src/core/db/schema.ts`

**Step 1: Add sync_metadata table to CREATE_TABLES_SQL**

In `schema.ts`, add to the `CREATE_TABLES_SQL` string, after the card_stats table:

```sql
CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**Step 2: Add TypeScript interface**

Add after the `CardStats` interface:

```typescript
export interface SyncMetadata {
  key: string;
  value: string;
}
```

**Step 3: Run migration**

Run: `pnpm db:migrate`
Expected: Tables created successfully

**Step 4: Commit**

```bash
git add src/core/db/schema.ts
git commit -m "feat(db): add sync_metadata table for tracking sync state"
```

---

## Task 3: Add Sync Metadata Query Functions

**Files:**
- Modify: `/Users/arpanet/code/demonic-tutor/src/core/db/queries.ts`

**Step 1: Add getSyncMetadata function**

Add at end of file:

```typescript
export async function getSyncMetadata(key: string): Promise<string | null> {
  const db = await getClient();
  const result = await db.execute({
    sql: "SELECT value FROM sync_metadata WHERE key = ?",
    args: [key],
  });
  return (result.rows[0]?.value as string) ?? null;
}
```

**Step 2: Add setSyncMetadata function**

Add after getSyncMetadata:

```typescript
export async function setSyncMetadata(key: string, value: string): Promise<void> {
  const db = await getClient();
  await db.execute({
    sql: "INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)",
    args: [key, value],
  });
}
```

**Step 3: Commit**

```bash
git add src/core/db/queries.ts
git commit -m "feat(db): add sync metadata getter and setter"
```

---

## Task 4: Rewrite SeventeenLandsClient with Playwright

**Files:**
- Rewrite: `/Users/arpanet/code/demonic-tutor/src/core/seventeen-lands/client.ts`

**Step 1: Write the new Playwright-based client**

Replace entire contents of `client.ts`:

```typescript
/**
 * 17lands API client using Playwright for browser-based authentication.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
} from "./types";

const BASE_URL = "https://www.17lands.com";
const SESSION_FILE = ".seventeen-lands-session.json";

export class SeventeenLandsClient {
  private email: string;
  private password: string;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(email: string, password: string) {
    if (!email || !password) {
      throw new Error("17lands email and password are required");
    }
    this.email = email;
    this.password = password;
  }

  private async ensureBrowser(): Promise<Page> {
    if (this.page) return this.page;

    console.log("Launching browser...");
    this.browser = await chromium.launch({ headless: true });

    // Try to load existing session
    if (existsSync(SESSION_FILE)) {
      console.log("Loading saved session...");
      const sessionData = JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
      this.context = await this.browser.newContext({ storageState: sessionData });
    } else {
      this.context = await this.browser.newContext();
    }

    this.page = await this.context.newPage();

    // Check if session is valid
    const isValid = await this.validateSession();
    if (!isValid) {
      console.log("Session invalid or expired, logging in...");
      await this.login();
    } else {
      console.log("Session valid");
    }

    return this.page;
  }

  private async validateSession(): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(`${BASE_URL}/account`, { waitUntil: "networkidle" });
      const url = this.page.url();
      // If we're redirected to login, session is invalid
      return !url.includes("/login");
    } catch {
      return false;
    }
  }

  private async login(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    console.log("Navigating to login page...");
    await this.page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });

    // Fill login form
    console.log("Filling login form...");
    await this.page.fill('input[type="email"], input[name="email"]', this.email);
    await this.page.fill('input[type="password"], input[name="password"]', this.password);

    // Submit form
    await this.page.click('button[type="submit"]');

    // Wait for navigation away from login page
    await this.page.waitForURL((url) => !url.toString().includes("/login"), {
      timeout: 30000,
    });

    console.log("Login successful, saving session...");
    await this.saveSession();
  }

  private async saveSession(): Promise<void> {
    if (!this.context) return;
    const sessionData = await this.context.storageState();
    writeFileSync(SESSION_FILE, JSON.stringify(sessionData, null, 2));
  }

  private async fetchApi<T>(path: string): Promise<T> {
    const page = await this.ensureBrowser();

    // Execute fetch inside the browser context
    const result = await page.evaluate(async (url: string) => {
      const response = await fetch(url, {
        credentials: "include",
        headers: {
          "accept": "application/json, text/plain, */*",
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    }, `${BASE_URL}${path}`);

    return result as T;
  }

  async getUserData(startDate: string, endDate: string): Promise<SeventeenLandsUserData> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return this.fetchApi<SeventeenLandsUserData>(`/user/data?${params}`);
  }

  async getDraftDetail(draftId: string): Promise<SeventeenLandsDraftDetail> {
    const params = new URLSearchParams({ draft_id: draftId });
    return this.fetchApi<SeventeenLandsDraftDetail>(`/data/draft?${params}`);
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export function createSeventeenLandsClient(): SeventeenLandsClient {
  const email = process.env.SEVENTEEN_LANDS_EMAIL;
  const password = process.env.SEVENTEEN_LANDS_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEVENTEEN_LANDS_EMAIL and SEVENTEEN_LANDS_PASSWORD environment variables are required"
    );
  }

  return new SeventeenLandsClient(email, password);
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/core/seventeen-lands/client.ts
git commit -m "feat(17lands): rewrite client with Playwright for WAF bypass"
```

---

## Task 5: Update Sync Script for Incremental Date Tracking

**Files:**
- Modify: `/Users/arpanet/code/demonic-tutor/src/sync/index.ts`

**Step 1: Add imports for sync metadata**

Add to imports at top:

```typescript
import { getSyncMetadata, setSyncMetadata } from "../core/db/queries";
```

**Step 2: Add date calculation helper**

Add after imports:

```typescript
const INITIAL_START_DATE = "2026-01-06";

function getDateRange(lastSyncDate: string | null): { startDate: string; endDate: string } {
  const start = lastSyncDate || INITIAL_START_DATE;

  // End date is tomorrow to catch any timezone edge cases
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const end = tomorrow.toISOString().split("T")[0];

  return {
    startDate: `${start}T00:00:00Z`,
    endDate: `${end}T23:59:59Z`,
  };
}
```

**Step 3: Update sync function to use date tracking**

Replace the sync function body. The new function should:

1. Get last sync date from sync_metadata table
2. Calculate date range (last sync date or 2026-01-06 to tomorrow)
3. Pass date range to getUserData
4. After successful sync, update last_sync_date to today
5. Handle --full flag by not passing last sync date

```typescript
async function sync() {
  const fullSync = process.argv.includes("--full");
  const dryRun = process.argv.includes("--dry-run");

  console.log(fullSync ? "Running full sync..." : "Running incremental sync...");
  if (dryRun) console.log("(dry run - no data will be written)");

  const db = await getClient();
  try {
    const api = createSeventeenLandsClient();

    // Get existing draft IDs for deduplication
    const existingDrafts = new Set<string>();
    if (!fullSync) {
      const result = await db.execute("SELECT id FROM drafts");
      for (const row of result.rows) {
        existingDrafts.add(row.id as string);
      }
    } else {
      // Clear all data for full sync
      if (!dryRun) {
        await db.execute("DELETE FROM picks");
        await db.execute("DELETE FROM card_stats");
        await db.execute("DELETE FROM drafts");
        await setSyncMetadata("last_sync_date", "");
      }
    }

    // Get date range for API query
    const lastSyncDate = fullSync ? null : await getSyncMetadata("last_sync_date");
    const { startDate, endDate } = getDateRange(lastSyncDate);
    console.log(`Querying drafts from ${startDate} to ${endDate}`);

    // Fetch user data from 17lands
    const userData = await api.getUserData(startDate, endDate);
    const draftsToSync = userData.drafts.filter(
      (d) => d.has_picks && !existingDrafts.has(d.id)
    );

    console.log(`Found ${draftsToSync.length} new drafts to sync`);

    if (dryRun) {
      for (const draft of draftsToSync) {
        console.log(`  Would sync: ${draft.id} (${draft.expansion}) - ${draft.wins}-${draft.losses}`);
      }
      await api.close();
      return;
    }

    const syncedSets: Record<string, number> = {};

    for (const draft of draftsToSync) {
      console.log(`Syncing draft ${draft.id} (${draft.expansion})...`);

      // Fetch draft details
      const detail = await api.getDraftDetail(draft.id);

      // Insert draft
      await db.execute({
        sql: `INSERT INTO drafts (id, "set", format, colors, wins, losses, start_rank, end_rank, draft_date, synced_at)
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
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Update last sync date on success
    const today = new Date().toISOString().split("T")[0];
    await setSyncMetadata("last_sync_date", today);

    const summary = Object.entries(syncedSets)
      .map(([set, count]) => `${set}: ${count}`)
      .join(", ");
    console.log(`Synced ${draftsToSync.length} drafts (${summary || "none"})`);

    await api.close();
  } finally {
    closeClient();
  }
}
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm exec tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/sync/index.ts
git commit -m "feat(sync): add incremental date tracking and dry-run mode"
```

---

## Task 6: Add Error Handling and Retry Logic

**Files:**
- Modify: `/Users/arpanet/code/demonic-tutor/src/core/seventeen-lands/client.ts`

**Step 1: Add retry helper function**

Add after imports in client.ts:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
```

**Step 2: Update fetchApi to use retry and handle session expiry**

Replace the fetchApi method:

```typescript
  private async fetchApi<T>(path: string, retryCount: number = 0): Promise<T> {
    const page = await this.ensureBrowser();

    try {
      const result = await page.evaluate(async (url: string) => {
        const response = await fetch(url, {
          credentials: "include",
          headers: {
            "accept": "application/json, text/plain, */*",
          },
        });

        if (response.status === 401 || response.status === 403) {
          throw new Error(`AUTH_ERROR:${response.status}`);
        }

        if (response.status === 429) {
          throw new Error("RATE_LIMITED");
        }

        if (!response.ok) {
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        return response.json();
      }, `${BASE_URL}${path}`);

      return result as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Handle auth errors - try re-login once
      if (message.includes("AUTH_ERROR") && retryCount === 0) {
        console.log("Session expired, re-authenticating...");
        await this.login();
        return this.fetchApi<T>(path, retryCount + 1);
      }

      // Handle rate limiting
      if (message === "RATE_LIMITED") {
        console.log("Rate limited, waiting 30 seconds...");
        await new Promise((r) => setTimeout(r, 30000));
        return this.fetchApi<T>(path, retryCount);
      }

      throw error;
    }
  }
```

**Step 3: Wrap API methods with retry**

Update getUserData and getDraftDetail:

```typescript
  async getUserData(startDate: string, endDate: string): Promise<SeventeenLandsUserData> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
    });
    return withRetry(() => this.fetchApi<SeventeenLandsUserData>(`/user/data?${params}`));
  }

  async getDraftDetail(draftId: string): Promise<SeventeenLandsDraftDetail> {
    const params = new URLSearchParams({ draft_id: draftId });
    return withRetry(() => this.fetchApi<SeventeenLandsDraftDetail>(`/data/draft?${params}`));
  }
```

**Step 4: Commit**

```bash
git add src/core/seventeen-lands/client.ts
git commit -m "feat(17lands): add retry logic and session expiry handling"
```

---

## Task 7: Update CLAUDE.md

**Files:**
- Modify: `/Users/arpanet/code/demonic-tutor/CLAUDE.md`

**Step 1: Update environment variables section**

Replace the Environment Variables section with:

```markdown
## Environment Variables

- `SEVENTEEN_LANDS_EMAIL` - Your 17lands account email
- `SEVENTEEN_LANDS_PASSWORD` - Your 17lands account password
- `TURSO_DATABASE_URL` - Turso database URL
- `TURSO_AUTH_TOKEN` - Turso auth token
- `OPENAI_API_KEY` - OpenAI API key
```

**Step 2: Add sync details section**

Add after the Database Schema section:

```markdown
## Sync System

The sync system uses Playwright to authenticate with 17lands and bypass WAF protection.

- Session persists to `.seventeen-lands-session.json` (gitignored)
- First sync starts from 2026-01-06
- Subsequent syncs query from last sync date (inclusive)
- 2 second delay between API calls to avoid rate limiting
- `--dry-run` flag shows what would sync without writing to DB

**Tables:**
- `sync_metadata` - Key-value store for sync state (last_sync_date)
```

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new sync system details"
```

---

## Task 8: Update README.md

**Files:**
- Modify: `/Users/arpanet/code/demonic-tutor/README.md`

**Step 1: Update Setup section**

Replace the Setup section:

```markdown
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
```

**Step 2: Update Commands section**

Replace the Commands section:

```markdown
## Commands

- `pnpm sync` - Sync new drafts from 17lands
- `pnpm sync --full` - Full re-sync (clears database first)
- `pnpm sync --dry-run` - Show what would sync without writing
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm test` - Run tests
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with new sync setup instructions"
```

---

## Task 9: Test the Sync Flow

**Step 1: Ensure credentials are set**

Verify `.env.local` has:
```
SEVENTEEN_LANDS_EMAIL=<your email>
SEVENTEEN_LANDS_PASSWORD=<your password>
```

**Step 2: Run dry-run to test auth**

Run: `pnpm sync --dry-run`
Expected: Should log in, fetch drafts, and list what would be synced

**Step 3: Run actual sync**

Run: `pnpm sync`
Expected: Should sync drafts and update last_sync_date

**Step 4: Run sync again to verify incremental**

Run: `pnpm sync`
Expected: Should find 0 new drafts (already synced)

**Step 5: Verify data in database**

Run: `turso db shell demonic-tutor "SELECT COUNT(*) FROM drafts"`
Expected: Should show number of synced drafts

---

## Task 10: Clean Up Old Session Cookie Code

**Files:**
- Modify: `/Users/arpanet/code/demonic-tutor/.env.local`

**Step 1: Remove old session cookie**

Remove from `.env.local`:
```
SEVENTEEN_LANDS_SESSION=...
```

**Step 2: Commit all changes**

```bash
git add -A
git commit -m "chore: remove old session cookie from env"
```
