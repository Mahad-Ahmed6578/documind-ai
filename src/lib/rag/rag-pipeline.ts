// ============================================================
// RAG Pipeline — orchestration of ingestion + retrieval + answer
// ============================================================
// Two public entrypoints:
//   1. ingestDocument()  — called by /api/documents on upload
//   2. answerQuestion()  — called by /api/query on chat
//
// IMPROVEMENTS:
//   - Batched embedding (max 20 chunks per API call) for large docs
//   - Guaranteed multi-doc comparison: always fetch from ALL selected
//     documents when multiple are selected
//   - Metadata-enriched chunks with filename + page numbers
// ============================================================

import { db } from "@/lib/db";
import { embedTexts } from "./embeddings";
import { invokeChat, RAG_SYSTEM_PROMPT } from "./llm";
import { splitText, estimateTokens } from "./text-splitter";
import { parseDocument, isSupportedMimeType } from "./document-parser";
import {
  searchRelevant,
  getFallbackChunks,
  upsertDocumentChunks,
  deleteVectorChunks,
} from "./vector-store";
import type { SourceChunk } from "@/lib/types";

// ----------------------------------------------------------------
// INGESTION
// ----------------------------------------------------------------

export interface IngestParams {
  documentId: string;       // Prisma Document row id (already created)
  buffer: Buffer;           // raw file bytes
  mimeType: string;
  filename: string;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  totalTokens: number;
  warnings: string[];
}

const EMBED_BATCH_SIZE = 20; // max chunks per embedding API call

/**
 * Full ingestion pipeline:
 *   1. Parse the file → plain text
 *   2. Split text into chunks (~1000 chars each) with metadata
 *   3. Embed each chunk (in batches of 20)
 *   4. Persist chunks + embeddings to Prisma
 *   5. Mark document status = "ready"
 *
 * On any error, the document status is set to "error" with a message.
 */
export async function ingestDocument(params: IngestParams): Promise<IngestResult> {
  const { documentId, buffer, mimeType, filename } = params;

  try {
    if (!isSupportedMimeType(mimeType)) {
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    }

    // 1. Parse
    const parsed = await parseDocument(buffer, mimeType, filename);
    if (!parsed.text) {
      throw new Error(
        "Document contained no extractable text. " +
        (parsed.warnings[0] ?? "")
      );
    }

    // 2. Split with metadata enrichment (filename + page numbers)
    const chunks = await splitText(parsed.text, filename);
    if (chunks.length === 0) {
      throw new Error("Splitter produced no chunks — document is too short.");
    }

    // 3. Embed in batches to avoid API timeouts on large documents
    const vectors: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const batchVectors = await embedTextsWithRetry(batch);
      vectors.push(...batchVectors);
    }

    if (vectors.length !== chunks.length) {
      throw new Error(
        `Embedding mismatch: ${vectors.length} vectors for ${chunks.length} chunks`
      );
    }

    // 4. Persist chunks + embeddings to Prisma (always — for metadata)
    await db.documentChunk.createMany({
      data: chunks.map((content, i) => ({
        documentId,
        content,
        embedding: JSON.stringify(vectors[i]),
        chunkIndex: i,
        tokenCount: estimateTokens(content),
      })),
    });

    // 4b. Also upsert to the configured vector store (Pinecone if enabled)
    try {
      await upsertDocumentChunks(
        chunks.map((content, i) => ({
          documentId,
          filename,
          chunkIndex: i,
          chunkText: content,
          embedding: vectors[i],
        }))
      );
    } catch (vectorErr) {
      // Log but don't fail — the chunks are already in Prisma,
      // so in-memory search will still work.
      console.warn(
        `[ingest] Vector store upsert failed (falling back to in-memory): ${vectorErr instanceof Error ? vectorErr.message : String(vectorErr)
        }`
      );
    }

    // 5. Mark ready
    await db.document.update({
      where: { id: documentId },
      data: {
        status: "ready",
        chunkCount: chunks.length,
        errorMsg: null,
      },
    });

    return {
      documentId,
      chunkCount: chunks.length,
      totalTokens: chunks.reduce((s, c) => s + estimateTokens(c), 0),
      warnings: parsed.warnings,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.document.update({
      where: { id: documentId },
      data: { status: "error", errorMsg: msg },
    });
    throw err;
  }
}

/**
 * Embed texts with retry on 429/502/503 errors.
 */
