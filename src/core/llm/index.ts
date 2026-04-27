export { chat, chatStream, AVAILABLE_MODELS, type ModelId } from "./client";
export type {
  StreamEvent,
  ToolCallStartEvent,
  ToolCallCompleteEvent,
  FinalResponseEvent,
  ErrorEvent,
} from "./stream-types";
export { tools, isValidToolName, type ToolName, type UserContext, type UserIntent } from "./tools";
export { executeToolCall, type ToolCallResult } from "./handlers";
