import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@libsql/client";
import { createTestDb } from "@/test/db";
import {
  applyGameDraftLinks,
  parseGameLink,
  parseGameIdFromS3Path,
  type GameLinkUpdate,
} from "./index";

describe("parseGameLink", () => {
  it("parses valid game links", () => {
    const result = parseGameLink("/user/game_replay/20260122/abc123def456/2");
    expect(result).toEqual({ draftId: "abc123def456", gameNumber: 2 });
  });

  it("parses game links with long draft IDs", () => {
    const result = parseGameLink("/user/game_replay/20260122/8374259f7e0844febbda9a1c1d3dcf18/0");
    expect(result).toEqual({
      draftId: "8374259f7e0844febbda9a1c1d3dcf18",
      gameNumber: 0,
    });
  });

  it("returns null for invalid links", () => {
    expect(parseGameLink("/invalid/path")).toBeNull();
    expect(parseGameLink("")).toBeNull();
    expect(parseGameLink("/user/game_replay/notadate/abc/0")).toBeNull();
  });

  it("returns null for links missing components", () => {
    expect(parseGameLink("/user/game_replay/20260122/abc123")).toBeNull();
    expect(parseGameLink("/user/game_replay/20260122")).toBeNull();
  });
});

describe("parseGameIdFromS3Path", () => {
  it("extracts game ID from valid S3 paths", () => {
    const result = parseGameIdFromS3Path(
      "s3://17lands-game-histories/20260122/ca28ff4f82b74b2d944d0bfe2556727f.json.gz"
    );
    expect(result).toBe("ca28ff4f82b74b2d944d0bfe2556727f");
  });

  it("handles different dates in path", () => {
    const result = parseGameIdFromS3Path(
      "s3://17lands-game-histories/20240820/abc123def456.json.gz"
    );
    expect(result).toBe("abc123def456");
  });

  it("returns null for invalid paths", () => {
    expect(parseGameIdFromS3Path("invalid/path")).toBeNull();
    expect(parseGameIdFromS3Path("")).toBeNull();
    expect(parseGameIdFromS3Path("s3://bucket/file.txt")).toBeNull();
  });

  it("returns null for paths without .json.gz extension", () => {
    expect(parseGameIdFromS3Path("s3://17lands-game-histories/20260122/abc123.json")).toBeNull();
  });
});

async function seedDraft(db: Client, draftId: string): Promise<void> {
  await db.execute({
    sql: "INSERT INTO drafts (id, \"set\", format, colors, wins, losses, draft_date, synced_at) VALUES (?, 'TST', 'PremierDraft', 'WU', 7, 0, '2026-01-01', '2026-01-01T00:00:00Z')",
    args: [draftId],
  });
}

async function seedGame(db: Client, fullId: string): Promise<void> {
  await db.execute({
    sql: "INSERT INTO games (id, draft_id, game_number, game_time, on_play, won) VALUES (?, NULL, 0, '2026-01-01T00:00:00Z', 1, 1)",
    args: [fullId],
  });
}

describe("applyGameDraftLinks", () => {
  let db: Client;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("sets draft_id and game_number on the matching row only", async () => {
    await seedDraft(db, "draft-1");
    await seedGame(db, "abc_0");
    await seedGame(db, "abc_1");
    await seedGame(db, "untouched_0");

    const updates: GameLinkUpdate[] = [
      { fullId: "abc_0", draftId: "draft-1", gameNumber: 1 },
      { fullId: "abc_1", draftId: "draft-1", gameNumber: 1 }, // Bo1 — both get game_number=1
    ];

    await applyGameDraftLinks(db, updates);

    const linked = await db.execute("SELECT id, draft_id, game_number FROM games ORDER BY id");
    expect(linked.rows).toEqual([
      { id: "abc_0", draft_id: "draft-1", game_number: 1 },
      { id: "abc_1", draft_id: "draft-1", game_number: 1 },
      { id: "untouched_0", draft_id: null, game_number: 0 },
    ]);
  });

  it("is a no-op on empty input", async () => {
    await seedGame(db, "abc_0");
    await applyGameDraftLinks(db, []);
    const rows = await db.execute("SELECT draft_id FROM games WHERE id = 'abc_0'");
    expect(rows.rows[0].draft_id).toBeNull();
  });

  it("uses a single db.batch call (no per-row execute)", async () => {
    await seedDraft(db, "d1");
    await seedDraft(db, "d2");
    await seedGame(db, "abc_0");
    await seedGame(db, "def_0");

    const batchSpy = vi.spyOn(db, "batch");

    await applyGameDraftLinks(db, [
      { fullId: "abc_0", draftId: "d1", gameNumber: 1 },
      { fullId: "def_0", draftId: "d2", gameNumber: 1 },
    ]);

    expect(batchSpy).toHaveBeenCalledTimes(1);
    batchSpy.mockRestore();
  });

  it("does not match by LIKE — id `abc_10` is not affected by an update for `abc_1`", async () => {
    // Regression for the old WHERE id LIKE '<gameId>%' behavior, which would
    // have matched both abc_1 and abc_10. With exact id, only abc_1 changes.
    await seedDraft(db, "draft-x");
    await seedGame(db, "abc_1");
    await seedGame(db, "abc_10");

    await applyGameDraftLinks(db, [{ fullId: "abc_1", draftId: "draft-x", gameNumber: 1 }]);

    const rows = await db.execute("SELECT id, draft_id FROM games ORDER BY id");
    expect(rows.rows).toEqual([
      { id: "abc_1", draft_id: "draft-x" },
      { id: "abc_10", draft_id: null },
    ]);
  });
});
