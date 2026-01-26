/**
 * API authentication utilities.
 */

import { NextRequest, NextResponse } from "next/server";

const API_SECRET = process.env.API_SECRET;

interface AuthErrorResponse {
  error: string;
}

/**
 * Validates the API request has a valid Bearer token.
 * If API_SECRET is not set, authentication is disabled (development mode).
 * Returns null if valid, or an error response if invalid.
 */
export function validateAuth(request: NextRequest): NextResponse<AuthErrorResponse> | null {
  // If no API_SECRET configured, skip auth (development mode)
  if (!API_SECRET) {
    return null;
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader) {
    return NextResponse.json({ error: "Authorization header required" }, { status: 401 });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Invalid authorization format" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  if (token !== API_SECRET) {
    return NextResponse.json({ error: "Invalid API token" }, { status: 401 });
  }

  return null;
}
