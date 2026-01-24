/**
 * Structured output types for draft analysis.
 *
 * These types define the contracts for machine-readable output
 * that the LLM returns alongside human-readable commentary.
 */

/**
 * A key pivot point in the draft where the player made a
 * significant directional decision.
 */
export interface KeyPivot {
  /** The pick reference (e.g., "P1P3") */
  pick: string;
  /** Description of the pivot and its implications */
  description: string;
  /** Confidence in this being a true pivot point (0-1) */
  confidence: number;
}

/**
 * An identified issue or mistake in the draft.
 */
export interface DraftIssue {
  /** Unique identifier for the issue */
  id: string;
  /** Category of the issue */
  category: "draft_navigation" | "card_evaluation" | "deck_construction";
  /** How impactful this issue was */
  severity: "low" | "medium" | "high";
  /** Evidence supporting the issue */
  evidence: {
    /** Pick reference (e.g., "P1P5"), null for deck construction issues */
    pick: string | null;
    /** The card that was picked, null for deck construction issues */
    picked: string | null;
    /** Notable alternatives that were passed or should be considered */
    notable_alternatives: string[];
  };
  /** Explanation of why this is an issue */
  rationale: string;
  /** What to do differently */
  recommendation: string;
  /** Confidence in this assessment (0-1) */
  confidence: number;
}

/**
 * A takeaway rule for future drafts.
 */
export interface NextTimeRule {
  /** The rule to follow */
  rule: string;
  /** When to apply this rule */
  when: string;
  /** Why this rule matters */
  why: string;
}

/**
 * Structured output for draft critique and mistake analysis.
 *
 * Returned in a ```mistake_report JSON block when analyzing picks.
 */
export interface MistakeReport {
  /** Overall confidence in this analysis (0-1) */
  overall_confidence: number;
  /** Whether analysis covers picks only or includes deck construction */
  scope: "picks_only" | "picks_and_deck";
  /** Key decision points that shaped the draft */
  key_pivots: KeyPivot[];
  /** Identified issues or mistakes */
  issues: DraftIssue[];
  /** Actionable rules for future drafts */
  next_time_rules: NextTimeRule[];
}

/**
 * Mana curve breakdown by CMC.
 */
export interface CurveAnalysis {
  /** 1-drops */
  one: number;
  /** 2-drops */
  two: number;
  /** 3-drops */
  three: number;
  /** 4-drops */
  four: number;
  /** 5+ drops */
  five_plus: number;
}

/**
 * Assessment of splash viability and risk.
 */
export interface SplashRisk {
  /** Risk level for the splash */
  level: "low" | "medium" | "high";
  /** Reasons for the risk assessment */
  reasons: string[];
}

/**
 * A suggested card to cut from the deck.
 */
export interface SuggestedCut {
  /** Name of the card to cut */
  card_name: string;
  /** Why this card should be cut */
  reason: string;
}

/**
 * A suggested card to add to the deck.
 */
export interface SuggestedAdd {
  /** Name of the card to add */
  card_name: string;
  /** Why this card should be added */
  reason: string;
}

/**
 * Structured output for deck construction analysis.
 *
 * Returned in a ```deck_audit JSON block when decklist is available.
 */
export interface DeckAudit {
  /** Mana curve breakdown */
  curve: CurveAnalysis;
  /** Number of removal spells in the deck */
  removal_count: number;
  /** Number of mana fixing sources */
  fixing_count: number;
  /** Assessment of splash viability */
  splash_risk: SplashRisk;
  /** Cards that should be cut */
  suggested_cuts: SuggestedCut[];
  /** Cards from the pool that should be added */
  suggested_adds: SuggestedAdd[];
}
