import { describe, expect, it } from "vitest";
import type { Row } from "@libsql/client";
import {
  mapCardStats,
  mapDecklist,
  mapDraft,
  mapFormatColorStats,
  mapFormatPlayDraw,
  mapGame,
  mapPick,
} from "./validators";

// Cast through unknown so test fixtures can stand in for libsql's structural Row type.
function row(obj: Record<string, unknown>): Row {
  return obj as unknown as Row;
}

describe("mapDraft", () => {
  it("maps a complete row with all optionals set", () => {
    const result = mapDraft(
      row({
        id: "d1",
        set: "TST",
        format: "PremierDraft",
        colors: "WU",
        wins: 7,
        losses: 0,
        start_rank: "Gold-1",
        end_rank: "Platinum-4",
        draft_date: "2026-01-01",
        synced_at: "2026-01-02T00:00:00Z",
      })
    );
    expect(result).toEqual({
      id: "d1",
      set: "TST",
      format: "PremierDraft",
      colors: "WU",
      wins: 7,
      losses: 0,
      start_rank: "Gold-1",
      end_rank: "Platinum-4",
      draft_date: "2026-01-01",
      synced_at: "2026-01-02T00:00:00Z",
    });
  });

  it("preserves nulls for nullable columns", () => {
    const result = mapDraft(
      row({
        id: "d1",
        set: "TST",
        format: "PremierDraft",
        colors: null,
        wins: 0,
        losses: 0,
        start_rank: null,
        end_rank: null,
        draft_date: "2026-01-01",
        synced_at: "2026-01-02T00:00:00Z",
      })
    );
    expect(result.colors).toBeNull();
    expect(result.start_rank).toBeNull();
    expect(result.end_rank).toBeNull();
  });

  it("throws when a required string column is missing or wrong type", () => {
    expect(() => mapDraft(row({ id: 42 }))).toThrow(/Expected string for id/);
  });

  it("throws when a required number column is wrong type", () => {
    expect(() =>
      mapDraft(
        row({
          id: "d1",
          set: "TST",
          format: "PremierDraft",
          colors: null,
          wins: "seven",
          losses: 0,
          start_rank: null,
          end_rank: null,
          draft_date: "2026-01-01",
          synced_at: "2026-01-02T00:00:00Z",
        })
      )
    ).toThrow(/Expected number for wins/);
  });
});

describe("mapPick", () => {
  it("parses available_cards JSON into string[]", () => {
    const result = mapPick(
      row({
        draft_id: "d1",
        pack_number: 0,
        pick_number: 0,
        card_name: "Lightning Bolt",
        available_cards: JSON.stringify(["Plains", "Lightning Bolt"]),
      })
    );
    expect(result.available_cards).toEqual(["Plains", "Lightning Bolt"]);
  });

  it("returns [] when available_cards is malformed JSON", () => {
    const result = mapPick(
      row({
        draft_id: "d1",
        pack_number: 0,
        pick_number: 0,
        card_name: "Lightning Bolt",
        available_cards: "not-json",
      })
    );
    expect(result.available_cards).toEqual([]);
  });

  it("returns [] when available_cards JSON parses to a non-array", () => {
    const result = mapPick(
      row({
        draft_id: "d1",
        pack_number: 0,
        pick_number: 0,
        card_name: "Lightning Bolt",
        available_cards: JSON.stringify({ not: "an array" }),
      })
    );
    expect(result.available_cards).toEqual([]);
  });

  it("filters non-string entries out of the parsed array", () => {
    const result = mapPick(
      row({
        draft_id: "d1",
        pack_number: 1,
        pick_number: 2,
        card_name: "Mountain",
        available_cards: JSON.stringify(["Mountain", 5, null, "Plains"]),
      })
    );
    expect(result.available_cards).toEqual(["Mountain", "Plains"]);
  });
});

