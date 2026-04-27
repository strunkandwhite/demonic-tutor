# Deep Clean Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Run `pnpm check` after each task and commit before moving on.

**Goal:** Address findings from the 2026-04-26 deep-clean audit. Fixes are grouped into independent chunks; tasks within a chunk are ordered by dependency. All tasks deferred to agent recommendations.

**Approach:** Sequential execution inside a Docker sandbox. One commit per task. Run `pnpm check` between tasks.

**Sandbox verification policy:** The sandbox has no Turso network access, no `.seventeen-lands-session.json`, no real `.env`. Tasks that originally would have been verified by `pnpm sync` or `pnpm dev` against prod Turso must be verified by **in-memory libsql integration tests** instead. Each such task lists explicit sandbox-safe verification. Manual host verification (UI checks, real sync runs) is deferred to a post-sandbox host run and explicitly flagged where applicable.

**Out of scope:** Performance refactors that would change DB shape (P2 SELECT \* narrowing — defer until token usage is measured); SetFilter URL handling (A7 — leave intentional); migration ALTER cleanup (CQ leftover).

**Pre-flight checks (do before Task 1):**

- Confirm `API_SECRET` is set in Vercel Production env, Preview env, and any build env (Task 6 will fail closed in production without it).
- Confirm `src/core/db/migrate.ts` exposes (or can be refactored to expose) a reusable `migrate(client)` function that accepts a libsql client. If it currently only runs as a CLI script, Task 23 will need to extract that first.
- Decide site origin env var name (`SITE_ORIGIN`) and ensure it is set in all envs for Task 7.

---

## Chunk 1 — Documentation & dead code (independent, parallel-safe in spirit)

### Task 1: Refresh CLAUDE.md and README

**Files:**

- Modify: `CLAUDE.md`
- Modify: `README.md`

**Changes:**

- CLAUDE.md "LLM Tools Available": replace 6-tool list with all 13 (`list_drafts`, `get_draft`, `get_my_stats`, `get_my_card_history`, `get_card_stats`, `get_format_top_cards`, `get_deck`, `search_decks`, `analyze_deck_choices`, `get_card_info`, `set_user_context`, `get_format_meta`, `get_trophy_decks`).
- CLAUDE.md "Database Schema": add `decklists`, `decklist_cards`, `format_color_stats`, `format_play_draw`.
- CLAUDE.md "Project Structure": add `src/augment/`, `src/instrumentation.ts`, `app/api/draft/[id]/`, `app/api/chat/stream/`, `app/hooks/`.
- CLAUDE.md "Sync System": fix delay claim (1s, not 2s); expand sync steps to match `src/sync/index.ts` reality (drafts → games → linkGamesToDrafts → augment cards → syncDecklists → syncFormatStats).
- CLAUDE.md "Key Commands": add `pnpm check`, `pnpm typecheck`, `pnpm augment-cards`.
- README.md: expand the one-liner into a real overview (chat, draft analytics, format stats, trophy decks). Replace `pnpm exec playwright install chromium` with a documented one-time setup step (or a script `pnpm playwright:install` that wraps it). Do **not** add a `postinstall` script — running Playwright's Chromium download at install time breaks Vercel builds and adds 150MB to every install.
- Add a "Superseded by" header at the top of `docs/plans/2026-01-23-demonic-tutor-design.md` pointing at the later plans.

**Verification:** `pnpm check` (no code change → should be a no-op).

**Commit:** `docs: refresh CLAUDE.md and README to match current codebase`

---

### Task 2: Delete unused structured-output types

**Files:**

- Delete: `src/core/llm/types.ts` if it only contains the unused exports — otherwise edit to remove them.
- Modify: `src/core/llm/index.ts` to drop the re-exports.

**Changes:**

- Remove `MistakeReport`, `DeckAudit`, `KeyPivot`, `DraftIssue`, `NextTimeRule`, `CurveAnalysis`, `SplashRisk`, `SuggestedCut`, `SuggestedAdd`. Verify with grep first that nothing imports them.

**Verification:** `pnpm check` passes.

**Commit:** `chore(llm): remove unused structured-output types`

---

