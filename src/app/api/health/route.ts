// ============================================================
// /api/health — liveness + config sanity check
// ============================================================

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/rag/llm";
import { getEmbedProvider, getEmbeddingDim } from "@/lib/rag/embeddings";
import { getVectorStoreProvider, vectorStoreHealth } from "@/lib/rag/vector-store";
import type { ApiResponse } from "@/lib/types";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_DOCUMENTS = 50;

export async function GET() {
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY
  );
  const hasPineconeKey = Boolean(process.env.PINECONE_API_KEY);
  const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY);
  const llmProvider = getLLMProvider();
  const embedProvider = getEmbedProvider();
  const vectorStoreProvider = getVectorStoreProvider();
  const embeddingDim = getEmbeddingDim();

  let dbOk = false;
  let documentCount = 0;
  let chunkCount = 0;

  try {
    documentCount = await db.document.count();
    chunkCount = await db.documentChunk.count();
    dbOk = true;
  } catch {
    // DB not reachable
  }

  // Check vector store health (only if Pinecone is configured)
  let vectorStoreOk = true;
  if (vectorStoreProvider === "pinecone") {
    try {
      vectorStoreOk = await vectorStoreHealth();
    } catch {
      vectorStoreOk = false;
    }
  }

  return NextResponse.json<ApiResponse<{
    status: "ok" | "degraded";
    llmProvider: "zai" | "gemini" | "openrouter";
    llmModel?: string;
    embedProvider: "tfidf" | "glm4" | "gemini" | "openrouter";
    vectorStoreProvider: "memory" | "pinecone";
    embeddingDim: number;
    geminiKeyConfigured: boolean;
    pineconeKeyConfigured: boolean;
    openrouterKeyConfigured: boolean;
    database: "ok" | "error";
    vectorStore: "ok" | "error" | "n/a";
    documentCount: number;
    chunkCount: number;
    maxDocuments: number;
    maxFileSizeMb: number;
    timestamp: string;
  }>>({
    ok: true,
    data: {
      status: dbOk && vectorStoreOk ? "ok" : "degraded",
      llmProvider,
      ...(llmProvider === "openrouter" && {
        llmModel: process.env.OPENROUTER_MODEL ?? "z-ai/glm-4.5-air:free",
      }),
      embedProvider,
      vectorStoreProvider,
      embeddingDim,
      geminiKeyConfigured: hasGeminiKey,
      pineconeKeyConfigured: hasPineconeKey,
      openrouterKeyConfigured: hasOpenRouterKey,
      database: dbOk ? "ok" : "error",
      vectorStore: vectorStoreProvider === "pinecone"
        ? (vectorStoreOk ? "ok" : "error")
        : "n/a",
      documentCount,
      chunkCount,
      maxDocuments: MAX_DOCUMENTS,
      maxFileSizeMb: MAX_FILE_SIZE / 1024 / 1024,
      timestamp: new Date().toISOString(),
    },
  });
}