describe("mapCardStats", () => {
  it("preserves nulls for nullable numeric columns", () => {
    const result = mapCardStats(
      row({
        card_name: "Plains",
        set: "TST",
        avg_seen_at: null,
        avg_pick_at: null,
        game_in_hand_wr: null,
        times_seen: null,
        times_picked: null,
        updated_at: "2026-01-01",
      })
    );
    expect(result).toEqual({
      card_name: "Plains",
      set: "TST",
      avg_seen_at: null,
      avg_pick_at: null,
      game_in_hand_wr: null,
      times_seen: null,
      times_picked: null,
      updated_at: "2026-01-01",
    });
  });

  it("maps numeric values when present", () => {
    const result = mapCardStats(
      row({
        card_name: "Plains",
        set: "TST",
        avg_seen_at: 5.2,
        avg_pick_at: 6.1,
        game_in_hand_wr: 0.55,
        times_seen: 1000,
        times_picked: 500,
        updated_at: "2026-01-01",
      })
    );
    expect(result.game_in_hand_wr).toBe(0.55);
    expect(result.times_seen).toBe(1000);
  });
});

describe("mapDecklist", () => {
  it("maps a row with all optionals set", () => {
    expect(
      mapDecklist(
        row({
          draft_id: "d1",
          set: "TST",
          main_colors: "WU",
          splash_colors: "B",
          source: "user",
        })
      )
    ).toEqual({
      draft_id: "d1",
      set: "TST",
      main_colors: "WU",
      splash_colors: "B",
      source: "user",
    });
  });

  it("allows nulls on optional columns", () => {
    expect(
      mapDecklist(
        row({
          draft_id: "d1",
          set: null,
          main_colors: null,
          splash_colors: null,
          source: "trophy",
        })
      ).set
    ).toBeNull();
  });
});

describe("mapFormatColorStats / mapFormatPlayDraw", () => {
  it("maps a format_color_stats row", () => {
    const result = mapFormatColorStats(
      row({
        id: 1,
        set: "TST",
        event_type: "PremierDraft",
        color_code: "WU",
        color_name: "Azorius",
        wins: 5,
        games: 10,
        is_summary: 0,
        updated_at: "2026-01-01",
      })
    );
    expect(result.id).toBe(1);
    expect(result.color_name).toBe("Azorius");
  });

  it("maps a format_play_draw row", () => {
    const result = mapFormatPlayDraw(
      row({
        id: 1,
        set: "TST",
        event_type: "PremierDraft",
        avg_game_length: 8.5,
        play_win_rate: 0.55,
        sample_size: 1000,
        updated_at: "2026-01-01",
      })
    );
    expect(result.avg_game_length).toBe(8.5);
    expect(result.play_win_rate).toBe(0.55);
  });
});

describe("mapGame", () => {
  it("maps a game row with all optionals", () => {
    expect(
      mapGame(
        row({
          id: "g1",
          draft_id: "d1",
          game_number: 1,
          game_time: "2026-01-01T00:00:00Z",
          on_play: 1,
          won: 0,
          turns: 9,
          event_name: "PremierDraft",
          orphaned: 0,
          replay_link: "/user/game_replay/x",
        })
      )
    ).toEqual({
      id: "g1",
      draft_id: "d1",
      game_number: 1,
      game_time: "2026-01-01T00:00:00Z",
      on_play: 1,
      won: 0,
      turns: 9,
      event_name: "PremierDraft",
      orphaned: 0,
      replay_link: "/user/game_replay/x",
    });
  });

  it("preserves null draft_id and replay_link", () => {
    const result = mapGame(
      row({
        id: "g1",
        draft_id: null,
        game_number: 0,
        game_time: "2026-01-01T00:00:00Z",
        on_play: 0,
        won: 0,
        turns: null,
        event_name: null,
        orphaned: null,
        replay_link: null,
      })
    );
    expect(result.draft_id).toBeNull();
    expect(result.replay_link).toBeNull();
    expect(result.orphaned).toBeNull();
  });
});
