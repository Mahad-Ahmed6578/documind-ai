"use client";

// ============================================================
// Header — top app bar with branding + live config badges
// ============================================================

import { Brain, Github } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";

interface HealthData {
  llmProvider: "zai" | "gemini";
  embedProvider: "tfidf" | "glm4" | "gemini";
  vectorStoreProvider: "memory" | "pinecone";
  embeddingDim: number;
  geminiKeyConfigured: boolean;
  pineconeKeyConfigured: boolean;
  documentCount: number;
  maxDocuments: number;
}

export function Header() {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/health");
        const json = await res.json();
        if (json.ok && !cancelled) {
          const d = json.data;
          setHealth({
            llmProvider: d.llmProvider,
            embedProvider: d.embedProvider,
            vectorStoreProvider: d.vectorStoreProvider,
            embeddingDim: d.embeddingDim,
            geminiKeyConfigured: d.geminiKeyConfigured,
            pineconeKeyConfigured: d.pineconeKeyConfigured,
            documentCount: d.documentCount,
            maxDocuments: d.maxDocuments,
          });
        }
      } catch {
        /* silent */
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const llmLabel = health
    ? health.llmProvider === "gemini" ? "Gemini" : "GLM-4"
    : "…";
  const embedLabel = health
    ? health.embedProvider === "gemini" ? "Gemini"
      : health.embedProvider === "glm4" ? "GLM-4 Sem"
      : "TF-IDF"
    : "…";
  const vsLabel = health
    ? health.vectorStoreProvider === "pinecone" ? "Pinecone" : "Memory"
    : "…";

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
            <Brain className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight">
            RAG Document Q&amp;A
          </h1>
        </div>

        {/* Right side: live badges */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {health && (
            <>
              <Badge
                variant="outline"
                className="gap-1.5 border-border/60 text-[10px] font-medium"
                title={`LLM: ${llmLabel} · Embeddings: ${embedLabel} (${health.embeddingDim}d) · Vector DB: ${vsLabel}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="hidden sm:inline">{llmLabel}</span>
                <span className="hidden md:inline">· {embedLabel}</span>
                <span className="hidden lg:inline">· {vsLabel}</span>
              </Badge>
              <Badge
                variant="outline"
                className="hidden gap-1.5 border-border/60 text-[10px] font-medium sm:flex"
                title={`${health.documentCount} / ${health.maxDocuments} documents uploaded`}
              >
                {health.documentCount}/{health.maxDocuments}
              </Badge>
            </>
          )}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-muted"
            aria-label="GitHub repository"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
