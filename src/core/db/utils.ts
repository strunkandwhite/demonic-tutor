/**
 * Parses the available_cards JSON string from picks table.
 */
export function parseAvailableCards(json: string): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}
