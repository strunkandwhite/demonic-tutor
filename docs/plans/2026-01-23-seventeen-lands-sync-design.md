# 17lands Automated Sync Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically sync draft data from 17lands using Playwright to handle authentication and WAF protection.

**Architecture:** Playwright manages a real browser session. API calls execute via `page.evaluate()` inside the browser's JavaScript context, so cookies/headers/CORS are handled naturally. Session state persists to disk between runs.

**Tech Stack:** Playwright (Chromium), TypeScript, Turso (libsql)

---

## Overview

The 17lands API is protected by AWS WAF which blocks automated requests. Previous attempts using fetch with various headers failed. The solution is to use Playwright to run a real browser, log in with credentials, and make API calls from within the page's JavaScript context.

## Environment Variables

```
SEVENTEEN_LANDS_EMAIL=your@email.com
SEVENTEEN_LANDS_PASSWORD=yourpassword
```

Existing variables (unchanged):
```
SEVENTEEN_LANDS_SESSION  # No longer needed, can be removed
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

## Session Management

Session state (cookies, localStorage) persists to `.seventeen-lands-session.json` (gitignored).

```
┌─────────────────────────────────────────────────────────┐
│ Session Flow                                            │
├─────────────────────────────────────────────────────────┤
│ 1. Launch Chromium (headless)                           │
│ 2. Load saved session if exists                         │
│ 3. Navigate to /account to test auth                    │
│    ├─ Success (200 + not login page) → Ready            │
│    └─ Failure (redirected to login) → Run login flow    │
│                                                         │
│ Login flow:                                             │
│   1. Go to /login                                       │
│   2. Fill email input, password input                   │
│   3. Click submit                                       │
│   4. Wait for navigation to non-login page              │
│   5. Save session state to disk                         │
└─────────────────────────────────────────────────────────┘
```

- First run: logs in, saves session
- Subsequent runs: loads saved session, skips login if still valid
- Session expires: detects auth failure, re-logs in automatically

## API Endpoints

### Get Drafts List
```
GET /user/data?start_date=...&end_date=...
```
Returns all drafts with metadata (wins, losses, colors, ranks).

### Get Draft Details
```
GET /data/draft?draft_id=...
```
Returns picks, available cards, card performance data.

## Incremental Sync

Track last sync date in a `sync_metadata` table:

```sql
CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Date range logic:
- `start_date` = last_sync_date (inclusive) OR "2026-01-06" for first sync
- `end_date` = tomorrow

Starting from last_sync_date inclusive catches same-day drafts. Draft ID deduplication filters out already-synced drafts.

After successful sync, update `last_sync_date` to today.

The `--full` flag resets to 2026-01-06 and re-queries everything.

## Rate Limiting

- 2 second delay between draft detail API calls
- Sync is intentionally slow - runs in background, not meant to be instant

## Error Handling

| Scenario | Action |
|----------|--------|
| Login fails (bad credentials) | Throw immediately with clear message |
| Session expires mid-sync | Detect 401/403 or login redirect, re-login once, retry |
| Rate limited (429) | Wait 30 seconds, retry up to 3 times |
| Network error | Retry up to 3 times with exponential backoff |
| Partial sync failure | Log failures, continue with others, don't update last_sync_date |

## File Structure

```
src/core/seventeen-lands/
  client.ts          # Playwright-based client (rewrite)
  types.ts           # Existing types (keep)
  index.ts           # Existing exports (keep)

src/sync/
  index.ts           # Main sync script (update)

.seventeen-lands-session.json  # Persisted browser session (gitignored)
```

## Testing

1. **Manual smoke test**: Run sync with real credentials, verify data lands in DB
2. **Session persistence test**: Run sync twice, verify second run skips login
3. **Deduplication test**: Run sync twice, verify no duplicate drafts

Add `--dry-run` flag for local dev:
- Logs in and fetches draft list
- Prints what would be synced
- Doesn't write to DB or fetch draft details

## Implementation Tasks

### Task 1: Add sync_metadata table to schema
- Add table definition to `src/core/db/schema.ts`
- Run migration

### Task 2: Rewrite SeventeenLandsClient with Playwright
- Replace fetch-based client with Playwright browser
- Implement session persistence to `.seventeen-lands-session.json`
- Implement login flow with email/password
- Implement `page.evaluate()` based API calls
- Add session validation and auto-re-login

### Task 3: Update sync script for incremental date tracking
- Read last_sync_date from sync_metadata
- Use as start_date (inclusive), default to 2026-01-06
- Update last_sync_date after successful sync
- Support --full flag to reset

### Task 4: Add error handling and retries
- Retry logic for network errors and rate limits
- Session expiry detection and re-login
- Partial failure handling (continue sync, report at end)

### Task 5: Add --dry-run flag
- Fetch and display draft list without syncing
- Useful for verifying auth works

### Task 6: Update .gitignore and environment
- Add `.seventeen-lands-session.json` to .gitignore
- Remove SEVENTEEN_LANDS_SESSION from .env.local
- Add SEVENTEEN_LANDS_EMAIL and SEVENTEEN_LANDS_PASSWORD
