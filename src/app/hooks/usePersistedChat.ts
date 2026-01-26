"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { UserContext } from "@/core/llm/tools";

const STORAGE_KEY = "demonic-tutor-last-chat";
const CURRENT_VERSION = 1;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface PersistedChat {
  version: number;
  userMessage: Message;
  assistantMessage: Message;
  responseId: string;
  userContext?: UserContext;
  timestamp: number;
}

interface UsePersistedChatResult {
  initialMessages: Message[];
  initialResponseId: string | null;
  initialUserContext: UserContext | undefined;
  saveLastExchange: (
    userMessage: Message,
    assistantMessage: Message,
    responseId: string,
    userContext?: UserContext
  ) => void;
  clearPersistedChat: () => void;
}

const EMPTY_MESSAGES: Message[] = [];

function subscribe() {
  // localStorage doesn't have change events we need to subscribe to
  return () => {};
}

function getSnapshot(): PersistedChat | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed: PersistedChat = JSON.parse(stored);
    if (parsed.version !== CURRENT_VERSION) return null;
    if (!parsed.userMessage?.id || !parsed.assistantMessage?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getServerSnapshot(): null {
  return null;
}

export function usePersistedChat(): UsePersistedChatResult {
  const persistedChat = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const saveLastExchange = useCallback(
    (
      userMessage: Message,
      assistantMessage: Message,
      responseId: string,
      userContext?: UserContext
    ) => {
      const data: PersistedChat = {
        version: CURRENT_VERSION,
        userMessage,
        assistantMessage,
        responseId,
        userContext,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        // Storage full or unavailable
      }
    },
    []
  );

  const clearPersistedChat = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable
    }
  }, []);

  return useMemo(
    () => ({
      initialMessages: persistedChat
        ? [persistedChat.userMessage, persistedChat.assistantMessage]
        : EMPTY_MESSAGES,
      initialResponseId: persistedChat?.responseId ?? null,
      initialUserContext: persistedChat?.userContext,
      saveLastExchange,
      clearPersistedChat,
    }),
    [persistedChat, saveLastExchange, clearPersistedChat]
  );
}
