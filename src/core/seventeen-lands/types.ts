/**
 * Types for 17lands API responses.
 */

export interface SeventeenLandsDraft {
  id: string;
  expansion: string;
  format: string;
  colors: string;
  wins: number;
  losses: number;
  start_rank: string | null;
  end_rank: string | null;
  first_pick_time: string;
  has_picks: boolean;
}

export interface SeventeenLandsUserData {
  drafts: SeventeenLandsDraft[];
  token: string;
}

export interface SeventeenLandsPick {
  pack_number: number;
  pick_number: number;
  pick: {
    name: string;
    image_url: string;
    types: string[];
    mana_cost: string;
  };
  available: Array<{
    name: string;
    image_url: string;
    types: string[];
    mana_cost: string;
  }>;
}

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

export interface SeventeenLandsGame {
  account_name: string;
  event_name: string;
  game_time: string;
  link: string;
  on_play: boolean;
  turns: number;
  won: boolean;
}

export interface SeventeenLandsGameList {
  games: SeventeenLandsGame[];
}

export interface SeventeenLandsGameResult {
  on_play: boolean;
  won: boolean;
  game_number: number;
  mulligans: number;
  opponent_mulligans: number;
  completion_time: number;
  history_s3_path: string; // Contains game ID like "s3://17lands-game-histories/20260122/{game_id}.json.gz"
}

export interface SeventeenLandsMatchResult {
  game_results: SeventeenLandsGameResult[];
}

export interface SeventeenLandsEventDetails {
  metadata: {
    id: string;
    expansion: string;
    format: string;
    wins: number;
    losses: number;
  };
  details: {
    match_results: SeventeenLandsMatchResult[];
  };
}

export interface SeventeenLandsDeckCard {
  id: number;
  name: string;
  cmc: number;
  color_identity: string[];
  mana_cost: string;
  image_url: string;
  rarity: string;
  types: string[];
}

export interface SeventeenLandsDeckEventInfo {
  id: string;
  expansion: string;
  format: string;
  wins: number;
  losses: number;
  deck_links: string[];
}

export interface SeventeenLandsDeck {
  groups: Array<{
    name: "Maindeck" | "Sideboard";
    cards: number[];
  }>;
  cards: Record<string, SeventeenLandsDeckCard>;
  main_colors: string;
  splash_colors: string;
  event_info: SeventeenLandsDeckEventInfo;
}

/**
 * Color rating stats from 17lands expansion endpoint.
 * Shows win rates by color combination for a format.
 */
export interface SeventeenLandsColorRating {
  /** Whether this is a summary row (e.g., "Two-color") vs specific combo (e.g., "Azorius") */
  is_summary: boolean;
  /** Full color name like "Azorius (WU)" or "Two-color" */
  color_name: string;
  /** Short code like "WU", "W", 1, 2, "All" */
  short_name: string | number;
  /** Total wins */
  wins: number;
  /** Total games played */
  games: number;
}

/**
 * Play/draw statistics from 17lands.
 * Shows win rate advantage when playing first and game length distribution.
 */
export interface SeventeenLandsPlayDrawStats {
  /** Set code like "AFR", "STX" */
  expansion: string;
  /** Event type like "PremierDraft", "QuickDraft", "Sealed" */
  event_type: string;
  /** Average number of turns per game */
  average_game_length: number;
  /** Win rate when on the play (0-1) */
  win_rate_on_play: number;
  /** Number of games in the sample */
  sample_size: number;
  /** Distribution of games by turn count (index = turn number) */
  turns: number[];
}

/**
 * Wrapper for play/draw API response.
 * The /data/play_draw endpoint returns { data: [...] } not just an array.
 */
export interface SeventeenLandsPlayDrawResponse {
  data: SeventeenLandsPlayDrawStats[];
}

/**
 * Trophy deck (7-win) from 17lands leaderboard.
 */
export interface SeventeenLandsTrophyDeck {
  /** Unique ID for the draft aggregate */
  aggregate_id: string;
  /** Color combination like "WU", "BG", "URwb" (lowercase = splash) */
  colors: string;
  /** Number of wins (typically 7 for trophies) */
  wins: number;
  /** Number of losses */
  losses: number;
  /** Starting rank like "Diamond-4", "Mythic-1" */
  start_rank: string;
  /** Ending rank after the run */
  end_rank: string;
  /** Deck index within the event (for Bo3 with multiple decks) */
  deck_index: number;
  /** Timestamp like "2026-01-24 16:23:16" */
  time: string;
  /** Whether the draft picks are available */
  has_draft: boolean;
}
