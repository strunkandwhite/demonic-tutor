/**
 * OpenAI function tool definitions.
 */

import type OpenAI from "openai";

/**
 * User intent/context for session persistence.
 */
export interface UserIntent {
  mode: "maximize_wins" | "learn_signals" | "force_archetype" | "rare_draft" | "experiment";
  forced_archetype: string | null;
  constraints: string[];
}

export interface UserContext {
  intent: UserIntent;
  currentDraftId?: string;
}

export const tools: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "list_drafts",
    description: "Find drafts by criteria (set, colors, date range, minimum wins)",
    parameters: {
      type: "object",
      properties: {
        set: { type: "string", description: "Filter by set code (e.g., FIN, DSK)" },
        colors: { type: "string", description: "Filter by colors (e.g., UB, WG)" },
        min_wins: { type: "integer", description: "Minimum wins" },
        date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
        date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        limit: { type: "integer", description: "Max results (default 100)" },
      },
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_draft",
    description: "Get detailed information about a specific draft including all picks",
    parameters: {
      type: "object",
      properties: {
        draft_id: { type: "string", description: "Draft ID" },
      },
      required: ["draft_id"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_my_stats",
    description: "Get aggregate statistics across your drafts",
    parameters: {
      type: "object",
      properties: {
        set: { type: "string", description: "Filter by set code" },
        colors: { type: "string", description: "Filter by colors" },
        date_from: { type: "string", description: "Start date" },
        date_to: { type: "string", description: "End date" },
      },
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_my_card_history",
    description: "Get your history with a specific card - how often you drafted it and results",
    parameters: {
      type: "object",
      properties: {
        card_name: { type: "string", description: "Card name" },
        set: { type: "string", description: "Filter by set code" },
      },
      required: ["card_name"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_card_stats",
    description: "Get 17lands statistics for a card in a specific set (GIH WR, ALSA, ATA)",
    parameters: {
      type: "object",
      properties: {
        card_name: { type: "string", description: "Card name" },
        set: { type: "string", description: "Set code" },
      },
      required: ["card_name", "set"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_format_top_cards",
    description: "Get the top performing cards in a format by GIH win rate",
    parameters: {
      type: "object",
      properties: {
        set: { type: "string", description: "Set code" },
        limit: { type: "integer", description: "Number of cards (default 20)" },
      },
      required: ["set"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_deck",
    description:
      "Get the decklist for a draft, including maindeck and sideboard with full card details",
    parameters: {
      type: "object",
      properties: {
        draft_id: { type: "string", description: "Draft ID" },
      },
      required: ["draft_id"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "search_decks",
    description: "Find drafts where a card was in maindeck or sideboard",
    parameters: {
      type: "object",
      properties: {
        card_name: { type: "string", description: "Card name to search for" },
        in_maindeck: {
          type: "boolean",
          description: "Filter to maindeck only (true) or sideboard only (false)",
        },
        set: { type: "string", description: "Filter by set code" },
        min_wins: { type: "integer", description: "Minimum wins" },
      },
      required: ["card_name"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "analyze_deck_choices",
    description: "Get sideboard cards with their 17lands stats to identify potentially wrong cuts",
    parameters: {
      type: "object",
      properties: {
        draft_id: { type: "string", description: "Draft ID" },
      },
      required: ["draft_id"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_card_info",
    description:
      "Get oracle text and derived archetype tags for a card to reason about synergies and evaluations",
    parameters: {
      type: "object",
      properties: {
        card_name: { type: "string", description: "Card name" },
        set: { type: "string", description: "Set code" },
      },
      required: ["card_name", "set"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "set_user_context",
    description:
      "Set the user's drafting intent and preferences for the session. Call this when the user expresses a specific goal or constraint for their drafts.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "object",
          description: "The user's drafting intent",
          properties: {
            mode: {
              type: "string",
              enum: [
                "maximize_wins",
                "learn_signals",
                "force_archetype",
                "rare_draft",
                "experiment",
              ],
              description:
                "maximize_wins: optimize for trophy rate; learn_signals: focus on reading signals and staying open; force_archetype: commit to a specific archetype; rare_draft: prioritize collecting rares; experiment: try new strategies regardless of win rate",
            },
            forced_archetype: {
              type: "string",
              nullable: true,
              description:
                "Archetype to force (e.g., 'WG Kithkin', 'UB Faeries'). Only relevant when mode is force_archetype.",
            },
            constraints: {
              type: "array",
              items: { type: "string" },
              description:
                "Additional constraints (e.g., 'avoid_blue', 'splash_ok', 'prioritize_2_drops')",
            },
          },
          required: ["mode", "constraints"],
        },
      },
      required: ["intent"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_format_meta",
    description:
      "Get format metagame data including win rates by color pair and play/draw statistics",
    parameters: {
      type: "object",
      properties: {
        set: { type: "string", description: "Set code (e.g., FIN, DSK)" },
        event_type: {
          type: "string",
          description: "Event type (default: PremierDraft)",
        },
      },
      required: ["set"],
    },
    strict: false,
  },
  {
    type: "function",
    name: "get_trophy_decks",
    description: "Get trophy (7-x) decklists from 17lands for a format",
    parameters: {
      type: "object",
      properties: {
        set: { type: "string", description: "Set code (e.g., FIN, DSK)" },
        colors: {
          type: "string",
          description: "Filter by color pair (e.g., UB, WG)",
        },
        limit: {
          type: "integer",
          description: "Max number of decklists to return (default: 5)",
        },
      },
      required: ["set"],
    },
    strict: false,
  },
];

export type ToolName =
  | "list_drafts"
  | "get_draft"
  | "get_my_stats"
  | "get_my_card_history"
  | "get_card_stats"
  | "get_format_top_cards"
  | "get_deck"
  | "search_decks"
  | "analyze_deck_choices"
  | "get_card_info"
  | "set_user_context"
  | "get_format_meta"
  | "get_trophy_decks";

export function isValidToolName(name: string): name is ToolName {
  return [
    "list_drafts",
    "get_draft",
    "get_my_stats",
    "get_my_card_history",
    "get_card_stats",
    "get_format_top_cards",
    "get_deck",
    "search_decks",
    "analyze_deck_choices",
    "get_card_info",
    "set_user_context",
    "get_format_meta",
    "get_trophy_decks",
  ].includes(name);
}
