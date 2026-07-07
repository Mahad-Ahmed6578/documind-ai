// ============================================================
// RAG Pipeline — orchestration of ingestion + retrieval + answer
// ============================================================
// Two public entrypoints:
//   1. ingestDocument()  — called by /api/documents on upload
//   2. answerQuestion()  — called by /api/query on chat
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

/**
 * Full ingestion pipeline:
 *   1. Parse the file → plain text
 *   2. Split text into chunks (~1000 chars each)
 *   3. Embed each chunk
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

    // 2. Split
    const chunks = await splitText(parsed.text);
    if (chunks.length === 0) {
      throw new Error("Splitter produced no chunks — document is too short.");
    }

    // 3. Embed
    const vectors = await embedTexts(chunks);

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
        `[ingest] Vector store upsert failed (falling back to in-memory): ${
          vectorErr instanceof Error ? vectorErr.message : String(vectorErr)
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
 *   3. Build a context block from those chunks
 *   4. Call LLM with system prompt + context + question
 *   5. Persist the chat turn (user + assistant) to DB
 */
export async function answerQuestion(params: AnswerParams): Promise<AnswerResult> {
  const { question, sessionId, topK = 6, documentIds } = params;
  const startedAt = Date.now();

  // 1+2. Retrieve via cosine similarity
  let sources = await searchRelevant(question, topK, 0.01, documentIds);

  // FALLBACK: If 0 chunks found (common for "summarize this document" or
  // "compare" queries where the embedder doesn't match well), return the
  // first few chunks of each target document.
  if (sources.length === 0) {
    sources = await getFallbackChunks(documentIds, Math.min(topK, 6));
  }

  // COMPARISON BOOST: If the user is asking to compare multiple documents
  // AND the semantic search only returned chunks from ONE document, fetch
  // chunks from the OTHER documents too so the LLM can actually compare.
  const isComparison = /\bcompar|vs\.?|versus|difference between|both documents\b/i.test(question);
  if (isComparison && documentIds && documentIds.length > 1) {
    const foundDocIds = new Set(sources.map((s) => s.documentId));
    const missingDocIds = documentIds.filter((id) => !foundDocIds.has(id));
    if (missingDocIds.length > 0) {
      const extraChunks = await getFallbackChunks(missingDocIds, 3);
      sources = [...sources, ...extraChunks];
    }
  }

  // Determine searched documents (for the response + scope hint)
  const searchedDocumentIds = Array.from(new Set(sources.map((s) => s.documentId)));
  const searchedDocs = await db.document.findMany({
    where: { id: { in: searchedDocumentIds } },
    select: { id: true, filename: true },
  });
  const searchedDocumentNames = searchedDocs.map((d) => d.filename);

  // Build the context block
  const contextBlock =
    sources.length === 0
      ? "(No relevant context was found in the uploaded documents.)"
      : sources
          .map((s, i) => {
            const snippet = s.content.length > 1500
              ? s.content.slice(0, 1500) + "…"
              : s.content;
            return `--- Chunk ${i + 1} (from ${s.filename}, score=${s.score.toFixed(3)}) ---\n${snippet}`;
          })
          .join("\n\n");

  // Build the scope hint (tells the LLM whether search is restricted)
  let scopeHint: string;
  if (documentIds && documentIds.length > 1) {
    // Multiple documents selected — likely a comparison query
    scopeHint = `Note: The user selected ${documentIds.length} documents: ${searchedDocumentNames.join(", ")}. The context below contains chunks from ALL of these documents. The user may refer to them by number (e.g., "document 1", "document 2") or by name. Regardless of how they refer to them, treat the chunks in the context as the documents they're asking about. If they ask to compare, analyze each document's content and provide a structured comparison.`;
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
