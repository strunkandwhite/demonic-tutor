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
