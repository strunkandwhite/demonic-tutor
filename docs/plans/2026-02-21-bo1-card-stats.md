# Bo1 Card Stats Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Always fetch PremierDraft (Bo1) card stats from the 17lands `/card_ratings/data` endpoint instead of extracting format-specific stats from individual draft details.

**Architecture:** Replace per-draft card stat extraction with a per-set fetch from the card_ratings endpoint during format stats sync. This gives consistent Bo1 data regardless of draft format, with better coverage (all cards in the set, not just cards the user saw).

**Tech Stack:** TypeScript, 17lands API, Turso/libsql

---

### Task 1: Add SeventeenLandsCardRating type

**Files:**

- Modify: `src/core/seventeen-lands/types.ts:40-54`

**Step 1: Add the new type**

Add after `SeventeenLandsTrophyDeck` (after line 194) in `src/core/seventeen-lands/types.ts`:

```typescript
/**
 * Card rating stats from the 17lands /card_ratings/data endpoint.
 * Aggregated Bo1 stats across all users for a set.
 */
export interface SeventeenLandsCardRating {
  name: string;
  avg_seen: number | null;
  avg_pick: number | null;
  seen_count: number;
  pick_count: number;
  ever_drawn_win_rate: number | null;
}
```

We only type the fields we use. The API returns more (rarity, url, opening_hand_win_rate, etc.) but TypeScript won't complain about extra fields in JSON.

**Step 2: Remove `card_performance_data` from `SeventeenLandsDraftDetail`**

In the same file, change lines 40-54 from:

```typescript
export interface SeventeenLandsDraftDetail {
  expansion: string;
  num_seats: number;
  picks: SeventeenLandsPick[];
  card_performance_data: Record<
    string,
    {
      total_times_seen: number;
      avg_seen_position: number;
      total_times_picked: number;
      avg_pick_position: number;
      game_in_hand_win_rate: number | null;
    }
  >;
}
```

to:

```typescript
export interface SeventeenLandsDraftDetail {
  expansion: string;
  num_seats: number;
  picks: SeventeenLandsPick[];
}
```

**Step 3: Build to verify**

Run: `pnpm build`
Expected: Type error in `src/sync/index.ts` because `updateCardStats` references `detail.card_performance_data`. This is expected — we remove that function in Task 3.

**Step 4: Commit**

```
git add src/core/seventeen-lands/types.ts
git commit -m "feat(types): add SeventeenLandsCardRating, drop card_performance_data from DraftDetail"
```

---

### Task 2: Add `getCardRatings()` to API client and re-export

**Files:**

- Modify: `src/core/seventeen-lands/client.ts:7-17` (imports), after line 378 (new method)
- Modify: `src/core/seventeen-lands/index.ts:2-12` (barrel export)

**Step 1: Add import and method to client**

In `src/core/seventeen-lands/client.ts`, add `SeventeenLandsCardRating` to the import block (line 7-17):

```typescript
import type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
  SeventeenLandsGameList,
  SeventeenLandsEventDetails,
  SeventeenLandsDeck,
  SeventeenLandsColorRating,
  SeventeenLandsCardRating,
  SeventeenLandsPlayDrawStats,
  SeventeenLandsPlayDrawResponse,
  SeventeenLandsTrophyDeck,
} from "./types";
```

Add new method after `getColorRatings()` (after line 378):

```typescript
  async getCardRatings(
    expansion: string,
    format?: string,
    startDate?: string,
    endDate?: string
  ): Promise<SeventeenLandsCardRating[]> {
    log(`getCardRatings(${expansion}, ${format}, ${startDate}, ${endDate})`);
    const params = new URLSearchParams({ expansion });
    if (format) params.set("format", format);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    return withRetry(() =>
      this.fetchApi<SeventeenLandsCardRating[]>(`/card_ratings/data?${params}`)
    );
  }
```

Note: uses `format` param, not `event_type` — that's how `/card_ratings/data` works (different from `/color_ratings/data`).

**Step 2: Add to barrel export**

In `src/core/seventeen-lands/index.ts`, add `SeventeenLandsCardRating` to the type exports:

```typescript
export type {
  SeventeenLandsUserData,
  SeventeenLandsDraftDetail,
  SeventeenLandsGame,
  SeventeenLandsGameList,
  SeventeenLandsEventDetails,
  SeventeenLandsDeck,
  SeventeenLandsColorRating,
  SeventeenLandsCardRating,
  SeventeenLandsPlayDrawStats,
  SeventeenLandsTrophyDeck,
} from "./types";
```

**Step 3: Commit**

```
git add src/core/seventeen-lands/client.ts src/core/seventeen-lands/index.ts
git commit -m "feat(api): add getCardRatings for /card_ratings/data endpoint"
```

---

### Task 3: Remove per-draft `updateCardStats` from sync

**Files:**

- Modify: `src/sync/index.ts:299` (remove call), `src/sync/index.ts:442-484` (delete function)

**Step 1: Remove the call**

In `src/sync/index.ts`, delete line 299:

```typescript
await updateCardStats(db, draft.expansion, detail);
```

**Step 2: Delete the function**

Delete the entire `updateCardStats` function (lines 442-484).

**Step 3: Remove unused import**

