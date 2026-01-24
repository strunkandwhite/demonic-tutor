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
import type { ToolName, UserContext } from "./tools";

export interface ToolCallResult {
  output: string;
  userContext?: UserContext;
}

export async function executeToolCall(
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

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
