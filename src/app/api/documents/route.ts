// ============================================================
// /api/documents — list (GET) + upload (POST)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestDocument } from "@/lib/rag/rag-pipeline";
import { isSupportedMimeType } from "@/lib/rag/document-parser";
import type { ApiResponse, DocumentMeta } from "@/lib/types";

export const runtime = "nodejs";
// Increased for large file uploads — parse + embed can take a while
export const maxDuration = 120;

// ----------------------------------------------------------------
// Tunable limits
// ----------------------------------------------------------------
const MAX_FILE_SIZE = 25 * 1024 * 1024;       // 25 MB per file
const MAX_DOCUMENTS = 50;                      // 50 documents max per session

// ----------------------------------------------------------------
// GET /api/documents — list documents for THIS session
// ----------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const sessionId = req.headers.get("x-session-id");

    const docs = await db.document.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { createdAt: "desc" },
    });

    const data: DocumentMeta[] = docs.map((d) => ({
      id: d.id,
      filename: d.filename,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      status: d.status as DocumentMeta["status"],
      chunkCount: d.chunkCount,
      errorMsg: d.errorMsg,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));

    return NextResponse.json<ApiResponse<DocumentMeta[]>>({
      ok: true,
      data,
    });
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: "Failed to list documents",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------
// POST /api/documents — upload + ingest a new document
// ----------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const sessionId = req.headers.get("x-session-id") || undefined;
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: "No file uploaded. Use multipart/form-data with field 'file'." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: "Uploaded file is empty." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
        { status: 413 }
      );
    }

    if (!isSupportedMimeType(file.type)) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: `Unsupported file type: ${file.type || "unknown"}. Supported: PDF, DOCX, TXT, MD.`,
        },
        { status: 415 }
      );
    }

    // Enforce max documents limit (per session if available)
    const currentCount = await db.document.count({
      where: sessionId ? { sessionId } : undefined,
    });
    if (currentCount >= MAX_DOCUMENTS) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: `Document limit reached (${MAX_DOCUMENTS}). Delete an existing document before uploading a new one.`,
        },
        { status: 409 }
      );
    }

    // Create the document row first (status = "processing")
    const doc = await db.document.create({
      data: {
        sessionId: sessionId || null,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type || sniffMimeFromName(file.name),
        status: "processing",
      },
    });

    // Read buffer + run ingestion pipeline
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await ingestDocument({
      documentId: doc.id,
      buffer,
      mimeType: doc.mimeType,
      filename: doc.filename,
    });

    return NextResponse.json<ApiResponse<{ id: string; chunkCount: number; totalTokens: number }>>(
      {
        ok: true,
        data: {
          id: result.documentId,
          chunkCount: result.chunkCount,
          totalTokens: result.totalTokens,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: "Document ingestion failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

/** Best-effort MIME sniffing from extension. */
function sniffMimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf": return "application/pdf";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt": return "text/plain";
    case "md": return "text/markdown";
    default: return "application/octet-stream";
  }
}
