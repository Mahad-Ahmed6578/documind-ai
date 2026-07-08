// ============================================================
// Shared Documents Store (Zustand)
// ============================================================
// Provides a SINGLE source of truth for all document operations
// across DocumentUploader, DocumentList, and ChatInterface.
//
// SESSION ISOLATION:
//   Each browser tab gets a unique sessionId (via sessionStorage).
//   All API calls include X-Session-Id header so each visitor
//   sees only THEIR documents. New tab = new session = empty docs.
//
// MULTI-FILE UPLOAD:
//   uploadMultiple() processes files ONE AT A TIME (sequential)
//   to avoid mixing chunk state. Each file gets its own progress.
// ============================================================

import { create } from "zustand";
import type { DocumentMeta } from "@/lib/types";

// ----------------------------------------------------------------
// Session ID management
// ----------------------------------------------------------------
function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = sessionStorage.getItem("documind-session-id");
  if (!id) {
    id = `bsid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("documind-session-id", id);
  }
  return id;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  return sessionStorage.getItem("documind-session-id") || getOrCreateSessionId();
}

// ----------------------------------------------------------------
// Safe JSON parsing (prevents DOCTYPE / HTML error crash)
// ----------------------------------------------------------------
async function safeParseJson(res: Response): Promise<{ ok: boolean; data?: any; error?: string }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Server returned HTML (e.g. Vercel error page) instead of JSON
    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      return { ok: false, error: "Server returned an error page. The file may be too large or the server timed out. Please try again." };
    }
    return { ok: false, error: `Invalid response from server: ${text.slice(0, 200)}` };
  }
}

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------
export interface UploadQueueItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface DocumentsState {
  // State
  documents: DocumentMeta[];
  loading: boolean;
  uploading: boolean;
  error: string | null;
  lastFetch: number;
  uploadQueue: UploadQueueItem[];

  // Actions
  refresh: () => Promise<void>;
  upload: (file: File) => Promise<{ ok: boolean; error?: string }>;
  uploadMultiple: (files: File[]) => Promise<void>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
  clearError: () => void;
  clearQueue: () => void;
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  loading: false,
  uploading: false,
  error: null,
  lastFetch: 0,
  uploadQueue: [],

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/documents", {
        headers: { "X-Session-Id": getSessionId() },
      });
      const json = await safeParseJson(res);
      if (!json.ok) throw new Error(json.error ?? "Failed to fetch documents");
      set({
        documents: json.data as DocumentMeta[],
        loading: false,
        lastFetch: Date.now(),
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        loading: false,
      });
    }
  },

  upload: async (file: File) => {
    set({ uploading: true, error: null });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/documents", {
        method: "POST",
        body: fd,
        headers: { "X-Session-Id": getSessionId() },
      });
      const json = await safeParseJson(res);
      if (!json.ok) {
        set({ uploading: false });
        return { ok: false, error: json.error ?? "Upload failed" };
      }
      await get().refresh();
      set({ uploading: false });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ uploading: false, error: msg });
      return { ok: false, error: msg };
    }
  },

  uploadMultiple: async (files: File[]) => {
    // Initialize queue
    const queue: UploadQueueItem[] = files.map((f) => ({
      file: f,
      status: "pending" as const,
    }));
    set({ uploadQueue: [...queue], uploading: true, error: null });

    // Process files ONE BY ONE (sequential, no mixing)
    for (let i = 0; i < queue.length; i++) {
      // Mark current as uploading
      queue[i].status = "uploading";
      set({ uploadQueue: [...queue] });

      try {
        const fd = new FormData();
        fd.append("file", queue[i].file);
        const res = await fetch("/api/documents", {
          method: "POST",
          body: fd,
          headers: { "X-Session-Id": getSessionId() },
        });
        const json = await safeParseJson(res);
        if (!json.ok) {
          queue[i].status = "error";
          queue[i].error = json.error ?? "Upload failed";
        } else {
          queue[i].status = "done";
        }
      } catch (err) {
        queue[i].status = "error";
        queue[i].error = err instanceof Error ? err.message : String(err);
      }

      set({ uploadQueue: [...queue] });
      // Refresh after each file so new doc appears immediately
      await get().refresh();
    }

    set({ uploading: false });
  },

  remove: async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        headers: { "X-Session-Id": getSessionId() },
      });
      const json = await safeParseJson(res);
      if (!json.ok) {
        return { ok: false, error: json.error ?? "Delete failed" };
      }
      await get().refresh();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      return { ok: false, error: msg };
    }
  },

  clearError: () => set({ error: null }),
  clearQueue: () => set({ uploadQueue: [] }),
}));
