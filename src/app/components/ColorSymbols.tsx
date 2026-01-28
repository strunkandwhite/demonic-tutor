/**
 * Mana symbol rendering for deck colors.
 * Uses local SVG files (downloaded from Scryfall).
 * Uppercase = main colors (larger), lowercase = splashes (smaller).
 */

interface ColorSymbolsProps {
  colors: string | null;
  /** sm = 10px (inline), md = 12-16px (default) */
  size?: "sm" | "md";
}

export function ColorSymbols({ colors, size = "md" }: ColorSymbolsProps) {
  if (!colors) {
    return <span className="text-zinc-400 dark:text-zinc-500">-</span>;
  }

  // Parse each character: uppercase = main color, lowercase = splash
  const symbols = colors.split("").map((char) => ({
    color: char.toUpperCase(),
    isSplash: char === char.toLowerCase(),
  }));

  // Size variants
  const baseSize = size === "sm" ? 10 : 16;
  const splashSize = size === "sm" ? 8 : 12;

  return (
    <span className="inline-flex items-center gap-0.5">
      {symbols.map((sym, i) => (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={i}
          src={`/mana/${sym.color}.svg`}
          alt={sym.color}
          width={sym.isSplash ? splashSize : baseSize}
          height={sym.isSplash ? splashSize : baseSize}
          className={sym.isSplash ? "inline-block opacity-60" : "inline-block"}
        />
      ))}
    </span>
  );
}
