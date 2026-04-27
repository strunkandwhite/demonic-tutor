# Deep Clean Fixes — Resolution Report

**Plan:** [docs/plans/2026-04-26-deep-clean-fixes.md](../plans/2026-04-26-deep-clean-fixes.md)
**Branch:** `deep-clean-fixes`
**Commits:** 29 (one per task, plus the reordered Task 28 pre-flight)
**Tests:** 169 passing across 14 files (was 50 across 3 before this work).

## Executed in this branch

### Pre-flight

- **Task 28 reordered to first.** The plan put the argv guard at the end,
  but `pnpm check` was already broken on a clean checkout: importing
  `src/sync/index.ts` from `src/sync/index.test.ts` fired the top-level
  `sync()` and crashed on missing `TURSO_DATABASE_URL`. Without this fix
  no later task had a working verification gate. Done as commit `1373e91`.

### Chunk 1 — Documentation & dead code

- **Task 1** — Refresh `CLAUDE.md` and `README.md` to match current
  codebase: 13 LLM tools, all schema tables (`decklists`, `decklist_cards`,
  `format_color_stats`, `format_play_draw`, `sync_metadata`), expanded
  project structure, correct sync-step list and 1s delay, additional env
  vars (`API_SECRET`, `SITE_ORIGIN`), `pnpm check` / `pnpm playwright:install`
  commands. Added "Superseded by" header to the older
  `2026-01-23-demonic-tutor-design.md` plan.
- **Task 2** — Deleted `src/core/llm/types.ts` (`MistakeReport`,
  `DeckAudit`, etc. — never used).
- **Task 3** — Deleted `src/app/api/chat/route.ts` and `chat()` /
  `ChatResult` from `src/core/llm/client.ts`. Only the streaming path
  is live.

### Chunk 2 — Security

- **Task 4** — Restored markdown URL sanitization. New
  `src/app/components/safeUrlTransform.ts` allowlists `card:`, `http(s):`,
  `mailto:`, plus root-relative and fragment refs; everything else
  (`javascript:`, `data:`, `vbscript:`, `file:`) returns `""`. 10 unit
  tests cover the matrix.
- **Task 6** — `instrumentation.ts` now throws when `API_SECRET` is unset
  in production. Production gate is `VERCEL_ENV === "production"` on
  Vercel, falling back to `NODE_ENV === "production"` off-Vercel.
  Extracted `checkApiSecret(env)` for testing; 6 unit tests.
- **Task 7** — Same-origin POST check on `/api/chat/stream`. New
  `src/app/api/origin-check.ts::assertSameOrigin(request, env?)` compares
  `Origin` against `process.env.SITE_ORIGIN` (deliberately not derived
  from `request.url`). Production rejects missing/mismatched Origin;
  dev tolerates missing for curl/Postman. 6 unit tests.

### Chunk 3 — Tool-name SoT

- **Task 8** — `tools` is now `as const satisfies readonly OpenAI.Responses.Tool[]`.
  `ToolName` derives from `(typeof tools)[number]["name"]`; `isValidToolName`
  uses `tools.some(...)`. Added `TOOL_LABELS: Record<ToolName, string>` so
  TS exhaustiveness forces every tool to have a UI label. `ToolCallIndicator`
  imports the labels via a `labelFor()` helper. Spread `[...tools]` at
  the OpenAI call sites since the readonly array is not assignable to
  the SDK's mutable `Tool[]`. Added a parity test: every `tools[i].name`
  passes `isValidToolName`.

### Chunk 4 — Schema / validator seam

