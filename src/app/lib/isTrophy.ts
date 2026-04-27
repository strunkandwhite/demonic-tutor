/**
 * A draft is a "trophy" when it's a maxed-out, undefeated-or-near completion.
 * - Bo1 (Premier Draft): 7 wins, any losses 0-2 (you cap at 7 or 3 losses).
 * - Bo3 (Traditional / Cube Bo3): 3 wins, 0 losses (you cap at 3 of either).
 *
 * The 3-0 case can't occur in completed Bo1 drafts (3 wins requires 3 losses
 * to terminate), so this rule is format-agnostic without inspecting `format`.
 */
export function isTrophy(draft: { wins: number; losses: number }): boolean {
  return draft.wins === 7 || (draft.wins === 3 && draft.losses === 0);
}
