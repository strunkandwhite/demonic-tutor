"use client";

import { TOOL_LABELS, isValidToolName } from "@/core/llm/tools";

export interface ToolCallInfo {
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

function labelFor(name: string): string {
  return isValidToolName(name) ? TOOL_LABELS[name] : name;
}

function formatArguments(args: Record<string, unknown>): string {
  const entries = Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== "");

  if (entries.length === 0) return "";

  return entries
    .slice(0, 3)
    .map(([k, v]) => {
      const value = typeof v === "string" ? v : JSON.stringify(v);
      const truncated = value.length > 20 ? value.slice(0, 20) + "..." : value;
      return `${k}: ${truncated}`;
    })
    .join(", ");
}

interface ToolCallIndicatorProps {
  activeToolCalls: ToolCallInfo[];
  completedToolCalls: ToolCallInfo[];
}

export function ToolCallIndicator({ activeToolCalls, completedToolCalls }: ToolCallIndicatorProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800">
        <div className="space-y-1.5">
          {/* Completed tool calls */}
          {completedToolCalls.map((tc) => {
            const argsStr = formatArguments(tc.arguments);
            return (
              <div key={tc.call_id} className="flex items-center gap-2">
                <div className="flex h-4 w-4 items-center justify-center text-xs text-zinc-400 dark:text-zinc-500">
                  ✓
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  <span>{labelFor(tc.name)}</span>
                  {argsStr && <span className="ml-1">({argsStr})</span>}
                </div>
              </div>
            );
          })}

          {/* Active tool calls */}
          {activeToolCalls.map((tc) => {
            const argsStr = formatArguments(tc.arguments);
            return (
              <div key={tc.call_id} className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300" />
                <div className="text-sm text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium">{labelFor(tc.name)}</span>
                  {argsStr && (
                    <span className="ml-1 text-zinc-500 dark:text-zinc-400">({argsStr})</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Thinking indicator when no active tool calls */}
          {activeToolCalls.length === 0 && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300" />
              <span className="text-sm text-zinc-500 dark:text-zinc-400">Thinking...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
