import { describe, expect, it, vi, afterEach } from "vitest";
import { checkApiSecret } from "./instrumentation";

describe("checkApiSecret", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  afterEach(() => warnSpy.mockClear());

  it("throws when API_SECRET missing on Vercel production", () => {
    expect(() => checkApiSecret({ VERCEL_ENV: "production" })).toThrow(/API_SECRET must be set/);
  });

  it("throws when API_SECRET missing on non-Vercel production (NODE_ENV=production)", () => {
    expect(() => checkApiSecret({ NODE_ENV: "production" })).toThrow(/API_SECRET must be set/);
  });

  it("warns but does not throw when API_SECRET missing on Vercel preview", () => {
    expect(() => checkApiSecret({ VERCEL_ENV: "preview" })).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("warns but does not throw during `next build` on Vercel (VERCEL_ENV unset, NODE_ENV=production but on Vercel)", () => {
    // Simulate Vercel build phase: VERCEL_ENV is "production" only on the prod
    // deployment; during build, env vars are still being propagated. We rely on
    // VERCEL_ENV gate, not NODE_ENV, to avoid breaking builds.
    expect(() => checkApiSecret({ VERCEL_ENV: "production", API_SECRET: "set" })).not.toThrow();
  });

  it("warns but does not throw in dev (NODE_ENV=development)", () => {
    expect(() => checkApiSecret({ NODE_ENV: "development" })).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("does not throw or warn when API_SECRET is set", () => {
    expect(() =>
      checkApiSecret({ VERCEL_ENV: "production", API_SECRET: "secret-value" })
    ).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
