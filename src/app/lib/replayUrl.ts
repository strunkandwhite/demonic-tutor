/**
 * Build the public 17lands replay URL for a game, or null if the path
 * looks unsafe (e.g. doesn't start with "/" — which would let a malformed
 * value escape the 17lands.com base, like `replay_link = "//attacker"`).
 */
const SEVENTEEN_LANDS_BASE = "https://www.17lands.com";

export function replayUrl(game: { replay_link: string | null }): string | null {
  const path = game.replay_link;
  if (!path) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return `${SEVENTEEN_LANDS_BASE}${path}`;
}
