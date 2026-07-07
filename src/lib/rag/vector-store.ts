// ============================================================
// Vector Store — dispatches between in-memory and Pinecone
// ============================================================
// SUPPORTED PROVIDERS:
//   - "memory"   (default) → loads all chunks from Prisma, computes
//                  cosine similarity in JS. Works on Vercel serverless.
//   - "pinecone" → uses Pinecone managed vector database. Sub-100ms
//                  queries at scale, metadata filtering built-in.
//
// HOW TO SWITCH:
//   Set VECTOR_STORE_PROVIDER to "memory" or "pinecone".
//   For Pinecone: also set PINECONE_API_KEY and PINECONE_INDEX.
// ============================================================

import { db } from "@/lib/db";
import { embedQuery, getEmbeddingDim } from "./embeddings";
import {
  upsertChunks,
  deleteDocumentChunks,
  searchPinecone,
  pineconeFallbackChunks,
  ensureIndex,
  pineconeHealth,
  type PineconeUpsertItem,
} from "./pinecone-store";
import type { SourceChunk } from "@/lib/types";

export type VectorStoreProvider = "memory" | "pinecone";

/** Get the configured vector store. Defaults to "memory" unless env says otherwise. */
export function getVectorStoreProvider(): VectorStoreProvider {
  const env = (process.env.VECTOR_STORE_PROVIDER ?? "memory").toLowerCase().trim();
  if (env === "pinecone") return "pinecone";
  return "memory";
}

// ============================================================
// In-memory cosine similarity
// ============================================================

