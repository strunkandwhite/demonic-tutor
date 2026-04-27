import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "./origin-check";

function makeRequest(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request("https://example.com/api/chat/stream", {
    method: "POST",
    headers,
  });
}

describe("assertSameOrigin", () => {
  it("returns null on matching origin", () => {
    const result = assertSameOrigin(makeRequest("https://demonic.example"), {
      SITE_ORIGIN: "https://demonic.example",
      NODE_ENV: "production",
    });
    expect(result).toBeNull();
  });

  it("returns 403 on mismatched origin", () => {
    const result = assertSameOrigin(makeRequest("https://attacker.example"), {
      SITE_ORIGIN: "https://demonic.example",
      NODE_ENV: "production",
    });
    expect(result?.status).toBe(403);
  });

  it("returns 403 on missing Origin in production", () => {
    const result = assertSameOrigin(makeRequest(null), {
      SITE_ORIGIN: "https://demonic.example",
      NODE_ENV: "production",
    });
    expect(result?.status).toBe(403);
  });

  it("returns null on missing Origin in dev (tolerate curl/Postman)", () => {
    const result = assertSameOrigin(makeRequest(null), {
      SITE_ORIGIN: "https://demonic.example",
      NODE_ENV: "development",
    });
    expect(result).toBeNull();
  });

  it("returns 500 in production when SITE_ORIGIN is unset", () => {
    const result = assertSameOrigin(makeRequest("https://anything"), {
      NODE_ENV: "production",
    });
    expect(result?.status).toBe(500);
  });

  it("uses VERCEL_ENV over NODE_ENV when set", () => {
    // VERCEL_ENV=preview means non-production even if NODE_ENV=production.
    const result = assertSameOrigin(makeRequest(null), {
      SITE_ORIGIN: "https://demonic.example",
      VERCEL_ENV: "preview",
      NODE_ENV: "production",
    });
    expect(result).toBeNull();
  });
});
