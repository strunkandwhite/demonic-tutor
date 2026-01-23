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
      return JSON.stringify(
        await getCardStats(args.card_name as string, args.set as string)
      );

    case "get_format_top_cards":
      return JSON.stringify(
        await getFormatTopCards(args.set as string, args.limit as number | undefined)
      );

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
