/**
 * Database schema types for Demonic Tutor.
 */

export interface Draft {
  id: string;
  set: string;
  format: string;
  colors: string | null;
  wins: number;
  losses: number;
  start_rank: string | null;
  end_rank: string | null;
  draft_date: string;
  synced_at: string;
}

export interface Pick {
  draft_id: string;
  pack_number: number;
  pick_number: number;
  card_name: string;
  available_cards: string; // JSON array
}

export interface Card {
  name: string;
  image_url: string | null;
  types: string | null;
  mana_cost: string | null;
  colors: string | null;
}

export interface CardStats {
  card_name: string;
  set: string;
  avg_seen_at: number | null;
  avg_pick_at: number | null;
  game_in_hand_wr: number | null;
  times_seen: number | null;
  times_picked: number | null;
  updated_at: string;
}

export interface SyncMetadata {
  key: string;
  value: string;
}

/** SQL statements to create tables */
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  "set" TEXT NOT NULL,
  format TEXT NOT NULL,
  colors TEXT,
  wins INTEGER NOT NULL,
  losses INTEGER NOT NULL,
  start_rank TEXT,
  end_rank TEXT,
  draft_date TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS picks (
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  pack_number INTEGER NOT NULL,
  pick_number INTEGER NOT NULL,
  card_name TEXT NOT NULL,
  available_cards TEXT NOT NULL,
  PRIMARY KEY (draft_id, pack_number, pick_number)
);

CREATE TABLE IF NOT EXISTS cards (
  name TEXT PRIMARY KEY,
  image_url TEXT,
  types TEXT,
  mana_cost TEXT,
  colors TEXT
);

CREATE TABLE IF NOT EXISTS card_stats (
  card_name TEXT NOT NULL REFERENCES cards(name),
  "set" TEXT NOT NULL,
  avg_seen_at REAL,
  avg_pick_at REAL,
  game_in_hand_wr REAL,
  times_seen INTEGER,
  times_picked INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (card_name, "set")
);

CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drafts_set ON drafts("set");
CREATE INDEX IF NOT EXISTS idx_drafts_date ON drafts(draft_date);
CREATE INDEX IF NOT EXISTS idx_picks_draft ON picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_card_stats_set ON card_stats("set");
`;
