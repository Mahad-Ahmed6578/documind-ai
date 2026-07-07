// ============================================================
// Pinecone Vector Store — production-grade vector database
// ============================================================
// WHY PINECONE?
//   - In-memory search loads ALL chunks on every query — doesn't
//     scale beyond ~10k chunks and is slow on Vercel serverless.
//   - Pinecone is a managed vector database: sub-100ms queries at
//     billion-vector scale, with metadata filtering built-in.
//   - Supports the documentIds filter natively via metadata.
//
// INDEX SCHEMA:
//   - id:           <documentId>_<chunkIndex>  (unique)
//   - values:       embedding vector (256/768-dim depending on provider)
//   - metadata:
//       documentId: string
//       filename:   string
//       chunkIndex: number
//       chunkText:  string  (the actual chunk content)
// ============================================================

import { Pinecone } from "@pinecone-database/pinecone";
import type { SourceChunk } from "@/lib/types";

const PINECONE_API_KEY = process.env.PINECONE_API_KEY ?? "";
const PINECONE_INDEX = process.env.PINECONE_INDEX ?? "rag-document-qa";
// Pinecone environment region (e.g., "us-east-1-aws")
const PINECONE_ENV = process.env.PINECONE_ENVIRONMENT ?? "us-east-1-aws";

let cachedClient: Pinecone | null = null;

/** Returns a singleton Pinecone client. */
export function getPineconeClient(): Pinecone {
  if (!PINECONE_API_KEY) {
    throw new Error(
      "PINECONE_API_KEY is not set. Either set it in .env, or set VECTOR_STORE_PROVIDER=memory."
    );
  }
  if (!cachedClient) {
    cachedClient = new Pinecone({ apiKey: PINECONE_API_KEY });
  }
  return cachedClient;
}

/** Get or create the Pinecone index (idempotent). */
export async function ensureIndex(dimension: number): Promise<void> {
  const client = getPineconeClient();
  const indexName = PINECONE_INDEX;

  try {
    // Try to describe the index — if it exists, we're good
    await client.describeIndex(indexName);
  } catch {
    // Index doesn't exist — create it (serverless)
    try {
      await client.createIndex({
        name: indexName,
        dimension,
        metric: "cosine",
        spec: {
          serverless: {
            cloud: "aws",
            region: PINECONE_ENV.replace("-aws", "").replace("aws-", ""),
          },
        },
      });
      // Wait a bit for the index to be ready
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (createErr) {
      // If creation fails because it already exists, ignore
      const msg = createErr instanceof Error ? createErr.message : String(createErr);
      if (!msg.includes("already exists")) {
        throw createErr;
      }
    }
  }
}

/** Get the Pinecone Index object for upserts/queries. */
export function getIndex() {
  const client = getPineconeClient();
  return client.index(PINECONE_INDEX);
}

// ----------------------------------------------------------------
// UPSERT: store chunks + embeddings in Pinecone
// ----------------------------------------------------------------

export interface PineconeUpsertItem {
  id: string;          // unique: `${documentId}_${chunkIndex}`
  documentId: string;
  filename: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
}

/** Batch-upsert chunks to Pinecone. Pinecone allows max 100 vectors per upsert. */
export async function upsertChunks(items: PineconeUpsertItem[]): Promise<void> {
  if (items.length === 0) return;
  const index = getIndex();

  // Pinecone v8 uses the new namespace + upsert API
  const namespace = index.namespace("_default");

  // Process in batches of 100
  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await namespace.upsert(
      batch.map((item) => ({
        id: item.id,
        values: item.embedding,
        metadata: {
          documentId: item.documentId,
          filename: item.filename,
          chunkIndex: item.chunkIndex,
          chunkText: item.chunkText.slice(0, 50000), // Pinecone metadata limit
        },
      }))
    );
  }
}

// ----------------------------------------------------------------
// DELETE: remove all chunks for a document from Pinecone
// ----------------------------------------------------------------

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const index = getIndex();
  const namespace = index.namespace("_default");
  // Delete by metadata filter
  await namespace.deleteMany({ documentId });
}

// ----------------------------------------------------------------
// SEARCH: query Pinecone for top-K similar chunks
// ----------------------------------------------------------------

export interface PineconeSearchParams {
  queryVector: number[];
  topK: number;
  documentIds?: string[];
  minScore?: number;
}

export async function searchPinecone(params: PineconeSearchParams): Promise<SourceChunk[]> {
  const { queryVector, topK, documentIds, minScore = 0 } = params;
  const index = getIndex();
  const namespace = index.namespace("_default");

  // Build the filter
  const filter: Record<string, unknown> = {};
  if (documentIds && documentIds.length > 0) {
    filter.documentId = { $in: documentIds };
  }

  const queryResult = await namespace.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
    includeValues: false,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  const matches = queryResult.matches ?? [];
  return matches
    .filter((m) => (m.score ?? 0) >= minScore)
    .map((m) => {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      return {
        chunkId: String(m.id),
        documentId: String(meta.documentId ?? ""),
        filename: String(meta.filename ?? "unknown"),
        content: String(meta.chunkText ?? ""),
        chunkIndex: Number(meta.chunkIndex ?? 0),
        score: Number(m.score ?? 0),
      };
    });
}

// ----------------------------------------------------------------
// FALLBACK: get first N chunks per document from Pinecone
// (used when semantic search returns 0 results)
// ----------------------------------------------------------------

export async function pineconeFallbackChunks(
  documentIds: string[] | undefined,
  totalChunks: number
): Promise<SourceChunk[]> {
  const index = getIndex();
  const namespace = index.namespace("_default");

  // Use a zero vector query with metadata filter to fetch first N chunks
  // Actually, Pinecone doesn't support "fetch first N" directly via vector search.
  // We need to use the fetch API or list API.
  // Workaround: query with a random vector and take whatever comes back.
  // Better: use the list + fetch API.

  const filter: Record<string, unknown> = {};
  if (documentIds && documentIds.length > 0) {
    filter.documentId = { $in: documentIds };
  }

  // Query with a zero vector — Pinecone will return arbitrary chunks
  // (this is a known limitation; for production, use a separate "fetch by metadata" API)
  const dim = 256; // doesn't matter for fallback — we just want any chunks
  const zeroVector = new Array(dim).fill(0);

  const queryResult = await namespace.query({
    vector: zeroVector,
    topK: totalChunks,
    includeMetadata: true,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });

  const matches = queryResult.matches ?? [];
  return matches.map((m) => {
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    return {
      chunkId: String(m.id),
      documentId: String(meta.documentId ?? ""),
      filename: String(meta.filename ?? "unknown"),
      content: String(meta.chunkText ?? ""),
      chunkIndex: Number(meta.chunkIndex ?? 0),
      score: 0,
    };
  });
}

// ----------------------------------------------------------------
// HEALTH: check if Pinecone is reachable
// ----------------------------------------------------------------

export async function pineconeHealth(): Promise<boolean> {
  try {
    const client = getPineconeClient();
    await client.describeIndex(PINECONE_INDEX);
    return true;
  } catch {
    return false;
  }
}
