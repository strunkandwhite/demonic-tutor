"use client";

import { useState, useCallback, useRef } from "react";
import type { StreamEvent, FinalResponseEvent, ModelId } from "@/core/llm";
import type { UserContext } from "@/core/llm/tools";
import type { ToolCallInfo } from "@/app/components/ToolCallIndicator";

interface UseChatStreamResult {
  sendMessage: (message: string, onComplete: (result: FinalResponseEvent) => void) => void;
  activeToolCalls: ToolCallInfo[];
  completedToolCalls: ToolCallInfo[];
  isStreaming: boolean;
  error: string | null;
  abort: () => void;
}

export function useChatStream(
  model: ModelId,
  previousResponseId: string | null,
  userContext?: UserContext
): UseChatStreamResult {
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallInfo[]>([]);
  const [completedToolCalls, setCompletedToolCalls] = useState<ToolCallInfo[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (message: string, onComplete: (result: FinalResponseEvent) => void) => {
      setIsStreaming(true);
      setActiveToolCalls([]);
      setCompletedToolCalls([]);
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            model,
            previousResponseId,
            userContext,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              let event: StreamEvent;
              try {
                event = JSON.parse(line.slice(6));
              } catch {
                console.error("Failed to parse SSE event:", line);
                continue;
              }

              switch (event.type) {
                case "tool_call_start":
                  setActiveToolCalls((prev) => [
                    ...prev,
                    {
                      call_id: event.call_id,
                      name: event.name,
                      arguments: event.arguments,
                    },
                  ]);
                  break;

                case "tool_call_complete": {
                  const callId = event.call_id;
                  setActiveToolCalls((prev) => {
                    const completed = prev.find((tc) => tc.call_id === callId);
                    if (completed) {
                      queueMicrotask(() => {
                        setCompletedToolCalls((prevCompleted) => {
                          if (prevCompleted.some((tc) => tc.call_id === callId)) {
                            return prevCompleted;
                          }
                          return [...prevCompleted, completed];
                        });
                      });
                    }
                    return prev.filter((tc) => tc.call_id !== callId);
                  });
                  break;
                }

                case "final_response":
                  setActiveToolCalls([]);
                  onComplete(event);
                  break;

                case "error":
                  setError(event.message);
                  break;
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [model, previousResponseId, userContext]
  );

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { sendMessage, activeToolCalls, completedToolCalls, isStreaming, error, abort };
}
