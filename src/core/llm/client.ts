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

Be concise. You're talking to an experienced player who understands limited concepts. Skip explanations of basics like BREAD, format speed, or signal reading unless specifically asked. Focus on insights, not education.`;

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
