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
  card_performance_data: Record<string, {
    total_times_seen: number;
    avg_seen_position: number;
    total_times_picked: number;
    avg_pick_position: number;
    game_in_hand_win_rate: number | null;
  }>;
}
