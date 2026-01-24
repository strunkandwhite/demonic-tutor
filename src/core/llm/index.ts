export { chat, AVAILABLE_MODELS, type ModelId } from "./client";
export { tools, isValidToolName, type ToolName, type UserContext, type UserIntent } from "./tools";
export { executeToolCall, type ToolCallResult } from "./handlers";
export type {
  MistakeReport,
  DeckAudit,
  KeyPivot,
  DraftIssue,
  NextTimeRule,
  CurveAnalysis,
  SplashRisk,
  SuggestedCut,
  SuggestedAdd,
} from "./types";
