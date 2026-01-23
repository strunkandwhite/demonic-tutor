"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ModelId = "gpt-4o-mini" | "gpt-5.2-2025-12-11";

const MODELS: { id: ModelId; label: string }[] = [
  { id: "gpt-5.2-2025-12-11", label: "GPT-5.2" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

let messageIdCounter = 0;
function generateMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>("gpt-5.2-2025-12-11");

  // Refs for auto-scrolling and textarea auto-resize
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll so the last user message is near the top when messages change
  useEffect(() => {
    const container = messagesContainerRef.current;
    const lastUserMessage = lastUserMessageRef.current;
    if (container && lastUserMessage) {
      const containerRect = container.getBoundingClientRect();
      const messageRect = lastUserMessage.getBoundingClientRect();
      const visibleOffset = messageRect.top - containerRect.top;
      const topPadding = 16;
      container.scrollTop += visibleOffset - topPadding;
    }
  }, [messages]);

  // Auto-resize textarea to fit content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [input]);

  const sendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || loading) return;

    const userMessage: Message = {
      id: generateMessageId(),
      role: "user",
      content: trimmedInput,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmedInput, model }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      const assistantMessage: Message = {
        id: generateMessageId(),
        role: "assistant",
        content: data.text,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [input, loading, model]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage();
    },
    [sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Submit on Enter (without Shift for multiline support)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return (
    <div className="flex h-[400px] flex-col rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">Ask about your drafts</h2>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as ModelId)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200 dark:focus:ring-zinc-500"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        role="log"
        aria-live="polite"
        aria-busy={loading}
        className="flex-1 overflow-y-auto p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-center text-sm text-zinc-400 dark:text-zinc-500">
              Try: &quot;How am I doing in FIN?&quot; or &quot;What&apos;s my best color pair?&quot;
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => {
              const isLastUserMessage =
                message.role === "user" &&
                !messages.slice(index + 1).some((m) => m.role === "user");

              return (
                <div
                  key={message.id}
                  ref={isLastUserMessage ? lastUserMessageRef : undefined}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2 ${
                      message.role === "user"
                        ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-600 dark:text-zinc-100"
                        : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    }`}
                  >
                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                    ) : (
                      <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500" />
                    <div
                      className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-500"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 dark:border-red-900 dark:bg-red-950">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="border-t border-zinc-200 p-4 dark:border-zinc-700">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your draft history..."
            disabled={loading}
            rows={1}
            aria-label="Ask a question about your drafts"
            className="max-h-40 flex-1 resize-none overflow-hidden rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-400 dark:focus:ring-zinc-500"
          />
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearConversation}
              aria-label="Clear conversation"
              className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus:ring-zinc-500 dark:focus:ring-offset-zinc-900"
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="cursor-pointer rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-500 dark:focus:ring-zinc-500 dark:focus:ring-offset-zinc-900"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
