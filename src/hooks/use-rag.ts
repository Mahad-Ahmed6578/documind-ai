// ============================================================
// Client-side hooks for managing documents + chat state
// ============================================================
// IMPORTANT: useDocuments() now delegates to the shared Zustand
// store (documents-store.ts). This ensures ALL components see
// the same document list — no more stale state after upload.
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
// Components call this hook to get documents + actions.
// All components share the SAME state via the store.

export function useDocuments() {
  const documents = useDocumentsStore((s) => s.documents);
  const loading = useDocumentsStore((s) => s.loading);
  const uploading = useDocumentsStore((s) => s.uploading);
  const error = useDocumentsStore((s) => s.error);
  const refresh = useDocumentsStore((s) => s.refresh);
  const upload = useDocumentsStore((s) => s.upload);
  const remove = useDocumentsStore((s) => s.remove);
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
    const t = setTimeout(refresh, 1500); // faster polling: 1.5s instead of 2.5s
    return () => clearTimeout(t);
  }, [documents, refresh]);

  return {
    documents,
    loading,
    uploading,
    error,
    refresh,
    upload,
    remove,
  };
}

// ----------------------------------------------------------------
// useChat — manage chat history + send questions
// ----------------------------------------------------------------
// PERSISTENCE: Chat messages are saved to localStorage so they
// survive page refreshes. Each session has its own message list.
// ----------------------------------------------------------------

const CHAT_STORAGE_KEY = "rag-chat-messages";
const SESSION_STORAGE_KEY = "rag-chat-session-id";

function loadMessages(): ChatRole[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
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
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // localStorage might be full or disabled — silent fail
  }
}

function loadSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveSessionId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      localStorage.setItem(SESSION_STORAGE_KEY, id);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
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

  // Hydrate from localStorage on mount (client-side only)
  useEffect(() => {
    const loaded = loadMessages();
    if (loaded.length > 0) {
      setMessages(loaded);
    }
    sessionIdRef.current = loadSessionId();
    setHydrated(true);
  }, []);

  // Save to localStorage whenever messages change (after hydration)
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            sessionId: sessionIdRef.current ?? undefined,
            documentIds: documentIds && documentIds.length > 0 ? documentIds : undefined,
            topK: 6,
          }),
        });
        const json = await res.json();
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