async function embedTextsWithRetry(texts: string[], maxRetries = 3): Promise<number[][]> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await embedTexts(texts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes("429") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.toLowerCase().includes("rate limit") ||
        msg.toLowerCase().includes("too many requests");

      if (isRetryable && attempt < maxRetries - 1) {
        const waitMs = 2000 * Math.pow(2, attempt);
        console.warn(
          `[embed] Retryable error, waiting ${waitMs}ms (attempt ${attempt + 1}/${maxRetries}): ${msg}`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Embedding failed after max retries");
}

// ----------------------------------------------------------------
// RETRIEVAL + GENERATION
// ----------------------------------------------------------------

export interface AnswerParams {
  question: string;
  sessionId: string;
  topK?: number;
  /** If provided, restrict retrieval to these document IDs. */
  documentIds?: string[];
}

export interface AnswerResult {
  answer: string;
  sources: SourceChunk[];
  durationMs: number;
  searchedDocumentIds: string[];
  searchedDocumentNames: string[];
}

/**
 * End-to-end RAG query:
 *   1. Embed the user's question
 *   2. Cosine-similarity search → top K chunks (optionally restricted to specific docs)
 *   3. GUARANTEED multi-doc retrieval when multiple docs selected
 *   4. Build a context block from those chunks
 *   5. Call LLM with system prompt + context + question
 *   6. Persist the chat turn (user + assistant) to DB
 */
export async function answerQuestion(params: AnswerParams): Promise<AnswerResult> {
  const { question, sessionId, topK = 6, documentIds } = params;
  const startedAt = Date.now();

  // 1+2. Retrieve via cosine similarity
  let sources = await searchRelevant(question, topK, 0.01, documentIds);

  // MULTI-DOC GUARANTEE: When multiple documents are selected, ALWAYS
  // ensure we have chunks from ALL of them. This fixes the comparison
  // issue where the model says "all chunks are from a single document."
  if (documentIds && documentIds.length > 1) {
    const foundDocIds = new Set(sources.map((s) => s.documentId));
    const missingDocIds = documentIds.filter((id) => !foundDocIds.has(id));

    if (missingDocIds.length > 0) {
      // Fetch fallback chunks from missing documents
      const chunksPerMissing = Math.max(2, Math.ceil(topK / documentIds.length));
      const extraChunks = await getFallbackChunks(missingDocIds, chunksPerMissing);
      sources = [...sources, ...extraChunks];
    }

    // Balance: ensure no single document dominates by limiting to
    // ceil(topK * 1.5 / docCount) chunks per document
    const maxPerDoc = Math.ceil((topK * 1.5) / documentIds.length);
    const docChunkCounts = new Map<string, number>();
    sources = sources.filter((s) => {
      const count = docChunkCounts.get(s.documentId) ?? 0;
      if (count >= maxPerDoc) return false;
      docChunkCounts.set(s.documentId, count + 1);
      return true;
    });
  }

  // FALLBACK: If 0 chunks found, return first few chunks of target docs
  if (sources.length === 0) {
    sources = await getFallbackChunks(documentIds, Math.min(topK, 6));
  }

  // Determine searched documents (for the response + scope hint)
  const searchedDocumentIds = Array.from(new Set(sources.map((s) => s.documentId)));
  const searchedDocs = await db.document.findMany({
    where: { id: { in: searchedDocumentIds } },
    select: { id: true, filename: true },
  });
  const searchedDocumentNames = searchedDocs.map((d) => d.filename);

  // Build the context block — group chunks by document for clarity
  let contextBlock: string;
  if (sources.length === 0) {
    contextBlock = "(No relevant context was found in the uploaded documents.)";
  } else if (documentIds && documentIds.length > 1) {
    // Multi-doc: group by document for clearer comparison
    const docGroups = new Map<string, SourceChunk[]>();
    for (const s of sources) {
      const group = docGroups.get(s.filename) ?? [];
      group.push(s);
      docGroups.set(s.filename, group);
    }

    const sections: string[] = [];
    let docIdx = 1;
    for (const [fname, chunks] of docGroups) {
      const chunkTexts = chunks
        .map((s, i) => {
          const snippet = s.content.length > 1200 ? s.content.slice(0, 1200) + "…" : s.content;
          return `  Chunk ${i + 1}: ${snippet}`;
        })
        .join("\n\n");
      sections.push(`=== Document ${docIdx}: ${fname} ===\n${chunkTexts}`);
      docIdx++;
    }
    contextBlock = sections.join("\n\n");
  } else {
    // Single doc or all docs — flat list
    contextBlock = sources
      .map((s, i) => {
        const snippet = s.content.length > 1200 ? s.content.slice(0, 1200) + "…" : s.content;
        return `--- Chunk ${i + 1} (from ${s.filename}, score=${s.score.toFixed(3)}) ---\n${snippet}`;
      })
      .join("\n\n");
  }

  // Build the scope hint
  let scopeHint: string;
  if (documentIds && documentIds.length > 1) {
    scopeHint = `Note: The user selected ${documentIds.length} documents for this query: ${searchedDocumentNames.join(", ")}. The context below contains chunks from ALL of these documents, grouped by document. You MUST analyze and reference each document. If the user asks to compare, provide a structured comparison covering all documents.`;
  } else if (documentIds && documentIds.length === 1) {
    scopeHint = `Note: The user restricted the search to ONE document: ${searchedDocumentNames[0] ?? "unknown"}. Only chunks from this document are provided in the context below.`;
  } else {
    scopeHint = `Note: The search was performed across ALL uploaded documents. Relevant chunks from any document may appear in the context.`;
  }

  // 3. Build the prompt
  const systemPrompt = RAG_SYSTEM_PROMPT
    .replace("{scopeHint}", scopeHint)
    .replace("{context}", contextBlock);

  // 4. Call LLM
  const answer = await invokeChat(systemPrompt, question);

  const durationMs = Date.now() - startedAt;

  // 5. Persist conversation
  await db.chatMessage.create({
    data: {
      sessionId,
      role: "user",
      content: question,
    },
  });
  await db.chatMessage.create({
    data: {
      sessionId,
      role: "assistant",
      content: answer,
      sources: JSON.stringify(sources),
    },
  });

  return {
    answer,
    sources,
    durationMs,
    searchedDocumentIds,
    searchedDocumentNames,
  };
}
