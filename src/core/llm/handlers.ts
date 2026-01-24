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
} from "../db/queries";
import type { ToolName } from "./tools";

export async function executeToolCall(
  name: ToolName,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "list_drafts":
      return JSON.stringify(await listDrafts(args));

    case "get_draft":
      return JSON.stringify(await getDraft(args.draft_id as string));

    case "get_my_stats":
      return JSON.stringify(await getMyStats(args));

    case "get_my_card_history":
      return JSON.stringify(
        await getMyCardHistory(args.card_name as string, args.set as string | undefined)
      );

    case "get_card_stats":
      return JSON.stringify(await getCardStats(args.card_name as string, args.set as string));

    case "get_format_top_cards":
      return JSON.stringify(
        await getFormatTopCards(args.set as string, args.limit as number | undefined)
      );

    case "get_deck":
      return JSON.stringify(await getDeck(args.draft_id as string));

    case "search_decks":
      return JSON.stringify(
        await searchDecks({
          card_name: args.card_name as string,
          in_maindeck: args.in_maindeck as boolean | undefined,
          set: args.set as string | undefined,
          min_wins: args.min_wins as number | undefined,
        })
      );

    case "analyze_deck_choices":
      return JSON.stringify(await analyzeDeckChoices(args.draft_id as string));

    case "get_card_info":
      return JSON.stringify(await getCardInfo(args.card_name as string, args.set as string));

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
