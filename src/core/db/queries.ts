/**
 * Database query functions for LLM tools.
 */

import { getClient } from "./client";
import type {
  Draft,
  DraftPick,
  CardStats,
  Card,
  FormatColorStats,
  FormatPlayDraw,
  Game,
} from "./schema";
import {
  mapDraft,
  mapPick,
  mapCardStats,
  mapDecklist,
  mapFormatColorStats,
  mapFormatPlayDraw,
  mapGame,
} from "./validators";
import { deriveArchetypeTags } from "../llm/archetype-tags";

export interface ListDraftsParams {
  set?: string;
  colors?: string;
  min_wins?: number;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export async function listDrafts(params: ListDraftsParams): Promise<Draft[]> {
  const db = await getClient();
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (params.set) {
    conditions.push('"set" = ?');
    args.push(params.set);
  }
  if (params.colors) {
    conditions.push("colors LIKE ?");
    args.push(`%${params.colors}%`);
  }
  if (params.min_wins !== undefined) {
    conditions.push("wins >= ?");
    args.push(params.min_wins);
  }
  if (params.date_from) {
    conditions.push("draft_date >= ?");
    args.push(params.date_from);
  }
  if (params.date_to) {
    conditions.push("draft_date <= ?");
    args.push(params.date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitValue = params.limit ?? 100;
  args.push(limitValue);

  const result = await db.execute({
    sql: `SELECT * FROM drafts ${where} ORDER BY draft_date DESC LIMIT ?`,
    args,
  });

  return result.rows.map(mapDraft);
}

export async function getDraft(draftId: string): Promise<{
  draft: Draft | null;
  picks: DraftPick[];
}> {
  const db = await getClient();

  const draftResult = await db.execute({
    sql: "SELECT * FROM drafts WHERE id = ?",
    args: [draftId],
  });

  const picksResult = await db.execute({
    sql: "SELECT * FROM picks WHERE draft_id = ? ORDER BY pack_number, pick_number",
    args: [draftId],
  });

  return {
    draft: draftResult.rows[0] ? mapDraft(draftResult.rows[0]) : null,
    picks: picksResult.rows.map(mapPick),
  };
}

export interface CardData {
  manaCost: string | null;
  gihWr: number | null;
  imageUrl: string | null;
}

export async function getDraftWithCardData(draftId: string): Promise<{
  draft: Draft | null;
  picks: DraftPick[];
  games: Game[];
  cardData: Record<string, CardData>;
}> {
  const db = await getClient();

  // Get draft
  const draftResult = await db.execute({
    sql: "SELECT * FROM drafts WHERE id = ?",
    args: [draftId],
  });

  const draft = draftResult.rows[0] ? mapDraft(draftResult.rows[0]) : null;
  if (!draft) {
    return { draft: null, picks: [], games: [], cardData: {} };
  }

  // Get picks
  const picksResult = await db.execute({
    sql: "SELECT * FROM picks WHERE draft_id = ? ORDER BY pack_number, pick_number",
    args: [draftId],
  });
  const picks = picksResult.rows.map(mapPick);

  // Get games
  const gamesResult = await db.execute({
    sql: "SELECT * FROM games WHERE draft_id = ? ORDER BY game_time",
    args: [draftId],
  });
  const games = gamesResult.rows.map(mapGame);

  // Collect all unique card names (picked cards + available cards)
  const allCardNames = new Set<string>();
  for (const pick of picks) {
    allCardNames.add(pick.card_name);
    for (const name of pick.available_cards) {
      allCardNames.add(name);
    }
  }

  if (allCardNames.size === 0) {
    return { draft, picks, games, cardData: {} };
  }

  // Single LEFT JOIN: keep cards present in `cards` but missing from
  // `card_stats` (gihWr ends up null for those).
  const cardNames = Array.from(allCardNames);
  const placeholders = cardNames.map(() => "?").join(", ");
  const cardsResult = await db.execute({
    sql: `SELECT c.name, c.mana_cost, c.image_url, cs.game_in_hand_wr
          FROM cards c
          LEFT JOIN card_stats cs ON cs.card_name = c.name AND cs."set" = ?
          WHERE c.name IN (${placeholders})`,
    args: [draft.set, ...cardNames],
  });

  const cardData: Record<string, CardData> = {};
  for (const row of cardsResult.rows) {
    const name = row.name as string;
    cardData[name] = {
      manaCost: row.mana_cost as string | null,
      gihWr: row.game_in_hand_wr as number | null,
      imageUrl: row.image_url as string | null,
    };
  }

  // Ensure all card names have entries (even if no data found)
  for (const name of cardNames) {
    if (!cardData[name]) {
      cardData[name] = { manaCost: null, gihWr: null, imageUrl: null };
    }
  }

  return { draft, picks, games, cardData };
}

export interface MyStatsParams {
  set?: string;
  colors?: string;
  date_from?: string;
  date_to?: string;
}

export interface MyStats {
  total_drafts: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  trophies: number;
  color_breakdown: Record<string, { drafts: number; wins: number; losses: number }>;
}

export async function getMyStats(params: MyStatsParams): Promise<MyStats> {
  const db = await getClient();
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (params.set) {
    conditions.push('"set" = ?');
    args.push(params.set);
  }
  if (params.colors) {
    conditions.push("colors LIKE ?");
    args.push(`%${params.colors}%`);
  }
  if (params.date_from) {
    conditions.push("draft_date >= ?");
    args.push(params.date_from);
  }
  if (params.date_to) {
    conditions.push("draft_date <= ?");
    args.push(params.date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await db.execute({
    sql: `SELECT
            COUNT(*) as total_drafts,
            SUM(wins) as total_wins,
            SUM(losses) as total_losses,
            SUM(CASE WHEN wins = 7 THEN 1 ELSE 0 END) as trophies,
            colors
          FROM drafts ${where}
          GROUP BY colors
          ORDER BY total_drafts DESC
          LIMIT 50`,
    args,
  });

  let totalDrafts = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let trophies = 0;
  const colorBreakdown: Record<string, { drafts: number; wins: number; losses: number }> = {};

  for (const row of result.rows) {
    const drafts = row.total_drafts as number;
    const wins = row.total_wins as number;
    const losses = row.total_losses as number;
    const rowTrophies = row.trophies as number;
    const colors = row.colors as string | null;

    totalDrafts += drafts;
    totalWins += wins;
    totalLosses += losses;
    trophies += rowTrophies;

    if (colors) {
      colorBreakdown[colors] = { drafts, wins, losses };
    }
  }

  return {
    total_drafts: totalDrafts,
    total_wins: totalWins,
    total_losses: totalLosses,
    win_rate: totalWins + totalLosses > 0 ? totalWins / (totalWins + totalLosses) : 0,
    trophies,
    color_breakdown: colorBreakdown,
  };
}

export async function getCardStats(cardName: string, set: string): Promise<CardStats | null> {
  const db = await getClient();
  const result = await db.execute({
    sql: 'SELECT * FROM card_stats WHERE card_name = ? AND "set" = ?',
    args: [cardName, set],
  });
  return result.rows[0] ? mapCardStats(result.rows[0]) : null;
}

export async function getFormatTopCards(set: string, limit: number = 20): Promise<CardStats[]> {
  const db = await getClient();
  const result = await db.execute({
    sql: `SELECT * FROM card_stats
          WHERE "set" = ? AND game_in_hand_wr IS NOT NULL
          ORDER BY game_in_hand_wr DESC
          LIMIT ?`,
    args: [set, limit],
  });
  return result.rows.map(mapCardStats);
}

export async function getMyCardHistory(
  cardName: string,
  set?: string
): Promise<{
  times_drafted: number;
  decks_with_wins: number;
  avg_pick: number;
  drafts: Array<{ draft_id: string; pack: number; pick: number; wins: number; losses: number }>;
}> {
  const db = await getClient();
  const setCondition = set ? 'AND d."set" = ?' : "";
  const args = set ? [cardName, set] : [cardName];

  const result = await db.execute({
    sql: `SELECT p.draft_id, p.pack_number, p.pick_number, d.wins, d.losses
          FROM picks p
          JOIN drafts d ON p.draft_id = d.id
          WHERE p.card_name = ? ${setCondition}
          ORDER BY d.draft_date DESC`,
    args,
  });

  const drafts = result.rows.map((r) => ({
    draft_id: r.draft_id as string,
    pack: r.pack_number as number,
    pick: r.pick_number as number,
    wins: r.wins as number,
    losses: r.losses as number,
  }));

  const avgPick =
    drafts.length > 0 ? drafts.reduce((sum, d) => sum + d.pick, 0) / drafts.length : 0;

  return {
    times_drafted: drafts.length,
    decks_with_wins: drafts.filter((d) => d.wins >= 5).length,
    avg_pick: avgPick,
    drafts,
  };
}

export async function getDistinctSets(): Promise<string[]> {
  const db = await getClient();
  const result = await db.execute('SELECT DISTINCT "set" FROM drafts ORDER BY "set"');
  return result.rows.map((row) => row.set as string);
}

export async function getSyncMetadata(key: string): Promise<string | null> {
  const db = await getClient();
  const result = await db.execute({
    sql: "SELECT value FROM sync_metadata WHERE key = ?",
    args: [key],
  });
  return (result.rows[0]?.value as string) ?? null;
}

export async function setSyncMetadata(key: string, value: string): Promise<void> {
  const db = await getClient();
  await db.execute({
    sql: "INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)",
    args: [key, value],
  });
}

export interface DeckWithCards {
  draft_id: string;
  main_colors: string | null;
  splash_colors: string | null;
  maindeck: Array<Card & { quantity: number }>;
  sideboard: Array<Card & { quantity: number }>;
}

export async function getDeck(draftId: string): Promise<DeckWithCards | null> {
  const db = await getClient();

  // Get decklist metadata
  const deckResult = await db.execute({
    sql: "SELECT * FROM decklists WHERE draft_id = ?",
    args: [draftId],
  });

  if (deckResult.rows.length === 0) {
    return null;
  }

  const decklist = mapDecklist(deckResult.rows[0]);

  // Get cards with full details
  const cardsResult = await db.execute({
    sql: `SELECT dc.quantity, dc.is_maindeck, c.*
          FROM decklist_cards dc
          JOIN cards c ON dc.card_name = c.name
          WHERE dc.draft_id = ?`,
    args: [draftId],
  });

  const maindeck: Array<Card & { quantity: number }> = [];
  const sideboard: Array<Card & { quantity: number }> = [];

  for (const row of cardsResult.rows) {
    const card = {
      name: row.name as string,
      image_url: row.image_url as string | null,
      types: row.types as string | null,
      mana_cost: row.mana_cost as string | null,
      colors: row.colors as string | null,
      oracle_id: row.oracle_id as string | null,
      oracle_text: row.oracle_text as string | null,
      cmc: row.cmc as number | null,
      rarity: row.rarity as string | null,
      scryfall_not_found: row.scryfall_not_found as number | null,
      quantity: row.quantity as number,
    };

    if (row.is_maindeck === 1) {
      maindeck.push(card);
    } else {
      sideboard.push(card);
    }
  }

  return {
    draft_id: decklist.draft_id,
    main_colors: decklist.main_colors,
    splash_colors: decklist.splash_colors,
    maindeck,
    sideboard,
  };
}

export interface SearchDecksParams {
  card_name: string;
  in_maindeck?: boolean;
  set?: string;
  min_wins?: number;
}

export interface SearchDecksResult {
  draft_id: string;
  set: string;
  wins: number;
  losses: number;
  in_maindeck: boolean;
  quantity: number;
}

export async function searchDecks(params: SearchDecksParams): Promise<SearchDecksResult[]> {
  const db = await getClient();
  const conditions: string[] = ["dc.card_name = ?"];
  const args: (string | number)[] = [params.card_name];

  if (params.in_maindeck !== undefined) {
    conditions.push("dc.is_maindeck = ?");
    args.push(params.in_maindeck ? 1 : 0);
  }

  if (params.set) {
    conditions.push('d."set" = ?');
    args.push(params.set);
  }

  if (params.min_wins !== undefined) {
    conditions.push("d.wins >= ?");
    args.push(params.min_wins);
  }

  const result = await db.execute({
    sql: `SELECT d.id as draft_id, d."set", d.wins, d.losses, dc.is_maindeck, dc.quantity
          FROM decklist_cards dc
          JOIN drafts d ON dc.draft_id = d.id
          WHERE ${conditions.join(" AND ")}
          ORDER BY d.draft_date DESC
          LIMIT 100`,
    args,
  });

  return result.rows.map((r) => ({
    draft_id: r.draft_id as string,
    set: r.set as string,
    wins: r.wins as number,
    losses: r.losses as number,
    in_maindeck: r.is_maindeck === 1,
    quantity: r.quantity as number,
  }));
}

export interface DeckChoiceAnalysis {
  draft_id: string;
  wins: number;
  losses: number;
  sideboard_analysis: Array<{
    name: string;
    quantity: number;
    gih_wr: number | null;
    avg_taken_at: number | null;
    assessment: string;
  }>;
}

export async function analyzeDeckChoices(draftId: string): Promise<DeckChoiceAnalysis | null> {
  const db = await getClient();

  // Get draft info
  const draftResult = await db.execute({
    sql: 'SELECT id, "set", wins, losses FROM drafts WHERE id = ?',
    args: [draftId],
  });

  if (draftResult.rows.length === 0) {
    return null;
  }

  const draft = draftResult.rows[0];
  const set = draft.set as string;

  // Get sideboard cards with stats
  const sideboardResult = await db.execute({
    sql: `SELECT dc.card_name, dc.quantity, cs.game_in_hand_wr, cs.avg_pick_at
          FROM decklist_cards dc
          LEFT JOIN card_stats cs ON dc.card_name = cs.card_name AND cs."set" = ?
          WHERE dc.draft_id = ? AND dc.is_maindeck = 0
          ORDER BY cs.game_in_hand_wr DESC NULLS LAST`,
    args: [set, draftId],
  });

  const sideboardAnalysis = sideboardResult.rows.map((r) => {
    const gihWr = r.game_in_hand_wr as number | null;
    let assessment = "No stats available";

    if (gihWr !== null) {
      if (gihWr >= 0.58) {
        assessment = `High GIH WR (${(gihWr * 100).toFixed(1)}%) - consider playing`;
      } else if (gihWr >= 0.54) {
        assessment = `Above average GIH WR (${(gihWr * 100).toFixed(1)}%)`;
      } else if (gihWr >= 0.5) {
        assessment = `Average GIH WR (${(gihWr * 100).toFixed(1)}%)`;
      } else {
        assessment = `Below average GIH WR (${(gihWr * 100).toFixed(1)}%)`;
      }
    }

    return {
      name: r.card_name as string,
      quantity: r.quantity as number,
      gih_wr: gihWr,
      avg_taken_at: r.avg_pick_at as number | null,
      assessment,
    };
  });

  return {
    draft_id: draftId,
    wins: draft.wins as number,
    losses: draft.losses as number,
    sideboard_analysis: sideboardAnalysis,
  };
}

export interface CardInfo {
  name: string;
  mana_cost: string | null;
  colors: string | null;
  type_line: string | null;
  rules_text: string | null;
  rarity: string | null;
  archetype_tags: string[];
}

export async function getCardInfo(cardName: string, set: string): Promise<CardInfo | null> {
  const db = await getClient();

  // First verify the card exists in this set via card_stats
  const statsCheck = await db.execute({
    sql: 'SELECT card_name FROM card_stats WHERE card_name = ? AND "set" = ?',
    args: [cardName, set],
  });

  if (statsCheck.rows.length === 0) {
    return null;
  }

  // Get card details from cards table
  const result = await db.execute({
    sql: "SELECT name, mana_cost, colors, types, oracle_text, rarity FROM cards WHERE name = ?",
    args: [cardName],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  const typeLine = row.types as string | null;
  const oracleText = row.oracle_text as string | null;

  return {
    name: row.name as string,
    mana_cost: row.mana_cost as string | null,
    colors: row.colors as string | null,
    type_line: typeLine,
    rules_text: oracleText,
    rarity: row.rarity as string | null,
    archetype_tags: deriveArchetypeTags(typeLine, oracleText),
  };
}

export async function getFormatColorStats(
  set: string,
  eventType?: string
): Promise<FormatColorStats[]> {
  const db = await getClient();
  const conditions: string[] = ['"set" = ?'];
  const args: (string | number)[] = [set];

  if (eventType) {
    conditions.push("event_type = ?");
    args.push(eventType);
  }

  const result = await db.execute({
    sql: `SELECT * FROM format_color_stats
          WHERE ${conditions.join(" AND ")}
          ORDER BY is_summary DESC, wins * 1.0 / NULLIF(games, 0) DESC`,
    args,
  });

  return result.rows.map(mapFormatColorStats);
}

export async function getFormatPlayDraw(
  set: string,
  eventType?: string
): Promise<FormatPlayDraw | null> {
  const db = await getClient();
  const conditions: string[] = ['"set" = ?'];
  const args: (string | number)[] = [set];

  if (eventType) {
    conditions.push("event_type = ?");
    args.push(eventType);
  }

  const result = await db.execute({
    sql: `SELECT * FROM format_play_draw
          WHERE ${conditions.join(" AND ")}
          LIMIT 1`,
    args,
  });

  return result.rows[0] ? mapFormatPlayDraw(result.rows[0]) : null;
}

export interface TrophyDecklist {
  draft_id: string;
  main_colors: string | null;
  splash_colors: string | null;
  cards: Array<{ card_name: string; quantity: number; is_maindeck: boolean }>;
}

export async function getTrophyDecklists(
  set: string,
  colors?: string,
  limit: number = 10
): Promise<TrophyDecklist[]> {
  const db = await getClient();

  // Build conditions for decklists
  const conditions: string[] = ["source = ?", '"set" = ?'];
  const args: (string | number)[] = ["trophy", set];

  if (colors) {
    conditions.push("main_colors = ?");
    args.push(colors);
  }

  args.push(limit);

  // Get trophy decklists
  const decklistsResult = await db.execute({
    sql: `SELECT draft_id, main_colors, splash_colors
          FROM decklists
          WHERE ${conditions.join(" AND ")}
          ORDER BY draft_id DESC
          LIMIT ?`,
    args,
  });

  if (decklistsResult.rows.length === 0) {
    return [];
  }

  // Get all draft IDs
  const draftIds = decklistsResult.rows.map((r) => r.draft_id as string);

  // Get cards for all these decklists
  const placeholders = draftIds.map(() => "?").join(", ");
  const cardsResult = await db.execute({
    sql: `SELECT draft_id, card_name, quantity, is_maindeck
          FROM decklist_cards
          WHERE draft_id IN (${placeholders})`,
    args: draftIds,
  });

  // Group cards by draft_id
  const cardsByDraft = new Map<
    string,
    Array<{ card_name: string; quantity: number; is_maindeck: boolean }>
  >();

  for (const row of cardsResult.rows) {
    const draftId = row.draft_id as string;
    if (!cardsByDraft.has(draftId)) {
      cardsByDraft.set(draftId, []);
    }
    cardsByDraft.get(draftId)!.push({
      card_name: row.card_name as string,
      quantity: row.quantity as number,
      is_maindeck: row.is_maindeck === 1,
    });
  }

  // Build result
  return decklistsResult.rows.map((r) => ({
    draft_id: r.draft_id as string,
    main_colors: r.main_colors as string | null,
    splash_colors: r.splash_colors as string | null,
    cards: cardsByDraft.get(r.draft_id as string) || [],
  }));
}
