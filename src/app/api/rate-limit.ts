/**
 * Simple in-memory rate limiter using sliding window.
 */

import { NextResponse } from "next/server";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RequestRecord {
  timestamps: number[];
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 30, // 30 requests per minute
};

// In-memory store (resets on server restart)
const requestStore = new Map<string, RequestRecord>();

function getClientId(request: Request): string {
  // Use IP or fallback to a default for local development
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0].trim() ?? "127.0.0.1";
  return ip;
}

function cleanOldTimestamps(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((ts) => ts > cutoff);
}

interface RateLimitResult {
  allowed: boolean;
  /**
   * Number of requests still permitted in the current window. Surfaced to
   * clients via the X-RateLimit-Remaining response header on success.
   */
  remaining: number;
  resetMs: number;
}

export function checkRateLimit(
  request: Request,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  const clientId = getClientId(request);
  const now = Date.now();

  let record = requestStore.get(clientId);
  if (!record) {
    record = { timestamps: [] };
    requestStore.set(clientId, record);
  }

  // Clean old timestamps
  record.timestamps = cleanOldTimestamps(record.timestamps, config.windowMs);

  const remaining = Math.max(0, config.maxRequests - record.timestamps.length);
  const oldestTimestamp = record.timestamps[0] ?? now;
  const resetMs = oldestTimestamp + config.windowMs - now;

  if (record.timestamps.length >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetMs };
  }

  // Add current request
  record.timestamps.push(now);

  return { allowed: true, remaining: remaining - 1, resetMs: config.windowMs };
}

export function rateLimitResponse(resetMs: number): NextResponse<{ error: string }> {
  return NextResponse.json(
    { error: "Too many requests, please try again later" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(resetMs / 1000)),
      },
    }
  );
}
