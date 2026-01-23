/**
 * Database query functions for LLM tools.
 */

import { getClient } from "./client";
import type { Draft, Pick, CardStats } from "./schema";

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

  return result.rows as unknown as Draft[];
}

export async function getDraft(draftId: string): Promise<{
  draft: Draft | null;
  picks: Pick[];
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
    draft: (draftResult.rows[0] as unknown as Draft) || null,
    picks: picksResult.rows as unknown as Pick[],
  };
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
          GROUP BY colors`,
    args,
  });

  let totalDrafts = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let trophies = 0;
  const colorBreakdown: Record<string, { drafts: number; wins: number; losses: number }> = {};

  for (const row of result.rows) {
    const r = row as unknown as { total_drafts: number; total_wins: number; total_losses: number; trophies: number; colors: string };
    totalDrafts += r.total_drafts;
    totalWins += r.total_wins;
    totalLosses += r.total_losses;
    trophies += r.trophies;

    if (r.colors) {
      colorBreakdown[r.colors] = {
        drafts: r.total_drafts,
        wins: r.total_wins,
        losses: r.total_losses,
      };
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

export async function getCardStats(
  cardName: string,
  set: string
): Promise<CardStats | null> {
  const db = await getClient();
  const result = await db.execute({
    sql: 'SELECT * FROM card_stats WHERE card_name = ? AND "set" = ?',
    args: [cardName, set],
  });
  return (result.rows[0] as unknown as CardStats) || null;
}

export async function getFormatTopCards(
  set: string,
  limit: number = 20
): Promise<CardStats[]> {
  const db = await getClient();
  const result = await db.execute({
    sql: `SELECT * FROM card_stats
          WHERE "set" = ? AND game_in_hand_wr IS NOT NULL
          ORDER BY game_in_hand_wr DESC
          LIMIT ?`,
    args: [set, limit],
  });
  return result.rows as unknown as CardStats[];
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

  const avgPick = drafts.length > 0
    ? drafts.reduce((sum, d) => sum + d.pick, 0) / drafts.length
    : 0;

  return {
    times_drafted: drafts.length,
    decks_with_wins: drafts.filter((d) => d.wins >= 5).length,
    avg_pick: avgPick,
    drafts,
  };
}
