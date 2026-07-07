"use client";

// ============================================================
// ChatInterface — message list + input box
// ============================================================
// SCROLL BEHAVIOR:
//   We use a plain <div> with overflow-y-auto instead of the shadcn
//   ScrollArea component. The shadcn ScrollArea uses an internal
//   Viewport that intercepts scrollIntoView and doesn't always
//   stick to the bottom on rapid updates. A plain div always works.
//
// MARKDOWN RENDERING:
//   Assistant messages are rendered via MarkdownRenderer so that
//   headings, bold, lists, tables, code blocks, and LaTeX math
//   all display properly instead of showing as raw markdown text.
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Send, Trash2, Loader2, Bot, User, Sparkles, FileStack } from "lucide-react";
import { useChat } from "@/hooks/use-rag";
import { useDocuments } from "@/hooks/use-rag";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SourceCitations } from "./source-citations";
import { MarkdownRenderer } from "./markdown-renderer";
import type { ChatRole } from "@/lib/types";

interface ChatInterfaceProps {
  /** Document IDs the user has selected for scoped queries. */
  selectedDocumentIds: string[];
}

export function ChatInterface({ selectedDocumentIds }: ChatInterfaceProps) {
  const { messages, sending, send, clear } = useChat();
  const { documents } = useDocuments();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom whenever messages change OR while sending
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, sending]);

  const readyDocs = documents.filter((d) => d.status === "ready");
  const readyCount = readyDocs.length;
  const canChat = readyCount > 0 && !sending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canChat || !input.trim()) return;
    send(input, selectedDocumentIds);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const scopeSummary =
    selectedDocumentIds.length === 0
      ? `All ${readyCount} doc${readyCount !== 1 ? "s" : ""}`
      : `${selectedDocumentIds.length} doc${selectedDocumentIds.length !== 1 ? "s" : ""} selected`;

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Chat</span>
          {readyCount > 0 && (
            <Badge variant="secondary" className="gap-1 text-[10px] font-medium">
              <FileStack className="h-2.5 w-2.5" />
              {scopeSummary}
            </Badge>
          )}
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={clear}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      {/* Messages — plain scrollable div */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="space-y-4 p-4">
          {messages.length === 0 ? (
            <EmptyChatState readyCount={readyCount} />
          ) : (
            messages.map((m, i) => (
              <MessageBubble
                key={i}
                message={m}
                allDocuments={documents}
              />
            ))
          )}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Retrieving relevant chunks and generating answer…</span>
            </div>
          )}
          <div ref={bottomRef} style={{ height: 1 }} />
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-border/60 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              readyCount === 0
                ? "Upload a document first to start chatting…"
                : selectedDocumentIds.length === 0
                ? "Ask a question across ALL documents… (Enter to send, Shift+Enter for newline)"
                : `Ask a question about the ${selectedDocumentIds.length} selected document${selectedDocumentIds.length !== 1 ? "s" : ""}…`
            }
            disabled={!canChat && readyCount === 0}
            className="min-h-[44px] resize-none"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!canChat || !input.trim()}
            className="h-11 w-11 shrink-0"
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </form>
    </div>
  );
}

function EmptyChatState({ readyCount }: { readyCount: number }) {
  if (readyCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
        <Sparkles className="h-10 w-10 text-primary/40" />
        <div>
          <p className="text-sm font-medium">Ready when you are</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload a document on the left, then ask it anything.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
      <Bot className="h-10 w-10 text-primary/40" />
      <div>
        <p className="text-sm font-medium">Ask a question</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {readyCount} document{readyCount !== 1 ? "s" : ""} ready · type below to begin
        </p>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  allDocuments,
}: {
  message: ChatRole;
  allDocuments: import("@/lib/types").DocumentMeta[];
}) {
  const isUser = message.role === "user";

  const targetNames =
    isUser && message.targetDocumentIds && message.targetDocumentIds.length > 0
      ? message.targetDocumentIds
          .map((id) => allDocuments.find((d) => d.id === id)?.filename ?? "unknown")
      : null;

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[85%] space-y-1 rounded-lg px-3.5 py-2.5 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 text-foreground border border-border/40"
        }`}
      >
        {/* Render content as markdown */}
        <MarkdownRenderer
          content={message.content}
          variant={isUser ? "user" : "assistant"}
        />

        {/* Show targeted docs for user turns */}
        {isUser && targetNames && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {targetNames.map((name, i) => (
              <Badge
                key={i}
                variant="secondary"
                className="bg-primary-foreground/20 text-primary-foreground text-[10px]"
              >
                {name}
              </Badge>
            ))}
          </div>
        )}

        {/* Show sources for assistant turns */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <SourceCitations sources={message.sources} />
        )}
      </div>
    </div>
  );
}
