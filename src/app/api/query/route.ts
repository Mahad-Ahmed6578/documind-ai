// ============================================================
// /api/query — RAG query endpoint
// ============================================================
// POST body: {
//   question: string,
//   sessionId?: string,
//   topK?: number,
//   documentIds?: string[]   // restrict search to these docs
// }
// Returns:   { answer, sources, sessionId, durationMs, searchedDocumentIds, searchedDocumentNames }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { answerQuestion } from "@/lib/rag/rag-pipeline";
import type { ApiResponse, QueryRequest, QueryResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<QueryRequest>;

    if (!body || typeof body.question !== "string" || !body.question.trim()) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: "Missing required field: question (string)" },
        { status: 400 }
      );
    }

    const question = body.question.trim();
    const sessionId = body.sessionId?.trim() || generateSessionId();
    const topK = Math.min(Math.max(body.topK ?? 4, 1), 10); // clamp 1..10

    // Validate documentIds (if provided)
    let documentIds: string[] | undefined;
    if (Array.isArray(body.documentIds)) {
      documentIds = body.documentIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim());
      if (documentIds.length === 0) {
        // Empty array = treat as "all documents"
        documentIds = undefined;
      }
    }

    // Sanity check: do we have any documents ready?
    const readyCount = await db.document.count({
      where: { status: "ready" },
    });
    if (readyCount === 0) {
      return NextResponse.json<ApiResponse<QueryResponse>>(
        {
          ok: false,
          error:
            "No documents have been ingested yet. Upload a PDF/DOCX/TXT first, then ask a question.",
        },
        { status: 409 }
      );
    }

    // If documentIds were specified, validate they exist and are ready
    if (documentIds && documentIds.length > 0) {
      const validDocs = await db.document.findMany({
        where: { id: { in: documentIds }, status: "ready" },
        select: { id: true, filename: true },
      });
      if (validDocs.length === 0) {
        return NextResponse.json<ApiResponse<QueryResponse>>(
          {
            ok: false,
            error:
              "None of the specified documents are ready. Please wait for ingestion to complete or upload a new document.",
          },
          { status: 409 }
        );
      }
      // Restrict to valid ones (silently drop invalid IDs)
      documentIds = validDocs.map((d) => d.id);
    }

    const result = await answerQuestion({ question, sessionId, topK, documentIds });

    const data: QueryResponse = {
      answer: result.answer,
      sources: result.sources,
      sessionId,
      durationMs: result.durationMs,
      searchedDocumentIds: result.searchedDocumentIds,
      searchedDocumentNames: result.searchedDocumentNames,
    };

    return NextResponse.json<ApiResponse<QueryResponse>>({
      ok: true,
      data,
    });
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: "Query failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
