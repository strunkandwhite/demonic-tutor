import { describe, it, expect } from "vitest";
import { parseGameLink, parseGameIdFromS3Path } from "./index";

describe("parseGameLink", () => {
  it("parses valid game links", () => {
    const result = parseGameLink("/user/game_replay/20260122/abc123def456/2");
    expect(result).toEqual({ draftId: "abc123def456", gameNumber: 2 });
  });

  it("parses game links with long draft IDs", () => {
    const result = parseGameLink("/user/game_replay/20260122/8374259f7e0844febbda9a1c1d3dcf18/0");
    expect(result).toEqual({
      draftId: "8374259f7e0844febbda9a1c1d3dcf18",
      gameNumber: 0,
    });
  });

  it("returns null for invalid links", () => {
    expect(parseGameLink("/invalid/path")).toBeNull();
    expect(parseGameLink("")).toBeNull();
    expect(parseGameLink("/user/game_replay/notadate/abc/0")).toBeNull();
  });

  it("returns null for links missing components", () => {
    expect(parseGameLink("/user/game_replay/20260122/abc123")).toBeNull();
    expect(parseGameLink("/user/game_replay/20260122")).toBeNull();
  });
});

describe("parseGameIdFromS3Path", () => {
  it("extracts game ID from valid S3 paths", () => {
    const result = parseGameIdFromS3Path(
      "s3://17lands-game-histories/20260122/ca28ff4f82b74b2d944d0bfe2556727f.json.gz"
    );
    expect(result).toBe("ca28ff4f82b74b2d944d0bfe2556727f");
  });

  it("handles different dates in path", () => {
    const result = parseGameIdFromS3Path(
      "s3://17lands-game-histories/20240820/abc123def456.json.gz"
    );
    expect(result).toBe("abc123def456");
  });

  it("returns null for invalid paths", () => {
    expect(parseGameIdFromS3Path("invalid/path")).toBeNull();
    expect(parseGameIdFromS3Path("")).toBeNull();
    expect(parseGameIdFromS3Path("s3://bucket/file.txt")).toBeNull();
  });

  it("returns null for paths without .json.gz extension", () => {
    expect(parseGameIdFromS3Path("s3://17lands-game-histories/20260122/abc123.json")).toBeNull();
  });
});
