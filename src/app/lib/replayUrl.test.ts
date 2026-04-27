import { describe, expect, it } from "vitest";
import { replayUrl } from "./replayUrl";

describe("replayUrl", () => {
  it("builds the URL for a normal /user/game_replay path", () => {
    expect(replayUrl({ replay_link: "/user/game_replay/20260101/abc/0" })).toBe(
      "https://www.17lands.com/user/game_replay/20260101/abc/0"
    );
  });

  it("returns null for null replay_link", () => {
    expect(replayUrl({ replay_link: null })).toBeNull();
  });

  it("rejects empty string", () => {
    expect(replayUrl({ replay_link: "" })).toBeNull();
  });

  it("rejects protocol-relative paths that would escape the base", () => {
    expect(replayUrl({ replay_link: "//attacker.example/path" })).toBeNull();
  });

  it("rejects paths that don't start with /", () => {
    expect(replayUrl({ replay_link: "user/game_replay" })).toBeNull();
    expect(replayUrl({ replay_link: "https://other.example/x" })).toBeNull();
  });
});