### Task 3: Delete dead non-streaming chat path

**Files:**

- Delete: `src/app/api/chat/route.ts`
- Modify: `src/core/llm/client.ts` — remove the `chat()` function (keep `chatStream`, `AVAILABLE_MODELS`, etc.).
- Modify: `src/core/llm/index.ts` — drop `chat` re-export if present.

**Changes:**

- Run `grep -rn '/api/chat[^/]' src/` and `grep -rn '"chat"\|chat(' src/core/llm/index.ts` and `grep -rn 'from "@/core/llm"' src/` — verify no other callers (including any internal fallback path inside `chatStream`).
- Run `grep -rn '\bchat(' src/ --include='*.ts' --include='*.tsx'` and visually confirm every match is `chatStream(` or unrelated.

**Verification:** `pnpm check` passes.

**Commit:** `refactor(llm): drop dead non-streaming chat endpoint and function`

---

## Chunk 2 — Security fixes

### Task 4: Restore markdown URL sanitization

**Files:**

- Modify: `src/app/components/Chat.tsx` — extract the inline `urlTransform` into a named exported function (e.g. `safeUrlTransform`) so it is unit-testable.
- New: `src/app/components/safeUrlTransform.ts` (or co-located `urlTransform.ts`) holding the function.
- New: `src/app/components/safeUrlTransform.test.ts`

**Changes:**

- New behavior:
  - Return URL unchanged when it starts with `card:`.
  - Allow `http://`, `https://`, `mailto:` (return unchanged).
  - For everything else (including `javascript:`, `data:`, `vbscript:`, `file:`, etc.), return empty string.
- Use react-markdown's default behavior as the reference: it sanitizes by allowlist; we mirror that plus the `card:` exception.

**Verification:** Vitest unit tests assert: `https://example.com` passes through; `card:Lightning Bolt` passes through; `javascript:alert(1)` returns `""`; `data:text/html,...` returns `""`; `mailto:foo@bar` passes. `pnpm check`.

**Commit:** `fix(security): restore markdown URL sanitization, allow only safe schemes`

---

### Task 5 (REMOVED — superseded by Task 10)

Originally: "Apply auth + rate limit to /api/draft/[id]". That route is deleted in Task 10 (the SSR migration removes the API endpoint entirely), so hardening it first is wasted work. Keep the task numbering stable so downstream references don't shift; this slot is intentionally empty.

---

### Task 6: Fail closed on missing API_SECRET in production

**Files:**

- Modify: `src/instrumentation.ts`

**Changes:**

- If `process.env.VERCEL_ENV === "production"` and `API_SECRET` is unset, `throw new Error(...)` rather than `console.warn`. Dev/test/preview continues to warn.
- **Important:** Gate on `VERCEL_ENV` (set to `"production"` only on the production deployment) instead of `NODE_ENV` — `NODE_ENV` is `"production"` during `next build`, which would fail every Vercel build that happens before env propagation.
- For non-Vercel deploys, fall back to `NODE_ENV === "production"`.

**Verification:** Vitest test: import the check, set `VERCEL_ENV=production` and `API_SECRET=""`, assert it throws. `pnpm check`. Pre-flight check (above the plan) confirms `API_SECRET` is set in Vercel Production env.

**Commit:** `fix(security): fail closed when API_SECRET missing in production`

---

### Task 7: Add origin check to chat POST endpoints

**Files:**

- Modify: `src/app/api/chat/stream/route.ts`
- New: `src/app/api/origin-check.ts`

**Changes:**

- Add a helper `assertSameOrigin(request: Request)` that:
  - Reads the `Origin` header.
  - Compares against `process.env.SITE_ORIGIN` (a hard-coded env var; do not derive from `request.url` since that always matches by construction).
  - Returns `null` on match; returns a 403 `Response` on mismatch.
  - In production: missing `Origin` header → reject 403.
  - In dev (`NODE_ENV !== "production"`): missing `Origin` → allow (Postman/curl during dev).
- Call from each guarded POST handler before processing.

