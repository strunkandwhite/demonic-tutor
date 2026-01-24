/**
 * Derives archetype tags from card type line and oracle text.
 */

// Creature types that are relevant for draft archetypes
const RELEVANT_CREATURE_TYPES = [
  "Kithkin",
  "Merfolk",
  "Faerie",
  "Elemental",
  "Giant",
  "Treefolk",
  "Goblin",
  "Elf",
  "Soldier",
  "Knight",
  "Wizard",
  "Rogue",
  "Warrior",
  "Shaman",
  "Cleric",
  "Zombie",
  "Vampire",
  "Spirit",
  "Angel",
  "Demon",
  "Dragon",
  "Dinosaur",
  "Beast",
  "Bird",
  "Cat",
  "Dog",
  "Rat",
  "Mouse",
  "Otter",
  "Raccoon",
  "Squirrel",
  "Frog",
  "Fish",
  "Crab",
  "Insect",
  "Spider",
  "Snake",
  "Lizard",
  "Human",
  "Dwarf",
  "Orc",
  "Minotaur",
  "Centaur",
  "Satyr",
  "Nymph",
  "Dryad",
  "Sphinx",
  "Phoenix",
  "Hydra",
  "Wurm",
  "Horror",
  "Nightmare",
  "Specter",
  "Shade",
  "Imp",
  "Devil",
  "Berserker",
  "Barbarian",
  "Samurai",
  "Ninja",
  "Monk",
  "Pirate",
  "Rebel",
  "Scout",
  "Archer",
  "Assassin",
  "Artificer",
  "Druid",
  "Mage",
  "Necromancer",
  "Warlock",
  "Sorcerer",
];

// Oracle text patterns for functional tags
const TEXT_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  // Removal
  { pattern: /destroy target (creature|planeswalker|permanent)/i, tag: "Removal" },
  { pattern: /exile target (creature|planeswalker|permanent)/i, tag: "Removal" },
  {
    pattern: /deal \d+ damage to (target|any target|a target) (creature|planeswalker)/i,
    tag: "Removal",
  },
  { pattern: /\-\d+\/\-\d+ until end of turn/i, tag: "Removal" },
  { pattern: /gets? \-\d+\/\-\d+/i, tag: "Removal" },
  { pattern: /target creature gets \-\d+\/\-0/i, tag: "Removal" },

  // Fixing/Ramp
  { pattern: /add (one mana of any color|{.}|mana)/i, tag: "Ramp" },
  { pattern: /search your library for a (basic )?land/i, tag: "Fixing" },
  { pattern: /add one mana of any color/i, tag: "Fixing" },

  // Card advantage
  { pattern: /draw (a|an|one|two|three|four|five|\d+) cards?/i, tag: "Draw" },
  { pattern: /scry \d+/i, tag: "Card Selection" },
  { pattern: /surveil \d+/i, tag: "Card Selection" },

  // Counterspells
  { pattern: /counter target spell/i, tag: "Counter" },
  {
    pattern: /counter target (creature|instant|sorcery|artifact|enchantment) spell/i,
    tag: "Counter",
  },

  // Evasion
  { pattern: /\bflying\b/i, tag: "Evasion" },
  { pattern: /\bmenace\b/i, tag: "Evasion" },
  { pattern: /\btrample\b/i, tag: "Evasion" },
  { pattern: /can't be blocked/i, tag: "Evasion" },
  { pattern: /\bskulk\b/i, tag: "Evasion" },
  { pattern: /\bfear\b/i, tag: "Evasion" },
  { pattern: /\bintimidate\b/i, tag: "Evasion" },
  { pattern: /\bshadow\b/i, tag: "Evasion" },

  // Combat tricks
  { pattern: /target creature gets \+\d+\/\+\d+ until end of turn/i, tag: "Combat Trick" },
  { pattern: /creatures you control get \+\d+\/\+\d+ until end of turn/i, tag: "Pump" },

  // Protection/Defense
  { pattern: /\bindestructible\b/i, tag: "Protection" },
  { pattern: /\bhexproof\b/i, tag: "Protection" },
  { pattern: /protection from/i, tag: "Protection" },
  { pattern: /\bward\b/i, tag: "Protection" },

  // Token generation
  { pattern: /create (a|\d+) .* token/i, tag: "Tokens" },

  // Recursion/Reanimation
  { pattern: /return .* from (your )?graveyard/i, tag: "Recursion" },
  { pattern: /put .* from (your )?graveyard/i, tag: "Recursion" },

  // Life gain
  { pattern: /gain \d+ life/i, tag: "Lifegain" },
  { pattern: /\blifelink\b/i, tag: "Lifegain" },

  // Mill
  { pattern: /mill \d+/i, tag: "Mill" },
  { pattern: /put .* cards from .* library into .* graveyard/i, tag: "Mill" },

  // Sacrifice themes
  { pattern: /sacrifice (a|another) creature/i, tag: "Sacrifice" },
  { pattern: /when .* dies/i, tag: "Death Trigger" },
];

/**
 * Derives archetype tags from a card's type line and oracle text.
 * Returns an array of unique tags sorted alphabetically.
 */
export function deriveArchetypeTags(typeLine: string | null, oracleText: string | null): string[] {
  const tags = new Set<string>();

  // Extract creature types from type line
  if (typeLine) {
    // Type line format: "Creature — Kithkin Soldier" or "Legendary Creature — Elf Warrior"
    const dashIndex = typeLine.indexOf("—");
    if (dashIndex !== -1) {
      const subtypes = typeLine.slice(dashIndex + 1).trim();
      for (const creatureType of RELEVANT_CREATURE_TYPES) {
        // Use word boundary matching to avoid partial matches
        const regex = new RegExp(`\\b${creatureType}\\b`, "i");
        if (regex.test(subtypes)) {
          tags.add(creatureType);
        }
      }
    }
  }

  // Match oracle text patterns
  if (oracleText) {
    for (const { pattern, tag } of TEXT_PATTERNS) {
      if (pattern.test(oracleText)) {
        tags.add(tag);
      }
    }
  }

  return Array.from(tags).sort();
}
