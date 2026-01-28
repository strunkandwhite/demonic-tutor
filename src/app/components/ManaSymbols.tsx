/**
 * Renders color identity symbols from a mana cost string.
 * Extracts unique colors and hybrid pairs, deduplicates.
 * Example: {G/W}{G/W}{G/W} → one GW symbol (green/white card)
 */

interface ManaSymbolsProps {
  manaCost: string | null;
  /** sm = 10px (inline), md = 12-16px (default) */
  size?: "sm" | "md";
}

// WUBRG color order for consistent display
const COLOR_ORDER = ["W", "U", "B", "R", "G"];

// Scryfall hybrid symbol file names (matches their SVG naming)
// Maps sorted color pairs to the correct filename
const HYBRID_FILENAMES: Record<string, string> = {
  UW: "WU",
  WU: "WU",
  BW: "WB",
  WB: "WB",
  BU: "UB",
  UB: "UB",
  RU: "UR",
  UR: "UR",
  BR: "BR",
  RB: "BR",
  BG: "BG",
  GB: "BG",
  GR: "RG",
  RG: "RG",
  RW: "RW",
  WR: "RW",
  GW: "GW",
  WG: "GW",
  GU: "GU",
  UG: "GU",
};

// Regex to match colored mana: {W}, {U}, {B}, {R}, {G}, {C}, or hybrid {X/Y}
const MANA_SYMBOL_REGEX = /\{([WUBRGC]|[WUBRG]\/[WUBRG])\}/g;

/**
 * Extracts color identity from mana cost.
 * Returns unique colors/hybrids that represent the card's color identity.
 */
export function getColorIdentity(manaCost: string): string[] {
  const colors = new Set<string>();
  const hybrids = new Set<string>();
  let match;

  while ((match = MANA_SYMBOL_REGEX.exec(manaCost)) !== null) {
    const symbol = match[1];
    if (symbol.includes("/")) {
      // Hybrid mana - convert to Scryfall filename
      const pair = symbol.replace("/", "");
      const filename = HYBRID_FILENAMES[pair] || pair;
      hybrids.add(filename);
    } else if (symbol !== "C") {
      colors.add(symbol);
    }
  }
  MANA_SYMBOL_REGEX.lastIndex = 0;

  // If we have hybrids, show those. Otherwise show individual colors.
  // Hybrid symbols already indicate the card's color identity.
  if (hybrids.size > 0) {
    return Array.from(hybrids);
  }

  // Sort colors in WUBRG order
  return Array.from(colors).sort((a, b) => COLOR_ORDER.indexOf(a) - COLOR_ORDER.indexOf(b));
}

export function ManaSymbols({ manaCost, size = "md" }: ManaSymbolsProps) {
  // No mana cost (lands, etc.) = colorless
  if (!manaCost) {
    return (
      <span className="inline-flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mana/C.svg"
          alt="C"
          width={size === "sm" ? 10 : 16}
          height={size === "sm" ? 10 : 16}
          className="inline-block"
        />
      </span>
    );
  }

  const identity = getColorIdentity(manaCost);

  // Colorless artifact/spell (has mana cost but no colors)
  if (identity.length === 0) {
    return (
      <span className="inline-flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mana/C.svg"
          alt="C"
          width={size === "sm" ? 10 : 16}
          height={size === "sm" ? 10 : 16}
          className="inline-block"
        />
      </span>
    );
  }

  const iconSize = size === "sm" ? 10 : 16;

  return (
    <span className="inline-flex items-center gap-0.5">
      {identity.map((sym, i) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={i}
          src={`/mana/${sym}.svg`}
          alt={sym}
          width={iconSize}
          height={iconSize}
          className="inline-block"
        />
      ))}
    </span>
  );
}