- **Task 8.5** — Renamed `Pick` → `DraftPick` (the original collided
  with TS's built-in `Pick<>` utility).
- **Task 9** — `mapPick` parses `available_cards` JSON once and returns
  `string[]`. Read path only — `src/sync/index.ts` still writes
  `JSON.stringify(...)` on insert. Removed `parseAvailableCards` calls
  from the SSR draft page and (transitively) from the soon-to-be-deleted
  `DraftDetail.tsx`. `src/core/db/utils.ts` recreated in Task 12 for
  `countCards`.

### Chunk 5 — Detail-view consolidation

- **Task 10** — Single SSR route. `DraftTable.selectDraft` pushes
  `/draft/<id>`; the homepage no longer special-cases `?draft`.
  Deleted `src/app/components/DraftDetail.tsx` and `src/app/api/draft/[id]/route.ts`
  (and the now-empty `/api/draft` directory). Extracted
  `DraftDetailBody` (client component) so Task 19 could memoize.

### Chunk 5b — Test harness

- **Task 10.5** — `src/core/db/migrate.ts` now exposes a reusable
  `migrate(client)` function; the CLI is wrapped in a `runCli()` guarded
  by an `argv` check. New `src/test/db.ts::createTestDb()` opens a
  `:memory:` libsql client, applies the schema, and returns it. Created
  `vitest.config.ts` with a `@/` alias so test imports of `@/core/...`
  resolve.

### Chunk 6 — Sync layer

- **Task 11** — Three near-identical `wasXxxUpdatedThisWeek` helpers
  collapsed into one `wasUpdatedThisWeek(db, table, set?)`. Table name
  is an allowlist literal (TS union + runtime check) to keep SQL
  injection out of the call.
- **Task 12** — Single `upsertDecklist(db, draftId, set, deck, source)`
  exported from `src/sync/decklists.ts`. Writes the decklists row,
  deduped card upserts, and decklist_cards rows in a single `db.batch`
  transaction. `source="trophy"` is idempotent (skip-if-exists);
  `source="user"` writes unconditionally per existing semantics.
  `format-stats.ts` calls `upsertDecklist(..., "trophy")` instead of the
  old `insertTrophyDecklist`. `countCards` moved to
  `src/core/db/utils.ts`. New integration test verifies trophy
  semantics, idempotency, and single-batch behavior.
- **Task 13** — `upsertPlayDrawBatch` and `upsertColorRatingsBatch`:
  per-row `await db.execute(...)` loops replaced with multi-row
  `INSERT ... VALUES (?,?,...),(?,?,...) ON CONFLICT`. Both no-op on
  empty input. 6 integration tests.
- **Task 14** — `linkGamesToDrafts` rebuilt around exact-id lookups.
  `WHERE id LIKE '<gameId>%'` was over-matching (e.g. `abc_1` could
  match `abc_10`); the new path queries unlinked games' full ids alongside
  the gameId prefix and updates with `WHERE id = ?`. Updates buffer into
  one `db.batch`. Extracted `applyGameDraftLinks(db, updates[])` as a pure
  function so tests can drive it without mocking the 17lands client.
  4 integration tests including the LIKE-collision regression.
- **Task 15** — `syncFormatStats` (≈220 lines) split into
  `syncPlayDraw`, `syncColorStats`, `syncCardStats`, `syncTrophyDecks`
  taking a shared `SyncContext`. The orchestrator is a small loop;
  per-set `try/catch` boundary preserved so one failing set doesn't
  poison others. `extractMainColors` and `selectDiverseTrophyDecks`
  are now exported (Task 25 tests them).

### Chunk 7 — Other consolidation

- **Task 16** — `fetchApi` and `fetchApiPost` collapsed into one
  `fetchApi(path, opts?, retryCount?)` taking `{ method, body }`. Auth
  re-login (401/403) and rate-limit backoff (429) paths are now shared
  for both methods. The single POST call site (`getTrophyDecks`) passes
  `{ method: "POST", body }`. Skipped the proposed page-mock test as
  noted in the commit.
- **Task 17** — `getDraftWithCardData` now joins `cards` and `card_stats`
  in one `LEFT JOIN` keyed on `(card_name, set)`. LEFT JOIN preserves
  cards present in `cards` but missing from `card_stats`. Created
  `queries.test.ts` with 4 tests including a regression for cross-set
  bleed (a same-named card in a different set must not bleed in).

### Chunk 8 — UI quality

- **Task 18** — `useCardImage` (a no-op-as-hook) replaced with
  `src/app/lib/cardImageUrl.ts::cardImageUrl(card)`. Prefers
  `card.image_url` when set; falls back to the Scryfall API URL with
  numeric-suffix-stripped, encoded names. 5 unit tests.
- **Task 19** — `DraftDetailBody` `useMemo`s the per-pack grouping;
  `PickRow` exported as `memo(PickRowImpl)`. Sibling rows no longer
  re-render when one row toggles its expanded state.
- **Task 20** — `replayUrl(game)` helper validates that `replay_link`
  starts with `/` (and rejects `//`-prefixed protocol-relative paths
  that would escape the 17lands.com base). 5 unit tests.
- **Task 21** — `crypto.randomUUID()` replaces the
  `messageIdCounter+Date.now()` id generator in `Chat.tsx`. Audited
  remaining `Date.now()` usage in `src/app/`: only timestamps and
  time-math, no other id generators.

### Chunk 9 — Test coverage

- **Task 22** — `src/core/llm/handlers.test.ts`. Per-tool dispatch test
  asserting the right query function is called with the right args
  (covers all 13 tools). Caching tests via call-counts. Parity test
  ensures every tool name in the array dispatches without throwing
  "Unknown tool".
- **Task 23** — Extended `src/core/db/queries.test.ts` to cover
  `listDrafts` (each filter independently + combined), `getMyStats`
  (color_breakdown, trophy detection, win_rate, empty DB),
  `searchDecks` (in_maindeck unset/true/false, set, min_wins),
  `analyzeDeckChoices` (null on missing draft, full path with assessment
  string branches), `getMyCardHistory` (with/without set filter).
- **Task 24** — `src/core/db/validators.test.ts`. mapDraft / mapPick /
  mapCardStats / mapDecklist / mapFormatColorStats / mapFormatPlayDraw /
  mapGame, with both populated and null/undefined paths. mapPick
  exercises the JSON-parse fallback (malformed → `[]`, non-array →
  `[]`, non-string entries filtered out).
- **Task 25** — `extractColors` exported and tested in `index.test.ts`;
  `extractMainColors` and `selectDiverseTrophyDecks` tested in
  `format-stats.test.ts` (5-per-pair cap, multi-pair, 30-total cap,
  splash-variant bucketing).

### Chunk 10 — Small cleanups + this report

- **Task 26** — Removed dead exports:
  - `useChatStream` no longer returns `abort` (no callers; the
    `AbortController` plumbing is gone).
  - `RateLimitResult.remaining` kept and wired to a new
    `X-RateLimit-Remaining` response header on successful chat-stream
    POSTs (better than dropping).
  - `ToolResultCache.has`/`clear`/`size` removed; tests now verify
    caching behavior via call-counts on the underlying query, which
    is more representative anyway.
  - Two stale "Rate limiting handled by client.enforceRateLimit()"
    comments removed from `src/sync/index.ts`.
- **Task 28** — Already done as the pre-flight reorder.
- **Task 29** — `closeClient`'s empty `.catch(() => {})` replaced with
  `console.warn("[db] closeClient failed:", err)`.
- This resolution report committed last.

## Manual host verification — deferred to operator

These cannot run in the sandbox (no Turso, no 17lands credentials, no
Vercel env, no real browser). Run them on your machine after merge:

| Source task     | Action                                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 6          | Confirm `API_SECRET` is set in **Vercel Production** env (and Preview if you don't want preview deploys to start).                                                |
| Task 7          | Confirm `SITE_ORIGIN` is set in all envs (Production, Preview, Dev) — the production startup will 500 every chat-stream POST without it.                          |
| Task 10         | `pnpm dev`, navigate `/`, click a draft row → land on `/draft/<id>` with no spinner. Confirm no broken links remain to `?draft=` query params.                    |
| Task 12, 13, 15 | `pnpm sync` against real Turso. Compare `decklists`, `decklist_cards`, `format_play_draw`, `format_color_stats` row counts to a baseline.                         |
| Task 14         | `pnpm sync`, then in `turso db shell`: `SELECT id, draft_id, game_number FROM games WHERE draft_id IS NOT NULL LIMIT 20` — confirm linked games still look right. |
| Task 16         | `pnpm sync` end-to-end success — exercises both the GET and the unified POST path (`/data/trophies/`).                                                            |
| Task 17         | Open a draft page; confirm card data renders with mana costs and GIH WR identical to before.                                                                      |
| Task 18         | Hover a card link in chat; the browser network tab should show a single CDN request when `image_url` is populated, falling back to Scryfall otherwise.            |
| Task 19         | React DevTools profiler on the draft page: expanding one pick row should re-render only that row, not its siblings.                                               |
| Task 21         | New chat messages have `msg-<uuid>` ids.                                                                                                                          |

## Explicitly deferred (not done in this branch)

These are the items the plan listed under "Deferred (out of plan)":

- **P2 — narrow `SELECT *` in LLM tools to reduce token usage.** Defer
  until token usage is measured.
- **A7 — `SetFilter` URL handling inconsistency.** Intentional — leave
  as-is.
- **CardLink hover image cross-render memoization.** Browser cache
  covers most cases; revisit if hover latency is reported.

## Skipped sub-step

- **Task 16 page-mock test.** Mocking the Playwright `Page` object
  across `login`/`ensureBrowser` for a single POST site has poor
  cost-to-value. Real-traffic verification is deferred to host. The
  plan flagged this as the sandbox-safe option; I made the trade-off
  in the other direction. Documented in the Task 16 commit.