Check if `SeventeenLandsDraftDetail` is still used. It is — `insertPicksAndCards` uses it at line 350. Keep it.

Check if `InValue` is still used. It is — used in `syncGames` and `insertPicksAndCards`. Keep it.

**Step 4: Build to verify**

Run: `pnpm build`
Expected: PASS — no more references to `card_performance_data`.

**Step 5: Commit**

```
git add src/sync/index.ts
git commit -m "refactor(sync): remove per-draft updateCardStats

Card stats now come from the card_ratings endpoint (PremierDraft/Bo1)
instead of per-draft card_performance_data."
```

---

### Task 4: Add card stats sync to format-stats

**Files:**

- Modify: `src/sync/format-stats.ts:1-3` (module docstring), after line 64 (cache check fn), lines 275-276 (new sync block)

**Step 1: Update module docstring**

Change line 2 from:

```typescript
 * Sync format-level stats from 17lands: play/draw rates, color ratings, and trophy decklists.
```

to:

```typescript
 * Sync format-level stats from 17lands: play/draw rates, color ratings, card stats, and trophy decklists.
```

**Step 2: Add weekly cache check function**

Add after `wasColorStatsUpdatedThisWeek` (after line 64):

```typescript
/**
 * Check if card_stats for a set was updated in the last week.
 */
async function wasCardStatsUpdatedThisWeek(db: DbClient, set: string): Promise<boolean> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const result = await db.execute({
    sql: `SELECT 1 FROM card_stats WHERE "set" = ? AND updated_at >= ? LIMIT 1`,
    args: [set, weekAgo],
  });
  return result.rows.length > 0;
}
```

**Step 3: Add card stats sync block**

Inside the `for (const set of userSets)` loop, after the color stats block closes (line 275 `}`) and before the trophy decks comment (line 277), insert:

```typescript
// Card stats: refresh weekly (PremierDraft/Bo1 aggregate data)
const cardStatsUpToDate = !dryRun && (await wasCardStatsUpdatedThisWeek(db, set));
if (cardStatsUpToDate) {
  console.log(`Skipping ${set} card stats - already updated this week`);
} else {
  console.log(`Syncing card stats for ${set}...`);

  const cardRatings = await api.getCardRatings(set, "PremierDraft", startDate, endDate);
  console.log(`  Found ${cardRatings.length} card ratings`);

  if (dryRun) {
    const sorted = [...cardRatings]
      .filter((c) => c.ever_drawn_win_rate !== null)
      .sort((a, b) => (b.ever_drawn_win_rate ?? 0) - (a.ever_drawn_win_rate ?? 0));
    console.log(`  Top cards for ${set} by GIH WR:`);
    for (const card of sorted.slice(0, 5)) {
      console.log(
        `    - ${card.name}: ${((card.ever_drawn_win_rate ?? 0) * 100).toFixed(1)}% GIH WR`
      );
    }
    if (cardRatings.length > 5) {
      console.log(`    ... and ${cardRatings.length - 5} more`);
    }
  } else {
    const BATCH_SIZE = 50;

    // Ensure all cards exist in cards table
    for (let i = 0; i < cardRatings.length; i += BATCH_SIZE) {
      const batch = cardRatings.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => "(?)").join(", ");
      const args = batch.map((c) => c.name);
      await db.execute({
        sql: `INSERT OR IGNORE INTO cards (name) VALUES ${placeholders}`,
        args,
      });
    }

    // Upsert card stats
    for (let i = 0; i < cardRatings.length; i += BATCH_SIZE) {
      const batch = cardRatings.slice(i, i + BATCH_SIZE);
      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const args = batch.flatMap((card) => [
        card.name,
        set,
        card.avg_seen,
        card.avg_pick,
        card.ever_drawn_win_rate,
        card.seen_count,
        card.pick_count,
        now,
      ]);
      await db.execute({
        sql: `INSERT OR REPLACE INTO card_stats (card_name, "set", avg_seen_at, avg_pick_at, game_in_hand_wr, times_seen, times_picked, updated_at) VALUES ${placeholders}`,
        args,
      });
    }
    console.log(`[turso] Upserted ${cardRatings.length} card stats for ${set}`);
  }
}
```

**Step 4: Build and lint**

Run: `pnpm build && pnpm lint`
Expected: PASS

**Step 5: Commit**

```
git add src/sync/format-stats.ts
git commit -m "feat(sync): fetch Bo1 card stats from /card_ratings/data endpoint

Replaces per-draft card_performance_data extraction with a dedicated
per-set fetch of PremierDraft stats, refreshed weekly."
```

---

### Task 5: Verify end-to-end

**Step 1: Dry run**

Run: `pnpm sync -- --dry-run`
Expected: Output includes lines like:

```
Syncing card stats for FIN...
  Found N card ratings
  Top cards for FIN by GIH WR:
    - Card Name: 62.3% GIH WR
    ...
```

**Step 2: Actual sync**

Run: `pnpm sync`
Expected: Card stats are upserted. Verify with:

```
turso db shell demonic-tutor "SELECT card_name, game_in_hand_wr FROM card_stats WHERE \"set\" = 'FIN' ORDER BY game_in_hand_wr DESC LIMIT 5"
```

**Step 3: Caching**

Run: `pnpm sync` again.
Expected: `Skipping FIN card stats - already updated this week`
