/**
 * OpenAI LLM client with tool support.
 */

import OpenAI from "openai";
import { tools, isValidToolName } from "./tools";
import { executeToolCall } from "./handlers";

const SYSTEM_PROMPT = `You are a helpful MTG draft analytics assistant. You help users analyze their draft history and performance.

When answering questions:
- Use the available tools to fetch data before responding
- Cite your sources: [draft:ID] for specific drafts, [stats:SET] for format statistics
- Be concise but informative
- If the user asks about their performance, include relevant statistics
- Compare their picks/performance to format averages when relevant`;

export interface ChatResult {
  text: string;
  responseId: string;
  model: string;
}

export async function chat(message: string): Promise<ChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  const openai = new OpenAI({ apiKey });
  const model = "gpt-4o";

  const response = await openai.responses.create({
    model,
    instructions: SYSTEM_PROMPT,
    input: message,
    tools,
  });

  // Handle tool calls
  let currentResponse = response;
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
          output: result,
        });
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
  };
}