**Verification:** Vitest unit test on `assertSameOrigin` covering: matching origin → null; mismatched origin → 403; missing origin in prod → 403; missing origin in dev → null. `pnpm check`. Pre-flight: `SITE_ORIGIN` is set in all envs.

**Commit:** `fix(security): require same-origin POST on chat endpoints`

---

## Chunk 3 — Tool-name single source of truth

### Task 8: Derive ToolName, isValidToolName, TOOL_LABELS from `tools` array

**Files:**

- Modify: `src/core/llm/tools.ts`
- Modify: `src/app/components/ToolCallIndicator.tsx`

**Why this is non-trivial:** The current `tools` declaration is `export const tools: OpenAI.Responses.Tool[] = [...]`. The explicit annotation widens literal types to `string`, so adding `as const` to the array body alone produces no narrower type — `(typeof tools)[number]["name"]` would still resolve to `string`.

**Approach:**

- Replace the explicit annotation with `satisfies`. New shape:

  ```ts
  export const tools = [
    { type: "function", name: "list_drafts", ... },
    ...
  ] as const satisfies readonly OpenAI.Responses.Tool[];

  export type ToolName = (typeof tools)[number]["name"];

  export function isValidToolName(name: string): name is ToolName {
    return tools.some((t) => t.name === name);
  }
  ```

- Add a co-located `TOOL_LABELS: Record<ToolName, string>` map in `tools.ts` (TS exhaustiveness will force every tool to have a label).
- `ToolCallIndicator.tsx` imports `TOOL_LABELS` instead of redeclaring it.
- Verify `executeToolCall`'s `switch` still typechecks — if it relied on the union, no change needed; if it relied on a string-typed `name`, no change needed either.

**Verification:** Vitest parity test (`src/core/llm/tools.test.ts` addition) asserting every `tools[i].name` returns true from `isValidToolName`. `pnpm check`.

**Commit:** `refactor(llm): derive ToolName and labels from tools array`

---

## Chunk 4 — Schema cleanup at the validator seam

### Task 8.5: Rename Pick → DraftPick

**Files:**

- Modify: `src/core/db/schema.ts` and all importers (find via `grep -rn "import .*\bPick\b" src/`).

**Why moved here from Chunk 10:** Subsequent tasks (Task 9 changes the type, Tasks 22-25 write tests against it). Renaming first means every later commit references the canonical name, and we don't need to revisit those files in a final cleanup pass.

**Changes:**

- Rename type to remove TS utility-name collision (`Pick` is the built-in TS utility).
- Use IDE rename or a single `sed`/`grep` pass; verify `pnpm typecheck` is clean.

**Verification:** `pnpm check`.

**Commit:** `refactor(db): rename Pick type to DraftPick`

---

### Task 9: Parse `DraftPick.available_cards` in mapPick

**Files:**

- Modify: `src/core/db/schema.ts` — change `DraftPick.available_cards: string` to `string[]`.
- Modify: `src/core/db/validators.ts` — `mapPick` calls `JSON.parse` once and returns `string[]`.
- Modify: all consumers — remove `parseAvailableCards` calls in `src/core/db/utils.ts`, `src/app/components/DraftDetail.tsx`, `src/app/draft/[id]/page.tsx`, etc.
- The LLM `get_draft` tool now hands the model parsed arrays (DF1).

**Scope clarification (read-side only):** The DB column stays TEXT and `src/sync/index.ts:427` still writes `JSON.stringify(...)`. **Do not** change the INSERT path. Only the read path through `mapPick` is parsed once.

**Verification:** `pnpm check`. Tests added in Task 24 will exercise this.

**Commit:** `refactor(db): parse available_cards in validator instead of consumers`

---

## Chunk 5 — Collapse duplicate draft-detail rendering

### Task 10: Migrate homepage detail view to /draft/[id] server route

**Files:**

- Modify: `src/app/page.tsx` — when `?draft=X` is present, redirect (or render via the route segment); when not, render the table.
  - Preferred: change `DraftTable.selectDraft` to push `/draft/<id>` instead of `/?draft=<id>`. Update home page to no longer special-case `?draft`.