/** Cosine similarity between two equal-length numeric vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/** Safely parse a JSON-serialized embedding array. */
export function parseEmbedding(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === "number")) {
      throw new Error("Embedding is not a number array");
    }
    return parsed as number[];
  } catch (err) {
    throw new Error(
      `Failed to parse embedding: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ============================================================
// UPSERT: store chunks + embeddings
// ============================================================

export interface UpsertChunk {
  documentId: string;
  filename: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
}

/** Store chunks + embeddings in the configured vector store. */
export async function upsertDocumentChunks(items: UpsertChunk[]): Promise<void> {
  if (items.length === 0) return;
  const provider = getVectorStoreProvider();

  if (provider === "pinecone") {
    // Ensure the index exists with the right dimension
    const dim = getEmbeddingDim();
    await ensureIndex(dim);
    // Upsert to Pinecone
    const pineconeItems: PineconeUpsertItem[] = items.map((item) => ({
      id: `${item.documentId}_${item.chunkIndex}`,
      documentId: item.documentId,
      filename: item.filename,
      chunkIndex: item.chunkIndex,
      chunkText: item.chunkText,
      embedding: item.embedding,
    }));
    await upsertChunks(pineconeItems);
  }
  // For "memory" provider, chunks are already persisted in Prisma (DocumentChunk table)
  // via the rag-pipeline. No additional action needed here.
}

// ============================================================
// DELETE: remove all chunks for a document
// ============================================================

export async function deleteVectorChunks(documentId: string): Promise<void> {
  const provider = getVectorStoreProvider();
  if (provider === "pinecone") {
    await deleteDocumentChunks(documentId);
  }
  // For "memory" provider, Prisma cascade delete handles this.
}

// ============================================================
// SEARCH: query for top-K similar chunks
// ============================================================

/**
 * Embeds the user's query, then searches the vector store for the
 * top-K most similar chunks above the similarity threshold.
 *
 * @param question     User's natural-language question
 * @param topK         Number of chunks to retrieve (default 6)
 * @param minScore     Minimum cosine similarity to include
 * @param documentIds  Optional list of document IDs to restrict search to.
 */
export async function searchRelevant(
  question: string,
  topK = 6,
  minScore = 0.01,
  documentIds?: string[]
): Promise<SourceChunk[]> {
  const provider = getVectorStoreProvider();

  if (provider === "pinecone") {
    const queryVec = await embedQuery(question);
    return searchPinecone({
      queryVector: queryVec,
      topK,
      documentIds,
      minScore,
    });
  }

  // In-memory search
  return searchMemory(question, topK, minScore, documentIds);
}

// ============================================================
// In-memory search implementation
// ============================================================

async function searchMemory(
  question: string,
  topK: number,
  minScore: number,
  documentIds?: string[]
): Promise<SourceChunk[]> {
  const queryVec = await embedQuery(question);

  const where: {
    document: { status: string; id?: { in: string[] } };
  } = {
    document: { status: "ready" },
  };
  if (documentIds && documentIds.length > 0) {
    where.document.id = { in: documentIds };
  }

  const chunks = await db.documentChunk.findMany({
    where,
    include: {
      document: {
        select: { id: true, filename: true, status: true },
      },
    },
  });

  const candidates = chunks.filter((c) => c.document.status === "ready");

  const scored = candidates.map((c) => {
    const emb = parseEmbedding(c.embedding);
    const score = cosineSimilarity(queryVec, emb);
    return {
      chunkId: c.id,
      documentId: c.document.id,
      filename: c.document.filename,
      content: c.content,
      chunkIndex: c.chunkIndex,
      score,
    };
  });

  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ============================================================
// FALLBACK: get first N chunks when semantic search returns 0
// ============================================================

export async function getFallbackChunks(
  documentIds: string[] | undefined,
  totalChunks: number
): Promise<SourceChunk[]> {
  const provider = getVectorStoreProvider();

  if (provider === "pinecone") {
    return pineconeFallbackChunks(documentIds, totalChunks);
  }

  // In-memory fallback: fetch from Prisma
  const where: { document: { status: string; id?: { in: string[] } } } = {
    document: { status: "ready" },
  };
  if (documentIds && documentIds.length > 0) {
    where.document.id = { in: documentIds };
  }

  // If multiple documents are selected (comparison query), distribute
  // chunks evenly across them so the LLM sees content from ALL docs.
  if (documentIds && documentIds.length > 1) {
    return getBalancedFallback(documentIds, totalChunks);
  }

  const chunks = await db.documentChunk.findMany({
    where,
    include: {
      document: {
        select: { id: true, filename: true, status: true },
      },
    },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
    take: totalChunks,
  });

  return chunks.map((c) => ({
    chunkId: c.id,
    documentId: c.document.id,
    filename: c.document.filename,
    content: c.content,
    chunkIndex: c.chunkIndex,
    score: 0,
  }));
}

/**
 * For comparison queries (multiple documents selected), fetch chunks
 * from EACH document evenly so the LLM sees content from all docs.
 * E.g., 2 docs × 3 chunks each = 6 total.
 */
async function getBalancedFallback(
  documentIds: string[],
  totalChunks: number
): Promise<SourceChunk[]> {
  const perDoc = Math.max(1, Math.floor(totalChunks / documentIds.length));
  const results: SourceChunk[] = [];

  for (const docId of documentIds) {
    const chunks = await db.documentChunk.findMany({
      where: {
        documentId: docId,
        document: { status: "ready" },
      },
      include: {
        document: {
          select: { id: true, filename: true, status: true },
        },
      },
      orderBy: { chunkIndex: "asc" },
      take: perDoc,
    });

    for (const c of chunks) {
      results.push({
        chunkId: c.id,
        documentId: c.document.id,
        filename: c.document.filename,
        content: c.content,
        chunkIndex: c.chunkIndex,
        score: 0,
      });
    }
  }

  return results;
}

// ============================================================
// HEALTH: check if vector store is reachable
// ============================================================

export async function vectorStoreHealth(): Promise<boolean> {
  const provider = getVectorStoreProvider();
  if (provider === "pinecone") {
    return pineconeHealth();
  }
  // In-memory is always "healthy" if Prisma is
  return true;
}
