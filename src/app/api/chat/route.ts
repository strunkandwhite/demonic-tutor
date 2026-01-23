/**
 * Chat API endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/core/llm";

interface ChatRequest {
  message: string;
}

interface ChatResponse {
  text: string;
  responseId: string;
  model: string;
}

interface ErrorResponse {
  error: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ChatResponse | ErrorResponse>> {
  try {
    const body = (await request.json()) as ChatRequest;

    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'message' field" },
        { status: 400 }
      );
    }

    const result = await chat(body.message);

    return NextResponse.json({
      text: result.text,
      responseId: result.responseId,
      model: result.model,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    if (error instanceof Error) {
      if (error.message.includes("OPENAI_API_KEY")) {
        return NextResponse.json(
          { error: "OpenAI API key not configured" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
