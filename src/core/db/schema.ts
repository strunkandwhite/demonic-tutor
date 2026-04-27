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

export interface DraftPick {
  draft_id: string;
  pack_number: number;
  pick_number: number;
  card_name: string;
  available_cards: string[]; // parsed in mapPick (column itself is TEXT JSON)
}

export interface Card {
  name: string;
  image_url: string | null;
  types: string | null;
  mana_cost: string | null;
  colors: string | null;
  oracle_id: string | null;
  oracle_text: string | null;
  cmc: number | null;
  rarity: string | null;
  scryfall_not_found: number | null;
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

export interface Game {
  id: string;
  draft_id: string | null;
  game_number: number;
  game_time: string;
  on_play: number;
  won: number;
  turns: number | null;
  event_name: string | null;
  orphaned: number | null;
  replay_link: string | null;
}

export interface Decklist {
  draft_id: string;
  set: string | null;
  main_colors: string | null;
  splash_colors: string | null;
  source: string; // 'user' or 'trophy'
}

export interface FormatColorStats {
  id: number;
  set: string;
  event_type: string;
  color_code: string;
  color_name: string;
  wins: number;
  games: number;
  is_summary: number; // 1 = summary row (e.g., "All Decks"), 0 = color pair
  updated_at: string;
}

export interface FormatPlayDraw {
  id: number;
  set: string;
  event_type: string;
  avg_game_length: number;
  play_win_rate: number;
  sample_size: number;
  updated_at: string;
}

export interface DecklistCard {
  draft_id: string;
  card_name: string;
  quantity: number;
  is_maindeck: number;
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
  colors TEXT,
  oracle_id TEXT,
  oracle_text TEXT,
  cmc REAL,
  rarity TEXT,
  scryfall_not_found INTEGER DEFAULT 0
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

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  draft_id TEXT REFERENCES drafts(id),
  game_number INTEGER NOT NULL,
  game_time TEXT NOT NULL,
  on_play INTEGER NOT NULL,
  won INTEGER NOT NULL,
  turns INTEGER,
  event_name TEXT,
  orphaned INTEGER DEFAULT 0,
  replay_link TEXT
);

CREATE INDEX IF NOT EXISTS idx_drafts_set ON drafts("set");
CREATE INDEX IF NOT EXISTS idx_drafts_date ON drafts(draft_date);
CREATE INDEX IF NOT EXISTS idx_drafts_colors ON drafts(colors);
CREATE INDEX IF NOT EXISTS idx_picks_draft ON picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_picks_card_name ON picks(card_name);
CREATE INDEX IF NOT EXISTS idx_card_stats_set ON card_stats("set");
CREATE INDEX IF NOT EXISTS idx_games_draft ON games(draft_id);

CREATE TABLE IF NOT EXISTS decklists (
  draft_id TEXT PRIMARY KEY,
  "set" TEXT,
  main_colors TEXT,
  splash_colors TEXT,
  source TEXT DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS decklist_cards (
  draft_id TEXT NOT NULL,
  card_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  is_maindeck INTEGER NOT NULL,
  PRIMARY KEY (draft_id, card_name, is_maindeck)
);

CREATE INDEX IF NOT EXISTS idx_decklists_set ON decklists("set");
CREATE INDEX IF NOT EXISTS idx_decklist_cards_card ON decklist_cards(card_name);
CREATE INDEX IF NOT EXISTS idx_decklist_cards_draft ON decklist_cards(draft_id);

CREATE TABLE IF NOT EXISTS format_color_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "set" TEXT NOT NULL,
  event_type TEXT NOT NULL,
  color_code TEXT NOT NULL,
  color_name TEXT NOT NULL,
  wins INTEGER NOT NULL,
  games INTEGER NOT NULL,
  is_summary INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE("set", event_type, color_code)
);

CREATE TABLE IF NOT EXISTS format_play_draw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  "set" TEXT NOT NULL,
  event_type TEXT NOT NULL,
  avg_game_length REAL NOT NULL,
  play_win_rate REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE("set", event_type)
);

CREATE INDEX IF NOT EXISTS idx_format_color_stats_set ON format_color_stats("set");
CREATE INDEX IF NOT EXISTS idx_format_play_draw_set ON format_play_draw("set");
`;