- Modify: `src/app/draft/[id]/page.tsx` — ensure it has the breadcrumb / back-link the modal had.
- Delete: `src/app/components/DraftDetail.tsx`
- Delete: `src/app/api/draft/[id]/route.ts` (no longer needed once SSR route handles it directly)

**Changes:**

- Remove the wasted `listDrafts({ set, limit:20 })` call from the detail branch (P6).
- Extract a reusable `DraftDetailBody` component (or a `groupPicksByPack` helper if shared logic) so the route page is small.

**Sandbox-safe verification:** `pnpm check` (typecheck catches broken imports; tests catch behavior changes if Tasks 22-25 are run before this — but Task 10 is in Chunk 5 and tests are in Chunk 9, so we rely on typecheck + grep for callers of `/api/draft/[id]` and `DraftDetail` returning empty).

**Manual host verification (deferred, post-sandbox):** `pnpm dev`, navigate `/`, click a draft row → should land on `/draft/<id>` with no spinner.

**Commit:** `refactor(ui): consolidate draft detail to single SSR route`

---

## Chunk 5b — Test harness (prerequisite for sync batching tests)

### Task 10.5: In-memory libsql test harness

**Files:**

- Possibly modify: `src/core/db/migrate.ts` — extract a reusable `migrate(client)` function if not already shaped that way (CLI script `if (require.main === module)` wrapper around it is fine).
- New: `src/test/db.ts` — exports `createTestDb()` that creates `:memory:` libsql client, runs `migrate(client)`, and returns it.
- New: `src/test/db.test.ts` — sanity-check the harness creates all expected tables.

**Why this lives here:** Tasks 12, 13, 14, 16, 17 all need an in-memory libsql with the schema migrated. Centralizing the harness here avoids each task reimplementing it and makes the verification surface uniform.

**Verification:** `pnpm check`. Sanity test asserts `drafts`, `picks`, `cards`, `card_stats`, `games`, `decklists`, `decklist_cards`, `format_color_stats`, `format_play_draw`, `sync_metadata` tables all exist after `createTestDb()`.

**Commit:** `test: add in-memory libsql test harness`

---

## Chunk 6 — Sync layer consolidation & batching

### Task 11: Extract wasUpdatedThisWeek helper

**Files:**

- Modify: `src/sync/format-stats.ts`

**Changes:**

- One helper:

  ```ts
  function wasUpdatedThisWeek(
    db: Client,
    table: "format_color_stats" | "format_play_draw" | "card_stats",
    set?: string
  ): Promise<boolean>;
  ```

  SQL form: `SELECT MAX(updated_at) AS last FROM <table>` plus, when `set` is provided, `WHERE "set" = ?`. Compare `last` against `now - 7 days`. Use a literal allowlist for the table name to avoid SQL-injection footguns; do not interpolate user input.

- Replace the three call sites with the helper.

**Verification:** `pnpm check`.

**Commit:** `refactor(sync): collapse wasUpdatedThisWeek helpers into one`

---

### Task 12: Consolidate decklist insertion + batch the insert

**Files:**

- Modify: `src/sync/decklists.ts` — export a single `upsertDecklist(db, draftId, set, deck, source)` that batches the `cards` upserts and `decklist_cards` inserts via `db.batch`.
- Modify: `src/sync/format-stats.ts` — replace `insertTrophyDecklist` with a call to `upsertDecklist(..., "trophy")`.
- Move the duplicated `countCards` to `src/core/db/utils.ts` (or `sync/utils.ts`).
- New: `src/sync/decklists.test.ts` (sandbox-safe integration test).

**Sandbox-safe verification:**

- New integration test using `createClient({ url: ":memory:" })`, run the project schema (via the reusable `migrate(client)` from pre-flight), call `upsertDecklist` with a fixture deck, then assert:
  - One row in `decklists` with the expected `(draft_id, "set", source)`.
  - `decklist_cards` rows match `countCards(deck)` summed totals (per card_id, count).
  - Calling `upsertDecklist` again with `source="trophy"` is a no-op when the row already exists; with `source="user"` it overwrites if that was the prior behavior (match existing semantics — preserve).
  - All inserts complete in a single `batch` call (assert by spying on `db.batch` or by counting `db.execute` calls).
