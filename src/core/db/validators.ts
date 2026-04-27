/**
 * Type validation utilities for database query results.
 * Provides runtime validation to catch schema mismatches early.
 */

import type { Row } from "@libsql/client";
import type {
  Draft,
  DraftPick,
  CardStats,
  Decklist,
  FormatColorStats,
  FormatPlayDraw,
  Game,
} from "./schema";

/**
 * Safely extract a value from a row with type checking.
 */
function getString(row: Row, key: string): string {
  const val = row[key];
  if (typeof val !== "string") {
    throw new Error(`Expected string for ${key}, got ${typeof val}`);
  }
  return val;
}

function getStringOrNull(row: Row, key: string): string | null {
  const val = row[key];
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") {
    throw new Error(`Expected string|null for ${key}, got ${typeof val}`);
  }
  return val;
}

function getNumber(row: Row, key: string): number {
  const val = row[key];
  if (typeof val !== "number") {
    throw new Error(`Expected number for ${key}, got ${typeof val}`);
  }
  return val;
}

function getNumberOrNull(row: Row, key: string): number | null {
  const val = row[key];
  if (val === null || val === undefined) return null;
  if (typeof val !== "number") {
    throw new Error(`Expected number|null for ${key}, got ${typeof val}`);
  }
  return val;
}

/**
 * Map a database row to a Draft object with validation.
 */
export function mapDraft(row: Row): Draft {
  return {
    id: getString(row, "id"),
    set: getString(row, "set"),
    format: getString(row, "format"),
    colors: getStringOrNull(row, "colors"),
    wins: getNumber(row, "wins"),
    losses: getNumber(row, "losses"),
    start_rank: getStringOrNull(row, "start_rank"),
    end_rank: getStringOrNull(row, "end_rank"),
    draft_date: getString(row, "draft_date"),
    synced_at: getString(row, "synced_at"),
  };
}

/**
 * Map a database row to a DraftPick object with validation.
 */
export function mapPick(row: Row): DraftPick {
  return {
    draft_id: getString(row, "draft_id"),
    pack_number: getNumber(row, "pack_number"),
    pick_number: getNumber(row, "pick_number"),
    card_name: getString(row, "card_name"),
    available_cards: getString(row, "available_cards"),
  };
}

/**
 * Map a database row to a CardStats object with validation.
 */
export function mapCardStats(row: Row): CardStats {
  return {
    card_name: getString(row, "card_name"),
    set: getString(row, "set"),
    avg_seen_at: getNumberOrNull(row, "avg_seen_at"),
    avg_pick_at: getNumberOrNull(row, "avg_pick_at"),
    game_in_hand_wr: getNumberOrNull(row, "game_in_hand_wr"),
    times_seen: getNumberOrNull(row, "times_seen"),
    times_picked: getNumberOrNull(row, "times_picked"),
    updated_at: getString(row, "updated_at"),
  };
}

/**
 * Map a database row to a Decklist object with validation.
 */
export function mapDecklist(row: Row): Decklist {
  return {
    draft_id: getString(row, "draft_id"),
    set: getStringOrNull(row, "set"),
    main_colors: getStringOrNull(row, "main_colors"),
    splash_colors: getStringOrNull(row, "splash_colors"),
    source: getString(row, "source"),
  };
}

/**
 * Map a database row to a FormatColorStats object with validation.
 */
export function mapFormatColorStats(row: Row): FormatColorStats {
  return {
    id: getNumber(row, "id"),
    set: getString(row, "set"),
    event_type: getString(row, "event_type"),
    color_code: getString(row, "color_code"),
    color_name: getString(row, "color_name"),
    wins: getNumber(row, "wins"),
    games: getNumber(row, "games"),
    is_summary: getNumber(row, "is_summary"),
    updated_at: getString(row, "updated_at"),
  };
}

/**
 * Map a database row to a FormatPlayDraw object with validation.
 */
export function mapFormatPlayDraw(row: Row): FormatPlayDraw {
  return {
    id: getNumber(row, "id"),
    set: getString(row, "set"),
    event_type: getString(row, "event_type"),
    avg_game_length: getNumber(row, "avg_game_length"),
    play_win_rate: getNumber(row, "play_win_rate"),
    sample_size: getNumber(row, "sample_size"),
    updated_at: getString(row, "updated_at"),
  };
}

/**
 * Map a database row to a Game object with validation.
 */
export function mapGame(row: Row): Game {
  return {
    id: getString(row, "id"),
    draft_id: getStringOrNull(row, "draft_id"),
    game_number: getNumber(row, "game_number"),
    game_time: getString(row, "game_time"),
    on_play: getNumber(row, "on_play"),
    won: getNumber(row, "won"),
    turns: getNumberOrNull(row, "turns"),
    event_name: getStringOrNull(row, "event_name"),
    orphaned: getNumberOrNull(row, "orphaned"),
    replay_link: getStringOrNull(row, "replay_link"),
  };
}
