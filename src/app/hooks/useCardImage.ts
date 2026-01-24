/**
 * Hook to get card image URL from Scryfall.
 */
export function useCardImage(cardName: string): string {
  // Normalize: strip numeric suffixes like "Scalding Tarn 2"
  const normalized = cardName.replace(/\s+\d+$/, "").trim();
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(normalized)}&format=image`;
}
