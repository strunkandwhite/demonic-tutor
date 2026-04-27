import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeToolCall } from "./handlers";
import { ToolResultCache } from "./cache";
import { tools } from "./tools";
import * as queries from "@/core/db/queries";

// Mock all query functions used by the dispatcher.
vi.mock("@/core/db/queries", () => ({
  listDrafts: vi.fn().mockResolvedValue([]),
  getDraft: vi.fn().mockResolvedValue({ draft: null }),
  getMyStats: vi.fn().mockResolvedValue({}),
  getMyCardHistory: vi.fn().mockResolvedValue([]),
  getCardStats: vi.fn().mockResolvedValue(null),
  getFormatTopCards: vi.fn().mockResolvedValue([]),
  getDeck: vi.fn().mockResolvedValue(null),
  searchDecks: vi.fn().mockResolvedValue([]),
  analyzeDeckChoices: vi.fn().mockResolvedValue([]),
  getCardInfo: vi.fn().mockResolvedValue(null),
  getFormatColorStats: vi.fn().mockResolvedValue([]),
  getFormatPlayDraw: vi.fn().mockResolvedValue([]),
  getTrophyDecklists: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("executeToolCall dispatch", () => {
  it("list_drafts → listDrafts(args)", async () => {
    await executeToolCall("list_drafts", { set: "TST", limit: 10 });
    expect(queries.listDrafts).toHaveBeenCalledWith({ set: "TST", limit: 10 });
  });

  it("get_draft → getDraft(args.draft_id)", async () => {
    await executeToolCall("get_draft", { draft_id: "abc" });
    expect(queries.getDraft).toHaveBeenCalledWith("abc");
  });

  it("get_my_stats → getMyStats(args)", async () => {
    await executeToolCall("get_my_stats", { set: "TST" });
    expect(queries.getMyStats).toHaveBeenCalledWith({ set: "TST" });
  });

  it("get_my_card_history → getMyCardHistory(card_name, set)", async () => {
    await executeToolCall("get_my_card_history", { card_name: "Plains", set: "TST" });
    expect(queries.getMyCardHistory).toHaveBeenCalledWith("Plains", "TST");
  });

  it("get_card_stats → getCardStats(card_name, set)", async () => {
    await executeToolCall("get_card_stats", { card_name: "Plains", set: "TST" });
    expect(queries.getCardStats).toHaveBeenCalledWith("Plains", "TST");
  });

  it("get_format_top_cards → getFormatTopCards(set, limit)", async () => {
    await executeToolCall("get_format_top_cards", { set: "TST", limit: 20 });
    expect(queries.getFormatTopCards).toHaveBeenCalledWith("TST", 20);
  });

  it("get_deck → getDeck(draft_id)", async () => {
    await executeToolCall("get_deck", { draft_id: "abc" });
    expect(queries.getDeck).toHaveBeenCalledWith("abc");
  });

  it("search_decks → searchDecks(args)", async () => {
    await executeToolCall("search_decks", {
      card_name: "Plains",
      in_maindeck: true,
      set: "TST",
      min_wins: 4,
    });
    expect(queries.searchDecks).toHaveBeenCalledWith({
      card_name: "Plains",
      in_maindeck: true,
      set: "TST",
      min_wins: 4,
    });
  });

  it("analyze_deck_choices → analyzeDeckChoices(draft_id)", async () => {
    await executeToolCall("analyze_deck_choices", { draft_id: "abc" });
    expect(queries.analyzeDeckChoices).toHaveBeenCalledWith("abc");
  });

  it("get_card_info → getCardInfo(card_name, set)", async () => {
    await executeToolCall("get_card_info", { card_name: "Plains", set: "TST" });
    expect(queries.getCardInfo).toHaveBeenCalledWith("Plains", "TST");
  });

  it("set_user_context returns userContext and ok:true", async () => {
    const intent = { mode: "maximize_wins" as const, forced_archetype: null, constraints: [] };
    const result = await executeToolCall("set_user_context", { intent });
    expect(JSON.parse(result.output)).toEqual({ ok: true });
    expect(result.userContext).toEqual({ intent });
  });

  it("get_format_meta → parallel getFormatColorStats + getFormatPlayDraw with default event_type", async () => {
    await executeToolCall("get_format_meta", { set: "TST" });
    expect(queries.getFormatColorStats).toHaveBeenCalledWith("TST", "PremierDraft");
    expect(queries.getFormatPlayDraw).toHaveBeenCalledWith("TST", "PremierDraft");
  });

  it("get_format_meta uses provided event_type", async () => {
    await executeToolCall("get_format_meta", { set: "TST", event_type: "QuickDraft" });
    expect(queries.getFormatColorStats).toHaveBeenCalledWith("TST", "QuickDraft");
    expect(queries.getFormatPlayDraw).toHaveBeenCalledWith("TST", "QuickDraft");
  });

  it("get_trophy_decks → getTrophyDecklists(set, colors?, limit) with default limit=5", async () => {
    await executeToolCall("get_trophy_decks", { set: "TST" });
    expect(queries.getTrophyDecklists).toHaveBeenCalledWith("TST", undefined, 5);
  });

  it("get_trophy_decks uses provided colors and limit", async () => {
    await executeToolCall("get_trophy_decks", { set: "TST", colors: "WU", limit: 10 });
    expect(queries.getTrophyDecklists).toHaveBeenCalledWith("TST", "WU", 10);
  });
});

describe("executeToolCall caching", () => {
  it("returns cached output without calling the underlying query", async () => {
    const cache = new ToolResultCache();
    cache.set("list_drafts", { set: "TST" }, '{"cached":true}');

    const result = await executeToolCall("list_drafts", { set: "TST" }, cache);

    expect(result.output).toBe('{"cached":true}');
    expect(queries.listDrafts).not.toHaveBeenCalled();
  });

  it("caches non-set_user_context results on miss", async () => {
    const cache = new ToolResultCache();
    expect(cache.has("get_draft", { draft_id: "abc" })).toBe(false);

    await executeToolCall("get_draft", { draft_id: "abc" }, cache);

    expect(cache.has("get_draft", { draft_id: "abc" })).toBe(true);
  });

  it("set_user_context bypasses the cache (does not store, never reads)", async () => {
    const cache = new ToolResultCache();
    const intent = { mode: "maximize_wins" as const, forced_archetype: null, constraints: [] };

    await executeToolCall("set_user_context", { intent }, cache);

    // Result should not be in the cache (bypass).
    expect(cache.has("set_user_context", { intent })).toBe(false);
  });
});

describe("executeToolCall ↔ tools parity", () => {
  it("dispatches every tool name without throwing 'Unknown tool'", async () => {
    // Provide enough args that each handler can extract what it needs.
    const argsByName: Record<string, Record<string, unknown>> = {
      list_drafts: {},
      get_draft: { draft_id: "x" },
      get_my_stats: {},
      get_my_card_history: { card_name: "x" },
      get_card_stats: { card_name: "x", set: "TST" },
      get_format_top_cards: { set: "TST" },
      get_deck: { draft_id: "x" },
      search_decks: { card_name: "x" },
      analyze_deck_choices: { draft_id: "x" },
      get_card_info: { card_name: "x", set: "TST" },
      set_user_context: {
        intent: { mode: "maximize_wins", forced_archetype: null, constraints: [] },
      },
      get_format_meta: { set: "TST" },
      get_trophy_decks: { set: "TST" },
    };

    for (const t of tools) {
      const args = argsByName[t.name];
      expect(args, `no fixture args for ${t.name}`).toBeDefined();
      // Should not throw.
      await expect(executeToolCall(t.name, args)).resolves.toBeDefined();
    }
  });
});
