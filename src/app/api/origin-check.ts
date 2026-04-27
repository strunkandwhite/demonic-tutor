/**
 * Same-origin POST check for state-changing API endpoints.
 *
 * Compares the request's Origin header against process.env.SITE_ORIGIN
 * (a hard-coded env var). We do *not* derive the expected origin from
 * request.url — that always matches by construction and provides no
 * protection.
 */
import { NextResponse } from "next/server";

export function assertSameOrigin(
  request: Request,
  env: Record<string, string | undefined> = process.env
): NextResponse | null {
  const expected = env.SITE_ORIGIN;
  const isProduction = (env.VERCEL_ENV ?? env.NODE_ENV) === "production";

  // In production, refuse to operate without a configured origin.
  if (isProduction && !expected) {
    return NextResponse.json({ error: "SITE_ORIGIN not configured" }, { status: 500 });
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    // Dev: tolerate missing Origin (curl/Postman). Prod: reject.
    if (!isProduction) return null;
    return NextResponse.json({ error: "Origin header required" }, { status: 403 });
  }

  if (expected && origin === expected) return null;

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
