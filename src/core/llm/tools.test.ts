import { describe, it, expect } from "vitest";
import { deriveArchetypeTags } from "./archetype-tags";
import { tools, isValidToolName } from "./tools";
import { executeToolCall } from "./handlers";

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

describe("set_user_context tool", () => {
  describe("tool definition", () => {
    it("exists in tools array", () => {
      const tool = tools.find((t) => t.type === "function" && t.name === "set_user_context");
      expect(tool).toBeDefined();
    });

    it("has correct parameter schema", () => {
      const tool = tools.find(
        (t) => t.type === "function" && t.name === "set_user_context"
      ) as Extract<(typeof tools)[number], { type: "function" }>;
      expect(tool).toBeDefined();

      const params = tool.parameters as Record<string, unknown>;
      expect(params.required).toContain("intent");

      const properties = params.properties as Record<string, unknown>;
      const intent = properties.intent as Record<string, unknown>;
      const intentProps = intent.properties as Record<string, unknown>;

      expect(intentProps.mode).toBeDefined();
      expect(intentProps.forced_archetype).toBeDefined();
      expect(intentProps.constraints).toBeDefined();
    });

    it("includes all mode options", () => {
      const tool = tools.find(
        (t) => t.type === "function" && t.name === "set_user_context"
      ) as Extract<(typeof tools)[number], { type: "function" }>;

      const params = tool.parameters as Record<string, unknown>;
      const properties = params.properties as Record<string, unknown>;
      const intent = properties.intent as Record<string, unknown>;
      const intentProps = intent.properties as Record<string, unknown>;
      const mode = intentProps.mode as Record<string, unknown>;

      expect(mode.enum).toEqual([
        "maximize_wins",
        "learn_signals",
        "force_archetype",
        "rare_draft",
        "experiment",
      ]);
    });
  });

  describe("isValidToolName", () => {
    it("returns true for set_user_context", () => {
      expect(isValidToolName("set_user_context")).toBe(true);
    });

    it("returns false for invalid tool names", () => {
      expect(isValidToolName("invalid_tool")).toBe(false);
    });

    it("returns true for every name in the tools array (parity)", () => {
      for (const t of tools) {
        expect(isValidToolName(t.name)).toBe(true);
      }
    });
  });

  describe("executeToolCall", () => {
    it("returns ok: true and userContext for set_user_context", async () => {
      const args = {
        intent: {
          mode: "maximize_wins",
          forced_archetype: null,
          constraints: ["avoid_blue"],
        },
      };

      const result = await executeToolCall("set_user_context", args);

      expect(JSON.parse(result.output)).toEqual({ ok: true });
      expect(result.userContext).toEqual({
        intent: {
          mode: "maximize_wins",
          forced_archetype: null,
          constraints: ["avoid_blue"],
        },
      });
    });

    it("handles force_archetype mode with archetype set", async () => {
      const args = {
        intent: {
          mode: "force_archetype",
          forced_archetype: "WG Kithkin",
          constraints: ["splash_ok"],
        },
      };

      const result = await executeToolCall("set_user_context", args);

      expect(result.userContext).toEqual({
        intent: {
          mode: "force_archetype",
          forced_archetype: "WG Kithkin",
          constraints: ["splash_ok"],
        },
      });
    });

    it("handles empty constraints array", async () => {
      const args = {
        intent: {
          mode: "learn_signals",
          forced_archetype: null,
          constraints: [],
        },
      };

      const result = await executeToolCall("set_user_context", args);

      expect(result.userContext?.intent.constraints).toEqual([]);
    });
  });
});
