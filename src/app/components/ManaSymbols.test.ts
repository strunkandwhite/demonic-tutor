import { describe, it, expect } from "vitest";
import { getColorIdentity } from "./ManaSymbols";

describe("getColorIdentity", () => {
  describe("single color cards", () => {
    it("extracts single color from mono-colored card", () => {
      expect(getColorIdentity("{G}")).toEqual(["G"]);
      expect(getColorIdentity("{W}")).toEqual(["W"]);
      expect(getColorIdentity("{U}")).toEqual(["U"]);
      expect(getColorIdentity("{B}")).toEqual(["B"]);
      expect(getColorIdentity("{R}")).toEqual(["R"]);
    });

    it("deduplicates repeated colors", () => {
      expect(getColorIdentity("{G}{G}")).toEqual(["G"]);
      expect(getColorIdentity("{R}{R}{R}")).toEqual(["R"]);
    });

    it("handles generic mana with single color", () => {
      expect(getColorIdentity("{2}{G}")).toEqual(["G"]);
      expect(getColorIdentity("{4}{U}")).toEqual(["U"]);
    });
  });

  describe("multi-color cards", () => {
    it("extracts multiple colors in WUBRG order", () => {
      expect(getColorIdentity("{W}{U}")).toEqual(["W", "U"]);
      expect(getColorIdentity("{B}{G}")).toEqual(["B", "G"]);
      expect(getColorIdentity("{R}{W}")).toEqual(["W", "R"]);
    });

    it("deduplicates and sorts multi-color cards", () => {
      expect(getColorIdentity("{G}{W}{G}")).toEqual(["W", "G"]);
      expect(getColorIdentity("{U}{R}{U}{R}")).toEqual(["U", "R"]);
    });

    it("handles three+ color cards", () => {
      expect(getColorIdentity("{W}{U}{B}")).toEqual(["W", "U", "B"]);
      expect(getColorIdentity("{R}{G}{W}{U}{B}")).toEqual(["W", "U", "B", "R", "G"]);
    });
  });

  describe("hybrid mana cards", () => {
    it("extracts hybrid as single symbol using Scryfall naming", () => {
      expect(getColorIdentity("{B/G}")).toEqual(["BG"]);
      expect(getColorIdentity("{W/U}")).toEqual(["WU"]);
      expect(getColorIdentity("{G/W}")).toEqual(["GW"]);
    });

    it("deduplicates repeated hybrid symbols", () => {
      // Moon-Vigil Adherents: {G/W}{G/W}{G/W}
      expect(getColorIdentity("{G/W}{G/W}{G/W}")).toEqual(["GW"]);
      expect(getColorIdentity("{B/R}{B/R}")).toEqual(["BR"]);
    });

    it("uses Scryfall hybrid filenames", () => {
      // Allied pairs: WU, UB, BR, RG, GW
      expect(getColorIdentity("{W/U}")).toEqual(["WU"]);
      expect(getColorIdentity("{U/B}")).toEqual(["UB"]);
      expect(getColorIdentity("{B/R}")).toEqual(["BR"]);
      expect(getColorIdentity("{R/G}")).toEqual(["RG"]);
      expect(getColorIdentity("{G/W}")).toEqual(["GW"]);

      // Enemy pairs: WB, UR, BG, RW, GU
      expect(getColorIdentity("{W/B}")).toEqual(["WB"]);
      expect(getColorIdentity("{U/R}")).toEqual(["UR"]);
      expect(getColorIdentity("{B/G}")).toEqual(["BG"]);
      expect(getColorIdentity("{R/W}")).toEqual(["RW"]);
      expect(getColorIdentity("{G/U}")).toEqual(["GU"]);
    });

    it("handles hybrid with generic mana", () => {
      // Stoic Grove-Guide: {4}{B/G}
      expect(getColorIdentity("{4}{B/G}")).toEqual(["BG"]);
      expect(getColorIdentity("{2}{W/B}")).toEqual(["WB"]);
    });
  });

  describe("colorless cards", () => {
    it("returns empty array for pure generic mana", () => {
      expect(getColorIdentity("{1}")).toEqual([]);
      expect(getColorIdentity("{4}")).toEqual([]);
      expect(getColorIdentity("{6}")).toEqual([]);
    });

    it("returns empty array for X costs", () => {
      expect(getColorIdentity("{X}")).toEqual([]);
      expect(getColorIdentity("{X}{X}")).toEqual([]);
    });

    it("returns empty array for colorless mana symbol", () => {
      // {C} is colorless mana (Eldrazi), not a color identity
      expect(getColorIdentity("{C}")).toEqual([]);
      expect(getColorIdentity("{C}{C}")).toEqual([]);
    });

    it("returns empty array for generic + colorless", () => {
      expect(getColorIdentity("{2}{C}")).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("handles complex mana costs", () => {
      // {X}{G}{G} - Hydra-like card
      expect(getColorIdentity("{X}{G}{G}")).toEqual(["G"]);
      // {2}{W}{W}{U}{U} - heavy multicolor
      expect(getColorIdentity("{2}{W}{W}{U}{U}")).toEqual(["W", "U"]);
    });

    it("handles mixed hybrid and regular", () => {
      // If a card somehow has both hybrid and regular colored mana,
      // prefer showing the hybrid
      expect(getColorIdentity("{G/W}{G}")).toEqual(["GW"]);
    });
  });
});
