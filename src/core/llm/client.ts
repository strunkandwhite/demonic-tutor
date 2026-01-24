/**
 * OpenAI LLM client with tool support.
 */

import OpenAI from "openai";
import { tools, isValidToolName, type UserContext } from "./tools";
import { executeToolCall } from "./handlers";

const SYSTEM_PROMPT = `You are an experienced limited Magic player acting as a draft coach. You've played thousands of drafts and understand format dynamics deeply - how speed, removal density, and bomb prevalence shape pick orders.

Your approach is Socratic: when reviewing drafts or discussing decisions, ask questions first to understand the player's reasoning before providing analysis. Their answer should shape your response. Don't lecture - engage in dialogue.

When analyzing drafts or performance:

**Pick analysis**: Compare picks to ATA (Average Taken At). Flag significant deviations - both reaches and passes. Ask why before judging.

**Archetype coherence**: Assess whether the deck had a clear plan. Identify picks that fought against the archetype or diluted the strategy.

**Pattern correlation**: Look for tendencies that correlate with results. Which colors, archetypes, or pick patterns lead to better/worse outcomes?

**Format benchmarks**: Compare the player's stats to format averages. Identify where they over/underperform expectations.

When answering questions:
- Fetch relevant data before responding using the available tools
- Combine tools for richer analysis: pair card history with format stats, cross-reference draft picks with overall color performance
- Cite sources: [draft:ID] for specific drafts, [stats:SET] for format data
- When comparing to format data, specify the sample context

Be concise. You're talking to an experienced player who understands limited concepts. Skip explanations of basics like BREAD, format speed, or signal reading unless specifically asked. Focus on insights, not education.

## Structured Output for Draft Analysis

When critiquing picks or analyzing a draft, provide BOTH human-readable commentary AND a structured \`mistake_report\` in a fenced JSON block. Always lead with your conversational analysis, then include the structured data.

\`\`\`mistake_report
{
  "overall_confidence": 0.85,
  "scope": "picks_only" | "picks_and_deck",
  "key_pivots": [
    { "pick": "P1P3", "description": "Committed to UW after rare", "confidence": 0.9 }
  ],
  "issues": [
    {
      "id": "issue-1",
      "category": "draft_navigation",  // or "card_evaluation" or "deck_construction"
      "severity": "medium",  // or "low" or "high"
      "evidence": {
        "pick": "P1P5",
        "picked": "Card Name",
        "notable_alternatives": ["Alt Card 1", "Alt Card 2"]
      },
      "rationale": "Why this is an issue",
      "recommendation": "What to do instead",
      "confidence": 0.8
    }
  ],
  "next_time_rules": [
    { "rule": "The rule", "when": "When to apply", "why": "Why it matters" }
  ]
}
\`\`\`

When the decklist is available and you're analyzing deck construction, also include a \`deck_audit\` block:

\`\`\`deck_audit
{
  "curve": { "one": 2, "two": 6, "three": 5, "four": 4, "five_plus": 3 },
  "removal_count": 3,
  "fixing_count": 2,
  "splash_risk": { "level": "medium", "reasons": ["reason 1"] },  // level: "low" | "medium" | "high"
  "suggested_cuts": [{ "card_name": "Card", "reason": "Why cut" }],
  "suggested_adds": [{ "card_name": "Card", "reason": "Why add" }]
}
\`\`\`

The structured output enables programmatic analysis while your commentary provides nuance and context. Always include both when doing critique work.`;

export const AVAILABLE_MODELS = ["gpt-5.2-2025-12-11", "gpt-4o-mini"] as const;
export type ModelId = (typeof AVAILABLE_MODELS)[number];

export interface ChatResult {
  text: string;
  responseId: string;
  model: string;
  userContext?: UserContext;
}

function buildInstructions(userContext?: UserContext): string {
  if (!userContext) {
    return SYSTEM_PROMPT;
  }

  const { intent } = userContext;
  const archetypeDesc = intent.forced_archetype || "none";
  const constraintsDesc = intent.constraints.length > 0 ? intent.constraints.join(", ") : "none";

  return `${SYSTEM_PROMPT}

## User Context
The user has established the following intent:
- Mode: ${intent.mode}
- Forced Archetype: ${archetypeDesc}
- Constraints: ${constraintsDesc}`;
}

export async function chat(
  message: string,
  model: ModelId = "gpt-5.2-2025-12-11",
  previousResponseId?: string,
  userContext?: UserContext
): Promise<ChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const openai = new OpenAI({ apiKey });

  const instructions = buildInstructions(userContext);
  const response = await openai.responses.create({
    model,
    instructions,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    input: message,
    tools,
  });

  // Handle tool calls
  let currentResponse = response;
  let newUserContext: UserContext | undefined = userContext;

  while (currentResponse.output.some((o) => o.type === "function_call")) {
    const toolResults: OpenAI.Responses.ResponseInputItem[] = [];

    for (const output of currentResponse.output) {
      if (output.type === "function_call") {
        const name = output.name;
        if (!isValidToolName(name)) {
          toolResults.push({
            type: "function_call_output",
            call_id: output.call_id,
            output: JSON.stringify({ error: `Unknown tool: ${name}` }),
          });
          continue;
        }

        const args = JSON.parse(output.arguments);
        const result = await executeToolCall(name, args);
        toolResults.push({
          type: "function_call_output",
          call_id: output.call_id,
          output: result.output,
        });

        // Capture userContext if set_user_context was called
        if (result.userContext) {
          newUserContext = result.userContext;
        }
      }
    }

    currentResponse = await openai.responses.create({
      model,
      previous_response_id: currentResponse.id,
      input: toolResults,
      tools,
    });
  }

  const textOutput = currentResponse.output.find((o) => o.type === "message");
  const text =
    textOutput?.type === "message"
      ? textOutput.content.map((c) => (c.type === "output_text" ? c.text : "")).join("")
      : "";

  return {
    text,
    responseId: currentResponse.id,
    model,
    userContext: newUserContext,
  };
}