- `pnpm check`.

**Manual host verification (deferred):** `pnpm sync` against real Turso, confirm row counts in `decklists` / `decklist_cards` match a baseline run.

**Commit:** `refactor(sync): consolidate decklist insertion and batch DB writes`

---

### Task 13: Batch play/draw and color_ratings upserts

**Files:**

- Modify: `src/sync/format-stats.ts` (lines ~213-231, ~263-285).
- New: `src/sync/format-stats.test.ts` (sandbox-safe integration test, additive — extended further by Task 25).

**Changes:**

- Replace per-row `await db.execute(...)` with multi-row `INSERT ... VALUES (?,?,...),(?,?,...)` ON CONFLICT, matching the `card_stats` block pattern in the same file.
- Extract the per-section upsert into a helper if it makes the test cleaner.

**Sandbox-safe verification:**

- In-memory libsql test seeds an empty `format_play_draw` and `format_color_stats`, calls the upsert with a fixture row set, asserts row counts and column values.
- Run the upsert twice with the same fixture: assert no duplicate rows (ON CONFLICT works) and that updated values reflect the second call.
- `pnpm check`.

**Manual host verification (deferred):** `pnpm sync` against real Turso.

**Commit:** `perf(sync): batch play/draw and color stats upserts`

---

### Task 14: Batch linkGamesToDrafts via exact id lookup

**Files:**

- Modify: `src/sync/index.ts:170-198`
- New: integration test in `src/sync/index.test.ts` (extend existing file).

**Changes:**

- Build the exact id (`${gameId}_${gameNumber}`) instead of `LIKE`, collect updates into a buffer, issue one `db.batch` per draft (or per N updates).
- Refactor enough to make the linker function pure-ish (accepts `db` + a 17lands-shaped match-result fixture instead of doing its own HTTP fetch). The HTTP step stays separate and the test only exercises the DB-update logic.

**Sandbox-safe verification:**

- In-memory libsql test seeds `games` rows with composite ids (`${gameId}_0`, `${gameId}_1`, etc.) and `draft_id = NULL`. Calls the refactored linker with a fixture mapping. Asserts:
  - Each game row's `draft_id` and `game_number` are set correctly.
  - Games not in the fixture stay NULL (no overreach).
  - The new code produces the same row state as a reference per-row UPDATE loop run on a parallel fixture (regression baseline).
- `pnpm check`.

**Manual host verification (deferred):** `pnpm sync` against real Turso; spot-check a recent draft.

**Commit:** `perf(sync): batch game→draft linking with exact id lookups`

---

### Task 15: Split syncFormatStats into focused functions

**Files:**

- Modify: `src/sync/format-stats.ts`

**Changes:**

- Split the 220-line block into `syncPlayDraw(db, dryRun)`, `syncColorStats(db, set, dryRun)`, `syncCardStats(db, set, dryRun)`, `syncTrophyDecks(db, set, dryRun)`. The top-level `syncFormatStats` becomes a small orchestrator that loops over `userSets` and calls these.

**Verification:** `pnpm check`. Sync still works end-to-end.

**Commit:** `refactor(sync): split syncFormatStats into focused functions`

---

## Chunk 7 — Other consolidation

### Task 16: Consolidate fetchApi + fetchApiPost

**Files:**

- Modify: `src/core/seventeen-lands/client.ts:178-326`
- New: `src/core/seventeen-lands/client.test.ts` (sandbox-safe).

**Changes:**

- Replace both with a single `fetchApi(path, opts: { method: "GET" | "POST"; body?: unknown })`. Update callers.

**Sandbox-safe verification:**

- Unit test that injects a fake page (`page.evaluate` mock) and asserts that:
  - `fetchApi(path, {method:"GET"})` produces the same evaluate-call shape as the prior `fetchApi`.
  - `fetchApi(path, {method:"POST", body})` produces the same evaluate-call shape as the prior `fetchApiPost`.
  - 401/403 path triggers exactly one auth re-attempt; 429 triggers backoff retry.
- `pnpm check`.

**Manual host verification (deferred):** `pnpm sync` against real Turso.

