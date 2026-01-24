import { describe, it, expect } from "vitest";
import { deriveArchetypeTags } from "./archetype-tags";

describe("deriveArchetypeTags", () => {
  describe("creature type extraction", () => {
    it("extracts Kithkin from creature types", () => {
      const tags = deriveArchetypeTags("Creature — Kithkin Soldier", null);
      expect(tags).toContain("Kithkin");
    });

    it("extracts Merfolk from creature types", () => {
      const tags = deriveArchetypeTags("Creature — Merfolk Wizard", null);
      expect(tags).toContain("Merfolk");
    });

    it("extracts Faerie from creature types", () => {
      const tags = deriveArchetypeTags("Creature — Faerie Rogue", null);
      expect(tags).toContain("Faerie");
    });

    it("extracts multiple creature types", () => {
      const tags = deriveArchetypeTags("Creature — Elf Warrior", null);
      expect(tags).toContain("Elf");
      expect(tags).toContain("Warrior");
    });

    it("handles non-creature types gracefully", () => {
      const tags = deriveArchetypeTags("Instant", null);
      expect(tags).not.toContain("Kithkin");
    });
  });

  describe("oracle text pattern matching", () => {
    it("tags Removal for destroy effects", () => {
      const tags = deriveArchetypeTags("Instant", "Destroy target creature.");
      expect(tags).toContain("Removal");
    });

    it("tags Removal for exile effects", () => {
      const tags = deriveArchetypeTags("Instant", "Exile target creature.");
      expect(tags).toContain("Removal");
    });

    it("tags Removal for damage-based removal", () => {
      const tags = deriveArchetypeTags("Instant", "Deal 3 damage to target creature.");
      expect(tags).toContain("Removal");
    });

    it("tags Fixing for mana abilities", () => {
      const tags = deriveArchetypeTags("Land", "{T}: Add one mana of any color.");
      expect(tags).toContain("Fixing");
    });

    it("tags Fixing for search land effects", () => {
      const tags = deriveArchetypeTags("Sorcery", "Search your library for a basic land card.");
      expect(tags).toContain("Fixing");
    });

    it("tags Draw for card draw effects", () => {
      const tags = deriveArchetypeTags("Instant", "Draw two cards.");
      expect(tags).toContain("Draw");
    });

    it("tags Counter for counterspell effects", () => {
      const tags = deriveArchetypeTags("Instant", "Counter target spell.");
      expect(tags).toContain("Counter");
    });

    it("tags Evasion for flying", () => {
      const tags = deriveArchetypeTags("Creature — Bird", "Flying");
      expect(tags).toContain("Evasion");
    });

    it("tags Evasion for unblockable", () => {
      const tags = deriveArchetypeTags("Creature — Rogue", "This creature can't be blocked.");
      expect(tags).toContain("Evasion");
    });

    it("tags Ramp for add mana effects on non-lands", () => {
      const tags = deriveArchetypeTags("Creature — Elf", "{T}: Add {G}.");
      expect(tags).toContain("Ramp");
    });

    it("handles null oracle text", () => {
      const tags = deriveArchetypeTags("Creature — Goblin", null);
      expect(tags).not.toContain("Removal");
    });

    it("detects multiple tags from complex cards", () => {
      const tags = deriveArchetypeTags(
        "Creature — Faerie Wizard",
        "Flying\nWhen this creature enters, draw a card."
      );
      expect(tags).toContain("Faerie");
      expect(tags).toContain("Wizard");
      expect(tags).toContain("Evasion");
      expect(tags).toContain("Draw");
    });
  });

  describe("deduplication", () => {
    it("does not duplicate tags", () => {
      const tags = deriveArchetypeTags(
        "Instant",
        "Destroy target creature. Destroy another target creature."
      );
      const removalCount = tags.filter((t) => t === "Removal").length;
      expect(removalCount).toBe(1);
    });
  });
});
