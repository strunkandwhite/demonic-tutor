/**
 * Chat API endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { chat, AVAILABLE_MODELS, type ModelId, type UserContext } from "@/core/llm";
import { validateAuth } from "../auth";
import { checkRateLimit, rateLimitResponse } from "../rate-limit";

interface ChatRequest {
  message: string;
  model?: ModelId;
  previousResponseId?: string;
  userContext?: UserContext;
}

interface ChatResponse {
  text: string;
  responseId: string;
  model: string;
  userContext?: UserContext;
}

interface ErrorResponse {
  error: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ChatResponse | ErrorResponse>> {
  // Validate authentication
  const authError = validateAuth(request);
  if (authError) return authError;

  // Check rate limit
  const rateLimit = checkRateLimit(request);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetMs);
  }

  try {
    const body = (await request.json()) as ChatRequest;

    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'message' field" }, { status: 400 });
    }

    // Validate model if provided
    const model: ModelId =
      body.model && AVAILABLE_MODELS.includes(body.model) ? body.model : "gpt-5.2-2025-12-11";

    const result = await chat(body.message, model, body.previousResponseId, body.userContext);

    return NextResponse.json({
      text: result.text,
      responseId: result.responseId,
      model: result.model,
      userContext: result.userContext,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
