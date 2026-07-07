// ============================================================
// /api/documents/[id] — delete a document + its chunks
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteVectorChunks } from "@/lib/rag/vector-store";
import type { ApiResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.document.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: "Document not found" },
        { status: 404 }
      );
    }

    // Delete from the configured vector store (Pinecone if enabled)
    try {
      await deleteVectorChunks(id);
    } catch (vectorErr) {
      // Log but don't fail the deletion — Prisma cascade will still clean up
      console.warn(
        `[delete] Vector store delete failed: ${
          vectorErr instanceof Error ? vectorErr.message : String(vectorErr)
        }`
      );
    }

    // Cascade delete handled by Prisma schema (onDelete: Cascade)
    await db.document.delete({ where: { id } });

    return NextResponse.json<ApiResponse<{ id: string }>>({
      ok: true,
      data: { id },
    });
  } catch (err) {
    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: "Failed to delete document",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
