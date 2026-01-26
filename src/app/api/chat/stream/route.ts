import { NextRequest } from "next/server";
import { chatStream, AVAILABLE_MODELS, type ModelId } from "@/core/llm";
import type { UserContext } from "@/core/llm/tools";

interface ChatStreamRequest {
  message: string;
  model?: ModelId;
  previousResponseId?: string;
  userContext?: UserContext;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ChatStreamRequest;

  if (!body.message || typeof body.message !== "string") {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const model: ModelId =
    body.model && AVAILABLE_MODELS.includes(body.model) ? body.model : "gpt-5.2-2025-12-11";

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of chatStream(
          body.message,
          model,
          body.previousResponseId,
          body.userContext
        )) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }
      } catch (err) {
        const errorEvent = {
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
