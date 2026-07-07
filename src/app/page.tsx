"use client";

// ============================================================
// Main page — responsive 2-column layout (sidebar + chat)
// ============================================================
// RESPONSIVE BREAKPOINTS:
//   - Mobile (< 768px):  Single column — tabs between Documents and Chat
//   - Tablet (768-1024px): Single column with collapsible sidebar
//   - Desktop (>= 1024px): Fixed sidebar + chat side-by-side
// ============================================================

import { Header } from "@/components/rag/header";
import { DocumentUploader } from "@/components/rag/document-uploader";
import { DocumentList } from "@/components/rag/document-list";
import { ChatInterface } from "@/components/rag/chat-interface";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare } from "lucide-react";

export default function Home() {
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  // Mobile tab: "docs" or "chat"
  const [mobileTab, setMobileTab] = useState<"docs" | "chat">("docs");

  const toggleSelect = useCallback((id: string) => {
    setSelectedDocumentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const json = await res.json();
      if (json.ok) {
        const readyIds = json.data
          .filter((d: { status: string }) => d.status === "ready")
          .map((d: { id: string }) => d.id);
        setSelectedDocumentIds(readyIds);
      }
    } catch {
      /* silent */
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDocumentIds([]);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      {/* Mobile tab switcher */}
      <div className="flex border-b border-border/60 lg:hidden">
        <Button
          variant={mobileTab === "docs" ? "default" : "ghost"}
          size="sm"
          className="flex-1 rounded-none gap-2"
          onClick={() => setMobileTab("docs")}
        >
          <FileText className="h-4 w-4" />
          Documents
        </Button>
        <Button
          variant={mobileTab === "chat" ? "default" : "ghost"}
          size="sm"
          className="flex-1 rounded-none gap-2"
          onClick={() => setMobileTab("chat")}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
          {selectedDocumentIds.length > 0 && (
            <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-[10px]">
              {selectedDocumentIds.length}
            </span>
          )}
        </Button>
      </div>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 gap-5 p-3 sm:p-5">
        {/* Sidebar: upload + docs */}
        <aside
          className={`flex w-full flex-col gap-4 lg:w-[340px] lg:shrink-0 ${
            mobileTab === "docs" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="rounded-xl border border-border/60 bg-card shadow-sm">
            <DocumentUploader />
          </div>
          <div className="rounded-xl border border-border/60 bg-card shadow-sm">
            <DocumentList
              selectedIds={selectedDocumentIds}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              onClearSelection={clearSelection}
            />
          </div>
          {/* Mobile: switch to chat after selecting docs */}
          <Button
            variant="default"
            className="lg:hidden"
            onClick={() => setMobileTab("chat")}
          >
            Go to Chat →
          </Button>
        </aside>

        {/* Chat panel */}
        <div
          className={`flex min-h-[500px] flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm lg:h-[calc(100vh-5.5rem)] ${
            mobileTab === "chat" ? "flex" : "hidden lg:flex"
          }`}
        >
          <ChatInterface selectedDocumentIds={selectedDocumentIds} />
        </div>
      </main>

      <footer className="border-t border-border/60 py-3">
        <div className="mx-auto max-w-[1400px] px-4 text-center text-xs text-muted-foreground">
          Next.js 16 · LangChain · Prisma · Tailwind CSS · shadcn/ui ·
          Switchable LLM + Embeddings + Vector DB
        </div>
      </footer>
    </div>
  );
}
