# Game Replay Links & Per-Draft Chat

Two features that enhance the draft detail page: linking to 17lands game replays and adding draft-scoped LLM chat.

## Feature 1: Game Replay Links

### Problem

Games are synced from 17lands and stored in the database, but never displayed. The 17lands API returns a `link` field with the replay URL, but the sync code discards it after parsing the draft ID and game number.

### Design

**Data layer:**

- Add `replay_link TEXT` column to the `games` table.
- During `syncGames()`, store the raw `link` field from the 17lands API alongside the existing fields.
- Add `getGamesByDraftId(draftId)` query function.
- Include games in the `getDraftWithCardData` response and the `/api/draft/[id]` route.

**UI:**

Game indicators appear in the draft stats card as a row of compact pills. Each pill shows:

- Win/loss (green/red)
- On play or draw (P/D label)
- Clickable link to `https://www.17lands.com{replay_link}` (opens in new tab)

For games synced before this change (no stored `replay_link`), show the indicator without a link.

### Files touched

- `src/core/db/schema.ts` — add `replay_link` to `Game` interface and `CREATE TABLE` SQL
- `src/core/db/queries.ts` — add `getGamesByDraftId`, include games in `getDraftWithCardData`
- `src/sync/index.ts` — store `link` field during game sync
- `src/app/draft/[id]/page.tsx` — render game pills in stats card
- `src/app/components/DraftDetail.tsx` — render game pills in inline stats card
- `src/app/api/draft/[id]/route.ts` — include games in API response

## Feature 2: Per-Draft Chat

### Problem

The chat is global — one conversation that knows nothing about which draft you're viewing. When analyzing a specific draft, the user must describe it or wait for the LLM to look it up. There's no way to have separate, persistent conversations about different drafts.

### Design

**Context mechanism:**

- Extend `UserContext` with an optional `currentDraftId?: string` field.
- In `buildInstructions()`, when `currentDraftId` is present, append to the system prompt: "The user is currently viewing a specific draft (ID: {draftId}). When they say 'this draft', 'my picks', or ask about picks/games without specifying a draft, default to draft_id={draftId}. Call `get_draft` with this ID to load context before responding."
- No changes to LLM tool definitions. The LLM uses existing tools (`get_draft`, `get_my_card_history`, etc.) with the default draft ID.

**Per-page persistence:**

- `usePersistedChat` accepts a `scope` parameter.
- Storage key becomes `demonic-tutor-chat-{scope}`.
- Main page passes `scope="global"`.
- Draft page passes `scope="draft-{id}"`.
- Each scope maintains its own `responseId` chain and last-exchange snapshot.
- No automatic cleanup of old keys. Storage is small per entry (~few KB), so hundreds of drafts fit well within localStorage limits.

**Chat component changes:**

- `Chat` accepts an optional `draftId` prop.
- When `draftId` is set:
  - Auto-initializes `UserContext` with `currentDraftId`.
  - Header text: "Ask about this draft" (instead of "Ask about your drafts").
  - Placeholder text: "Ask about this draft..." (instead of "Ask about your draft history...").
- When `draftId` is absent, behavior is unchanged (global chat).

**Page integration:**

- `/draft/[id]` page adds the `Chat` component at the top (above stats card and packs), matching the main page layout.
- The page remains a server component; `Chat` renders as a client island within it.
- Main page chat stays global at all times — no context switching when the inline draft view (`?draft=` param) is active.
- Navigating to `/draft/[id]` is the entry point for draft-scoped chat.

### Files touched

- `src/core/llm/tools.ts` — add `currentDraftId` to `UserContext`
- `src/core/llm/client.ts` — update `buildInstructions()` for draft context
- `src/app/components/Chat.tsx` — accept `draftId` prop, adjust header/placeholder
- `src/app/hooks/usePersistedChat.ts` — accept `scope` param, key storage by scope
- `src/app/draft/[id]/page.tsx` — add `Chat` component at top of page
- `src/app/page.tsx` — pass `scope="global"` to Chat

## Scope boundaries

**In scope:**

- Game replay link storage and display
- Per-page chat persistence with scope-based localStorage keys
- Draft context via UserContext extension
- Chat on the `/draft/[id]` standalone page

**Out of scope:**

- Context switching on the main page inline draft view
- Full conversation history persistence (stays at last-exchange only)
- Cleanup/management UI for old chat histories
- Game-level analytics tools for the LLM
