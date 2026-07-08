// ============================================================
// Client-side hooks for managing documents + chat state
// ============================================================
// IMPORTANT: useDocuments() delegates to the shared Zustand store
// (documents-store.ts). This ensures ALL components see the same
// document list.
//
// SESSION ISOLATION:
//   - Documents: scoped by X-Session-Id header (sessionStorage)
//   - Chat: stored in sessionStorage (dies when tab closes)
//   - New tab = fresh session = no leaked data
// ============================================================

"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDocumentsStore } from "@/lib/documents-store";
import type {
  QueryResponse,
  ChatRole,
  SourceChunk,
} from "@/lib/types";

// ----------------------------------------------------------------
// useDocuments — thin wrapper around the shared Zustand store
// ----------------------------------------------------------------

export function useDocuments() {
  const documents = useDocumentsStore((s) => s.documents);
  const loading = useDocumentsStore((s) => s.loading);
  const uploading = useDocumentsStore((s) => s.uploading);
  const error = useDocumentsStore((s) => s.error);
  const uploadQueue = useDocumentsStore((s) => s.uploadQueue);
  const refresh = useDocumentsStore((s) => s.refresh);
  const upload = useDocumentsStore((s) => s.upload);
  const uploadMultiple = useDocumentsStore((s) => s.uploadMultiple);
  const remove = useDocumentsStore((s) => s.remove);
  const clearQueue = useDocumentsStore((s) => s.clearQueue);
  const lastFetch = useDocumentsStore((s) => s.lastFetch);

  // Initial load — only fetch if we haven't fetched yet
  useEffect(() => {
    if (lastFetch === 0) {
      refresh();
    }
  }, [lastFetch, refresh]);

  // Poll while any document is still "processing"
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing");
    if (!hasProcessing) return;
    const t = setTimeout(refresh, 1500);
    return () => clearTimeout(t);
  }, [documents, refresh]);

  return {
    documents,
    loading,
    uploading,
    error,
    uploadQueue,
    refresh,
    upload,
    uploadMultiple,
    remove,
    clearQueue,
  };
}

// ----------------------------------------------------------------
// useChat — manage chat history + send questions
// ----------------------------------------------------------------
// ISOLATION: Chat is stored in sessionStorage (NOT localStorage).
// New tab = fresh chat. No leaked history between sessions.
// ----------------------------------------------------------------

const CHAT_STORAGE_KEY = "rag-chat-messages";
const SESSION_STORAGE_KEY = "rag-chat-session-id";

function getSessionIdHeader(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("documind-session-id") || "";
}

function loadMessages(): ChatRole[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ChatRole[];
    return [];
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatRole[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // sessionStorage might be full or disabled — silent fail
  }
}

function loadSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveSessionId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // silent fail
  }
}

export function useChat() {
  const [messages, setMessages] = useState<ChatRole[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from sessionStorage on mount (client-side only)
  useEffect(() => {
    const loaded = loadMessages();
    if (loaded.length > 0) {
      setMessages(loaded);
    }
    sessionIdRef.current = loadSessionId();
    setHydrated(true);
  }, []);

  // Save to sessionStorage whenever messages change (after hydration)
  useEffect(() => {
    if (hydrated) {
      saveMessages(messages);
    }
  }, [messages, hydrated]);

  const send = useCallback(
    async (question: string, documentIds?: string[]) => {
      if (!question.trim()) return;
      setSending(true);
      setError(null);

      const userMsg: ChatRole = {
        role: "user",
        content: question,
        targetDocumentIds: documentIds ?? null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const res = await fetch("/api/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-Id": getSessionIdHeader(),
          },
          body: JSON.stringify({
            question,
            sessionId: sessionIdRef.current ?? undefined,
            documentIds: documentIds && documentIds.length > 0 ? documentIds : undefined,
            topK: 6,
          }),
        });

        // Safe JSON parse — handle DOCTYPE / HTML responses
        let json: any;
        try {
          const text = await res.text();
          json = JSON.parse(text);
        } catch {
          throw new Error("Server returned an invalid response. Please try again.");
        }

        if (!json.ok) {
          throw new Error(json.error ?? "Query failed");
        }
        const data = json.data as QueryResponse;
        sessionIdRef.current = data.sessionId;
        saveSessionId(data.sessionId);

        const sources: SourceChunk[] = data.sources ?? [];
        const assistantMsg: ChatRole = {
          role: "assistant",
          content: data.answer,
          sources,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `⚠️ ${msg}`,
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    []
  );

  const clear = useCallback(() => {
    setMessages([]);
    sessionIdRef.current = null;
    saveSessionId(null);
    saveMessages([]);
    setError(null);
  }, []);

  return { messages, sending, error, send, clear };
}
