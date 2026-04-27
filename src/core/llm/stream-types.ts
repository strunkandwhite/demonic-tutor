/**
 * Server-Sent Events types for streaming chat responses.
 */

import type { UserContext } from "./tools";

export interface TextDeltaEvent {
  type: "text_delta";
  delta: string;
}

export interface ToolCallStartEvent {
  type: "tool_call_start";
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallCompleteEvent {
  type: "tool_call_complete";
  call_id: string;
}

export interface FinalResponseEvent {
  type: "final_response";
  text: string;
  responseId: string;
  model: string;
  userContext?: UserContext;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type StreamEvent =
  | TextDeltaEvent
  | ToolCallStartEvent
  | ToolCallCompleteEvent
  | FinalResponseEvent
  | ErrorEvent;
