/**
 * Tool execution handlers.
 */

import {
  listDrafts,
  getDraft,
  getMyStats,
  getMyCardHistory,
  getCardStats,
  getFormatTopCards,
  getDeck,
  searchDecks,
  analyzeDeckChoices,
  getCardInfo,
  getFormatColorStats,
  getFormatPlayDraw,
  getTrophyDecklists,
} from "../db/queries";
import type { ToolName, UserContext } from "./tools";
import type { ToolResultCache } from "./cache";

export interface ToolCallResult {
  output: string;
  userContext?: UserContext;
}

export async function executeToolCall(
  name: ToolName,
  args: Record<string, unknown>,
  cache?: ToolResultCache
): Promise<ToolCallResult> {
  // Check cache for non-mutating tools (everything except set_user_context)
  if (cache && name !== "set_user_context") {
    const cached = cache.get(name, args);
    if (cached) {
      return { output: cached };
    }
  }

  const result = await executeToolCallImpl(name, args);

  // Cache the result
  if (cache && name !== "set_user_context") {
    cache.set(name, args, result.output);
  }

  return result;
}

async function executeToolCallImpl(
  name: ToolName,
  args: Record<string, unknown>
): Promise<ToolCallResult> {
  switch (name) {
    case "list_drafts":
      return { output: JSON.stringify(await listDrafts(args)) };

    case "get_draft":
      return { output: JSON.stringify(await getDraft(args.draft_id as string)) };

    case "get_my_stats":
      return { output: JSON.stringify(await getMyStats(args)) };

    case "get_my_card_history":
      return {
        output: JSON.stringify(
          await getMyCardHistory(args.card_name as string, args.set as string | undefined)
        ),
      };

    case "get_card_stats":
      return {
        output: JSON.stringify(await getCardStats(args.card_name as string, args.set as string)),
      };

    case "get_format_top_cards":
      return {
        output: JSON.stringify(
          await getFormatTopCards(args.set as string, args.limit as number | undefined)
        ),
      };

    case "get_deck":
      return { output: JSON.stringify(await getDeck(args.draft_id as string)) };

    case "search_decks":
      return {
        output: JSON.stringify(
          await searchDecks({
            card_name: args.card_name as string,
            in_maindeck: args.in_maindeck as boolean | undefined,
            set: args.set as string | undefined,
            min_wins: args.min_wins as number | undefined,
          })
        ),
      };

    case "analyze_deck_choices":
      return { output: JSON.stringify(await analyzeDeckChoices(args.draft_id as string)) };

    case "get_card_info":
      return {
        output: JSON.stringify(await getCardInfo(args.card_name as string, args.set as string)),
      };

    case "set_user_context": {
      const intent = args.intent as UserContext["intent"];
      const userContext: UserContext = { intent };
      return {
        output: JSON.stringify({ ok: true }),
        userContext,
      };
    }

    case "get_format_meta": {
      const set = args.set as string;
      const eventType = (args.event_type as string | undefined) ?? "PremierDraft";
      const [colorStats, playDraw] = await Promise.all([
        getFormatColorStats(set, eventType),
        getFormatPlayDraw(set, eventType),
      ]);
      return {
        output: JSON.stringify({
          color_stats: colorStats,
          play_draw: playDraw,
        }),
      };
    }

    case "get_trophy_decks": {
      const set = args.set as string;
      const colors = args.colors as string | undefined;
      const limit = (args.limit as number | undefined) ?? 5;
      const decklists = await getTrophyDecklists(set, colors, limit);
      return { output: JSON.stringify(decklists) };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