**Commit:** `refactor(seventeen-lands): unify GET/POST fetch path`

---

### Task 17: getDraftWithCardData JOIN consolidation

**Files:**

- Modify: `src/core/db/queries.ts:154-163`
- New: query test in `src/core/db/queries.test.ts` (extend the file added in Task 23).

**Changes:**

- Replace separate `cards` + `card_stats` queries with one `LEFT JOIN cards LEFT JOIN card_stats` keyed on `(name, set)`.

**Sandbox-safe verification:**

- In-memory libsql test seeds `cards` (with image_url and oracle_text) and `card_stats` (with gih_wr) for a small set, then calls `getDraftWithCardData`. Assert the returned `cardData` map contains the expected fields per card and that cards present in `cards` but missing from `card_stats` still appear (LEFT JOIN preserves them).
- Regression: same fixture, run the OLD two-query path captured in a fixture file, diff against new output.
- `pnpm check`.

**Manual host verification (deferred):** Open `/draft/<id>` against real Turso, confirm card data renders identically.

**Commit:** `perf(db): join cards and card_stats in one query`

---

## Chunk 8 — UI quality

### Task 18: Use cards.image_url in CardLink hover

**Files:**

- Replace: `src/app/hooks/useCardImage.ts` → `src/app/lib/cardImageUrl.ts` (plain function, not a hook).
- Modify: `src/app/components/CardLink.tsx` and other callers.
- New: `src/app/lib/cardImageUrl.test.ts`

**Changes:**

- New signature: `cardImageUrl(card: { name: string; image_url?: string | null }): string` — returns `card.image_url` when set, else the existing Scryfall `cards/named` API URL with `encodeURIComponent(name)`.
- Drop the `use*` prefix and remove the file from `hooks/`.

**Sandbox-safe verification:**

- Unit test asserts: card with `image_url` returns it unchanged; card without `image_url` returns the Scryfall API URL with the name properly encoded; special characters (`'`, `,`, `/`) survive `encodeURIComponent`.
- `pnpm check`.

**Manual host verification (deferred):** Hover a card link → browser network tab shows a single CDN request, not Scryfall API.

**Commit:** `perf(ui): use cached image URL for card hover previews`

---

### Task 19: Memoize draft-detail derived data

**Files:**

- Modify: the `DraftDetailBody` component (extracted in Task 10)

**Changes:**

- `useMemo` the `packs` grouping keyed on `picks`.
- Wrap `PickRow` in `React.memo` so sibling re-renders don't fan out.

**Verification:** `pnpm check`. React DevTools profiler: expanding one pick no longer re-renders siblings.

**Commit:** `perf(ui): memoize per-pack grouping and PickRow`

---

### Task 20: Validate replay_link path & centralize URL build

**Files:**

- Modify: `src/app/draft/[id]/page.tsx:116` and any remaining consumer

**Changes:**

- Add a `replayUrl(game)` helper that asserts `replay_link.startsWith("/")` before concatenating with `https://www.17lands.com`.

**Verification:** `pnpm check`.

**Commit:** `fix(ui): validate replay link path before rendering`

---

### Task 21: crypto.randomUUID for message ids

**Files:**

- Modify: `src/app/components/Chat.tsx`
- Run `grep -rn "Date.now()" src/app/` first and audit every match: any other `Date.now()`-based id generation in the UI gets the same treatment in this commit.

**Changes:**

- Replace `messageIdCounter`/`Date.now()` with `crypto.randomUUID()`.

**Verification:** `pnpm check`.

**Commit:** `refactor(chat): use randomUUID for message ids`

---

## Chunk 9 — Test coverage

### Task 22: Tests for executeToolCall (all 13 branches)

**Files:**

- New: `src/core/llm/handlers.test.ts`

**Changes:**

- Mock `core/db/queries` exports and the cache. For each tool name, assert the handler routes to the right query function with the expected args.
- Include a test that `set_user_context` bypasses the cache (T5).
- Include a parity test asserting every `tools[].name` matches a switch case (T1).

**Verification:** `pnpm test`. New tests pass.

**Commit:** `test(llm): cover executeToolCall dispatch for all tools`

