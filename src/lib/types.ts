// ============================================================
// Shared types used across the RAG pipeline + UI
// ============================================================

export type DocumentStatus = "processing" | "ready" | "error";

export interface DocumentMeta {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  status: DocumentStatus;
  chunkCount: number;
  errorMsg?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceChunk {
  chunkId: string;
  documentId: string;
  filename: string;
  content: string;
  chunkIndex: number;
  score: number; // cosine similarity (0..1)
}

export interface ChatRole {
  role: "user" | "assistant";
  content: string;
  sources?: SourceChunk[];
  // For user turns: which documents were targeted (null = all)
  targetDocumentIds?: string[] | null;
  createdAt?: string;
}

export interface QueryRequest {
  question: string;
  sessionId?: string;
  topK?: number;
  /** If provided, restrict retrieval to these document IDs.
   *  If null/undefined, search across ALL ready documents. */
  documentIds?: string[];
}

export interface QueryResponse {
  answer: string;
  sources: SourceChunk[];
  sessionId: string;
  durationMs: number;
  // Echo back which documents the answer was drawn from
  searchedDocumentIds: string[];
  searchedDocumentNames: string[];
}

// Standardized API envelope
export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  error: string;
  details?: unknown;
}
export type ApiResponse<T> = ApiOk<T> | ApiErr;
