import { NextRequest, NextResponse } from "next/server";
import { chatStream, AVAILABLE_MODELS, type ModelId, type UserContext } from "@/core/llm";
import { assertSameOrigin } from "../../origin-check";
import { checkRateLimit, rateLimitResponse } from "../../rate-limit";

interface ChatStreamRequest {
  message: string;
  model?: ModelId;
  previousResponseId?: string;
  userContext?: UserContext;
}

export async function POST(request: NextRequest) {
  // Same-origin check (defense against CSRF/cross-site POST)
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  // Check rate limit
  const rateLimit = checkRateLimit(request);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetMs);
  }
  const rateLimitHeaders = {
    "X-RateLimit-Remaining": String(rateLimit.remaining),
  };

  const body = (await request.json()) as ChatStreamRequest;

  if (!body.message || typeof body.message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const model: ModelId =
    body.model && AVAILABLE_MODELS.includes(body.model) ? body.model : "gpt-5.5-2026-04-23";

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
        console.error("Chat stream error:", err);
        const errorEvent = {
          type: "error",
          message: "An unexpected error occurred",
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
      ...rateLimitHeaders,
    },
  });
}
