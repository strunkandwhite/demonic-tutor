"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { UserContext } from "@/core/llm/tools";

const STORAGE_PREFIX = "demonic-tutor-chat-";
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

// Cache to ensure getSnapshot returns stable references (per scope)
const cache = new Map<string, { raw: string | null; parsed: PersistedChat | null }>();

function subscribe() {
  // localStorage doesn't have change events we need to subscribe to
  return () => {};
}

function getServerSnapshot(): null {
  return null;
}

export function usePersistedChat(scope: string = "global"): UsePersistedChatResult {
  const storageKey = `${STORAGE_PREFIX}${scope}`;

  const getSnapshot = useCallback((): PersistedChat | null => {
    try {
      const stored = localStorage.getItem(storageKey);
      const cached = cache.get(scope);
      if (cached && stored === cached.raw) {
        return cached.parsed;
      }
      if (!stored) {
        cache.set(scope, { raw: null, parsed: null });
        return null;
      }
      const parsed: PersistedChat = JSON.parse(stored);
      if (parsed.version !== CURRENT_VERSION) {
        cache.set(scope, { raw: stored, parsed: null });
        return null;
      }
      if (!parsed.userMessage?.id || !parsed.assistantMessage?.id) {
        cache.set(scope, { raw: stored, parsed: null });
        return null;
      }
      cache.set(scope, { raw: stored, parsed });
      return parsed;
    } catch {
      cache.set(scope, { raw: null, parsed: null });
      return null;
    }
  }, [scope, storageKey]);

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
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        // Storage full or unavailable
      }
    },
    [storageKey]
  );

  const clearPersistedChat = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      cache.delete(scope);
    } catch {
      // Storage unavailable
    }
  }, [scope, storageKey]);

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
