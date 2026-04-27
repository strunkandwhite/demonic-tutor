/**
 * Small DB-related helpers shared across sync layers.
 */

/**
 * Count occurrences of each card id in an array (e.g. a deck group's
 * `cards: number[]` field, where duplicates indicate quantity > 1).
 */
export function countCards(cardIds: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const id of cardIds) {
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}
