import { describe, expect, it } from "vitest";
import { isTrophy } from "./isTrophy";

describe("isTrophy", () => {
  it("counts Bo1 7-x as a trophy", () => {
    expect(isTrophy({ wins: 7, losses: 0 })).toBe(true);
    expect(isTrophy({ wins: 7, losses: 1 })).toBe(true);
    expect(isTrophy({ wins: 7, losses: 2 })).toBe(true);
  });

  it("counts Bo3 3-0 as a trophy", () => {
    expect(isTrophy({ wins: 3, losses: 0 })).toBe(true);
  });

  it("does not count Bo3 3-1 or 3-2 as a trophy", () => {
    expect(isTrophy({ wins: 3, losses: 1 })).toBe(false);
    expect(isTrophy({ wins: 3, losses: 2 })).toBe(false);
  });

  it("does not count near-misses or losses", () => {
    expect(isTrophy({ wins: 6, losses: 3 })).toBe(false);
    expect(isTrophy({ wins: 4, losses: 3 })).toBe(false);
    expect(isTrophy({ wins: 2, losses: 3 })).toBe(false);
    expect(isTrophy({ wins: 0, losses: 3 })).toBe(false);
  });
});
