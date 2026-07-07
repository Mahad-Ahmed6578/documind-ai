// ============================================================
// Shared Documents Store (Zustand)
// ============================================================
// WHY THIS EXISTS:
//   Previously, useDocuments() was called in 3 separate components
//   (DocumentUploader, DocumentList, ChatInterface), each with its
//   OWN copy of the state. When one component uploaded/deleted a
//   document, the others didn't see the change until they manually
//   refreshed. This caused:
//     - "Document not appearing after upload" bug
//     - "First query fails, second works" bug (stale readyCount)
//     - Selected document IDs going out of sync
//
//   This Zustand store provides a SINGLE source of truth that all
//   components share. When upload() updates the store, every
//   component re-renders with the new data instantly.
// ============================================================

import { create } from "zustand";
import type { DocumentMeta } from "@/lib/types";

interface DocumentsState {
  // State
  documents: DocumentMeta[];
  loading: boolean;
  uploading: boolean;
  error: string | null;
  lastFetch: number; // timestamp of last successful fetch

  // Actions
  refresh: () => Promise<void>;
  upload: (file: File) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<{ ok: boolean; error?: string }>;
  clearError: () => void;
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  loading: false,
  uploading: false,
  error: null,
  lastFetch: 0,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/documents");
      const json = await res.json();
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
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        set({ uploading: false });
        return { ok: false, error: json.error ?? "Upload failed" };
      }
      // Refresh the store so ALL components see the new document
      await get().refresh();
      set({ uploading: false });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ uploading: false, error: msg });
      return { ok: false, error: msg };
    }
  },

  remove: async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) {
        return { ok: false, error: json.error ?? "Delete failed" };
      }
      // Refresh the store so ALL components see the deletion
      await get().refresh();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg });
      return { ok: false, error: msg };
    }
  },

  clearError: () => set({ error: null }),
}));
