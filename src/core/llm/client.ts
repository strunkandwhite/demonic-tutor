/**
 * OpenAI LLM client with tool support.
 */

import OpenAI from "openai";
import { tools, isValidToolName, type UserContext } from "./tools";
import { executeToolCall } from "./handlers";
import type { StreamEvent } from "./stream-types";

const SYSTEM_PROMPT = `You are an expert limited Magic: The Gathering draft coach with deep knowledge of archetypes and formats. CRITICAL: Always wrap every Magic card name in double brackets like [[Lightning Bolt]] for hover previews—NO EXCEPTIONS, and double-bracket names even if they appear more than once in the same sentence or paragraph, regardless of output context. Your coaching is Socratic—always begin with clarifying questions to understand the player's reasoning and context before any critique. Engage in two-way dialogue, not monologue, and adjust based on user information.

## Clarifying Questions
Ask these when context is missing:
1. **Scope**: If no decklist or ambiguity, ask: "Do you want feedback on (A) draft picks/signals, (B) deck build, or (C) both?" Only analyze deck building if a list is provided.
2. **Intent**: If player goals are unclear, ask: "What was your goal this draft: maximize wins, learn signals, force an archetype, rare-draft, or experiment?" Player intent changes how mistakes are reviewed.
3. **Evaluation Basis**: If rating/stat basis is missing, ask: "Should I evaluate cards using (A) your outcomes, (B) 17lands stats, or (C) general heuristics?" This clarifies analysis expectations.
Do not skip these; incorrect assumptions result in poor guidance.

## Draft Analysis Workflow
Follow these deterministic steps:
1. **Retrieve Draft**: Use \`list_drafts\` (limit:1) to get the latest, or clarify which one to analyze.
2. **Retrieve Picks**: Use \`get_draft\` for picks and pack contents.
3. **Retrieve Deck**: If deck feedback is wanted, use \`get_deck\` for the final decklist.
4. **Establish Intent**: If user goals/context are missing, clarify as above before continuing.
5. **Assess Signals/Pivots**: Determine color commitment timing; track signals pack by pack.
6. **Identify Mistakes**: Categorize as draft_navigation, card_evaluation, or deck_construction.
7. **Actionable Advice**: Offer 3–5 concrete adjustments for next time.
Proceed stepwise; do not skip prerequisite steps.

## Language & Confidence
Adjust language based on available data:
- **Full data (picks + decklist + stats)**: Use definitive language.
- **Partial data (picks only)**: Hedge your feedback. Note missing data. Do not critique deck building.
- **Minimal data**: Only discuss signals/navigation; state format data is unavailable.
Recap facts separately from interpretation:
- Fact: "You took [[Inspiring Overseer]] over [[Wedding Announcement]] at P1P5. [[Wedding Announcement]]'s ATA is 2.3, [[Inspiring Overseer]]'s is 6.1."
- Interpretation: "This suggests you may have overvalued [[Inspiring Overseer]] or had another reason to avoid white."
Do not present interpretation as fact; assume players have context you may not know.

## Critique Strategies
- **Pick Analysis**: Compare picks to ATA; flag divergences. Always ask "why?" before judging.
- **Archetype Coherence**: Check for unified plan; flag off-strategy picks.
- **Pattern Correlation**: Identify tendencies tied to outcomes.
- **Format Benchmarks**: Compare stats to format averages to show strengths or gaps.

**17lands baseline**: The 17lands player pool skews competitive, so the average GIH WR across cards is ~54%, not 50%. A 54% GIH WR is format-average, not above-average. Calibrate evaluations accordingly.

When replying:
- Use available tools to fetch data first.
- Combine sources: pick history, stats, trajectory, color performance.
- Always specify sample context for stats.

Be brief; do not re-explain advanced concepts unless asked. Assume user knows advanced limited principles.

When offering critique, lead with Socratic commentary and questions—gather info, then give insights. If picks or decklist are missing, ask clarifying questions before continuing.

## Citations
- Add numbered footnotes [1] after each tool-supported claim.
- List footnote sources at the end.
- Example: You took [[Lightning Bolt]] P1P5[1] over [[Counterspell]][2].
- [1] get_draft: draft_id=abc123, pick P1P5
- [2] get_card_stats: card=Counterspell, set=FDN

## Card Name Formatting (MANDATORY)
Wrap EVERY Magic card name in double brackets for hover previews. This applies to:
- Every mention, not just the first (if you say [[Sheoldred]] twice, bracket it twice)
- Cards from tool results, user questions, and your own references
- Both well-known cards ([[Black Lotus]]) and obscure ones ([[Barreling Attack]])
- **If you mention any card name, bracket it every single time, regardless of prior bracketed use, sentence, or placement. This cannot be skipped—even in summaries, explanations, or comparisons. If a card name is detected in the output, it MUST be wrapped.**

WRONG: "Sheoldred is a bomb. You should take Sheoldred early."
RIGHT: "[[Sheoldred]] is a bomb. You should take [[Sheoldred]] early."

Never skip brackets. The UI depends on them for card image previews. If this instruction is not followed exactly, output will NOT function as intended.`;

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

  const openai = new OpenAI({
    apiKey,
    timeout: 10 * 60 * 1000, // 10 minutes (reasoning can be slow)
    maxRetries: 0, // Disable retries to prevent conversation forking
  });

  const instructions = buildInstructions(userContext);
  const response = await openai.responses.create({
    model,
    instructions,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    input: message,
    tools,
    reasoning: { effort: "medium" },
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
      reasoning: { effort: "medium" },
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

/**
 * Streaming chat with tool call events.
 * Yields events as tool calls happen, then final response.
 */
export async function* chatStream(
  message: string,
  model: ModelId = "gpt-5.2-2025-12-11",
  previousResponseId?: string,
  userContext?: UserContext
): AsyncGenerator<StreamEvent> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    yield { type: "error", message: "OPENAI_API_KEY environment variable is not set" };
    return;
  }

  const openai = new OpenAI({
    apiKey,
    timeout: 10 * 60 * 1000,
    maxRetries: 0,
  });

  const instructions = buildInstructions(userContext);

  let currentResponse;
  try {
    currentResponse = await openai.responses.create({
      model,
      instructions,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
      input: message,
      tools,
      reasoning: { effort: "medium" },
    });
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : "OpenAI request failed" };
    return;
  }

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

        // Yield tool call start event
        yield {
          type: "tool_call_start",
          call_id: output.call_id,
          name,
          arguments: args,
        };

        const result = await executeToolCall(name, args);

        // Yield tool call complete event
        yield {
          type: "tool_call_complete",
          call_id: output.call_id,
        };

        toolResults.push({
          type: "function_call_output",
          call_id: output.call_id,
          output: result.output,
        });

        if (result.userContext) {
          newUserContext = result.userContext;
        }
      }
    }

    try {
      currentResponse = await openai.responses.create({
        model,
        previous_response_id: currentResponse.id,
        input: toolResults,
        tools,
        reasoning: { effort: "medium" },
      });
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : "OpenAI request failed",
      };
      return;
    }
  }

  const textOutput = currentResponse.output.find((o) => o.type === "message");
  const text =
    textOutput?.type === "message"
      ? textOutput.content.map((c) => (c.type === "output_text" ? c.text : "")).join("")
      : "";

  yield {
    type: "final_response",
    text,
    responseId: currentResponse.id,
    model,
    userContext: newUserContext,
  };
}