---

### Task 23: Tests for core/db/queries.ts

**Files:**

- New: `src/core/db/queries.test.ts`

**Changes:**

- Use `createTestDb()` from Task 10.5. Seed fixture rows. Test the WHERE-clause assembly of `listDrafts`, `getMyStats` aggregations, `searchDecks`, `analyzeDeckChoices`, `getMyCardHistory`. Focus on dynamic/conditional branches.

**Verification:** `pnpm test`.

**Commit:** `test(db): cover query layer with in-memory libsql`

---

### Task 24: Tests for validators

**Files:**

- New: `src/core/db/validators.test.ts`

**Changes:**

- Cover `mapDraft`, `mapPick` (including the new `available_cards` parse from Task 9), `mapCardStats`, etc. Use sample raw rows.

**Verification:** `pnpm test`.

**Commit:** `test(db): cover row-mapper validators`

---

### Task 25: Tests for sync helpers

**Files:**

- Modify: `src/sync/index.test.ts` — add tests for `extractColors`.
- New: `src/sync/format-stats.test.ts` — export `selectDiverseTrophyDecks` and `extractMainColors` and test them.

**Verification:** `pnpm test`.

**Commit:** `test(sync): cover color and trophy-deck helpers`

---

## Chunk 10 — Small cleanups

### Task 26: Remove dead exports

**Files:**

- Modify: `src/app/hooks/useChatStream.ts` — drop `abort` from return.
- Modify: `src/app/api/rate-limit.ts` — drop `RateLimitResult.remaining` or wire to `X-RateLimit-Remaining` header.
- Modify: `src/core/llm/cache.ts` — drop `has`, `clear`, `size`.
- Modify: `src/sync/index.ts:194,300` — remove stale comments.

**Verification:** `pnpm check`.

**Commit:** `chore: remove unused exports surfaced by deep clean`

---

### Task 27 (REMOVED — moved to Task 8.5)

This rename now happens before the validator + test work so all later commits use the canonical name. Slot intentionally empty to keep numbering stable.

---

### Task 28: Sync entrypoints use argv guard

**Files:**

- Modify: `src/sync/index.ts:449` — wrap the auto-`sync()` call in the same `process.argv[1]?.includes(...)` pattern used by `decklists.ts` and `augment/index.ts`.

**Caveat:** Verify the existing `src/sync/index.test.ts` does not currently trigger an unintended sync run (it doesn't today because `sync()` is fired without await and test imports won't satisfy the argv check). After Task 14 adds new imports from `index.ts`, this guard becomes load-bearing — confirm tests still pass with no Turso reachability.

**Verification:** `pnpm check`. Importing `parseGameLink` (or any other named export) in a test file does NOT trigger sync side effects.

**Commit:** `refactor(sync): make index.ts safe to import`

---

### Task 29: closeClient warn on error

**Files:**

- Modify: `src/core/db/client.ts:34`

**Changes:**

- Replace empty `.catch(() => {})` with `.catch((err) => console.warn("[db] closeClient failed:", err))`.

**Verification:** `pnpm check`.

**Commit:** `chore(db): warn on close failures`

---

## Final step

After all tasks pass `pnpm check`, write a **resolution report** (changelog of what landed) to `docs/audits/2026-04-26-deep-clean-resolution.md` and commit. This is distinct from the audit findings — it captures what was done, what was deferred, and any remaining manual host verification needed.

## Deferred (out of plan, tracked here)

Items the audit raised that we are explicitly not doing in this plan:

- **P2 — narrow `SELECT *` in LLM tools to reduce token usage.** Defer until token usage is measured; premature otherwise.
- **A7 — `SetFilter` URL handling inconsistency.** Leave as-is (intentional).
- **CardLink hover image cache.** The Task 18 change avoids the Scryfall 302 round-trip, but does not memoize across hovers; browser cache will cover most cases. Revisit if hover latency is reported.
- **Task 5** (auth/rate-limit on `/api/draft/[id]`) — superseded by Task 10 deletion.
- **Task 27** (Pick rename) — done early as Task 8.5.

Track these in `todo.md` so they don't get lost.
