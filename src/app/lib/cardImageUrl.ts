/**
 * Resolve an image URL for a Magic card.
 *
 * Prefers a cached `image_url` (set by the augment job) so we serve directly
 * from a CDN instead of a 302 round-trip through the Scryfall `/cards/named`
 * API. Falls back to the Scryfall API URL when image_url is missing — name
 * is normalized to strip trailing numeric suffixes ("Scalding Tarn 2" →
 * "Scalding Tarn") so duplicate-pick column labels don't break the lookup.
 */
export function cardImageUrl(card: { name: string; image_url?: string | null }): string {
  if (card.image_url) return card.image_url;
  const normalized = card.name.replace(/\s+\d+$/, "").trim();
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(normalized)}&format=image`;
}
