import { describe, expect, it } from "vitest";
import { safeUrlTransform } from "./safeUrlTransform";

describe("safeUrlTransform", () => {
  it("passes through https URLs", () => {
    expect(safeUrlTransform("https://example.com")).toBe("https://example.com");
  });

  it("passes through http URLs", () => {
    expect(safeUrlTransform("http://example.com")).toBe("http://example.com");
  });

  it("passes through card: scheme", () => {
    expect(safeUrlTransform("card:Lightning Bolt")).toBe("card:Lightning Bolt");
    expect(safeUrlTransform("card:Sheoldred%2C%20the%20Apocalypse")).toBe(
      "card:Sheoldred%2C%20the%20Apocalypse"
    );
  });

  it("passes through mailto:", () => {
    expect(safeUrlTransform("mailto:foo@bar.com")).toBe("mailto:foo@bar.com");
  });

  it("strips javascript: scheme", () => {
    expect(safeUrlTransform("javascript:alert(1)")).toBe("");
    expect(safeUrlTransform("JavaScript:alert(1)")).toBe("");
  });

  it("strips data: scheme", () => {
    expect(safeUrlTransform("data:text/html,<script>alert(1)</script>")).toBe("");
  });

  it("strips vbscript: scheme", () => {
    expect(safeUrlTransform("vbscript:msgbox(1)")).toBe("");
  });

  it("strips file: scheme", () => {
    expect(safeUrlTransform("file:///etc/passwd")).toBe("");
  });

  it("allows root-relative paths", () => {
    expect(safeUrlTransform("/draft/abc123")).toBe("/draft/abc123");
  });

  it("allows fragment refs", () => {
    expect(safeUrlTransform("#section")).toBe("#section");
  });
});
