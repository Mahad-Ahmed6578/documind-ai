// ============================================================
// Document Parser — extract plain text from PDF/DOCX/TXT/MD
// ============================================================
// Supported MIME types:
//   - application/pdf                → pdf-parse v2 (PDFParse class)
//   - application/vnd.openxmlformats-officedocument.wordprocessingml.document
//                                    → mammoth (DOCX)
//   - text/plain, text/markdown      → UTF-8 decode
// ============================================================

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import path from "node:path";

// Configure pdf-parse worker to use the bundled pdfjs-dist worker.
// Without this, Turbopack rewrites the import path and the worker can't be found.
let workerConfigured = false;
function ensureWorkerConfigured() {
  if (workerConfigured) return;
  try {
    // Resolve the worker file path from pdfjs-dist
    const workerPath = path.resolve(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"
    );
    PDFParse.setWorker(workerPath);
  } catch {
    // If worker setup fails, pdfjs will fall back to fake worker (main thread)
  }
  workerConfigured = true;
}

export interface ParseResult {
  text: string;
  pageCount?: number;
  warnings: string[];
}

/** Returns true if the mime type is supported by this parser. */
export function isSupportedMimeType(mime: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(mime);
}

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "application/octet-stream", // sometimes returned for .md / .txt
];

/**
 * Parses a raw file buffer into plain text.
 * Throws a descriptive Error if the format is unsupported or the parser fails.
 */
export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ParseResult> {
  const warnings: string[] = [];

  switch (mimeType) {
    case "application/pdf":
      return parsePdf(buffer);

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return parseDocx(buffer);

    case "text/plain":
    case "text/markdown":
    case "application/octet-stream":
      // For octet-stream, sniff by file extension as fallback
      if (mimeType === "application/octet-stream") {
        const ext = filename.toLowerCase().split(".").pop() ?? "";
        if (ext === "pdf") return parsePdf(buffer);
        if (ext === "docx") return parseDocx(buffer);
        warnings.push(
          `Unknown file extension "${ext}", treating as plain text.`
        );
      }
      return {
        text: buffer.toString("utf-8"),
        warnings,
      };

    default:
      throw new Error(
        `Unsupported file type: ${mimeType}. Supported: PDF, DOCX, TXT, MD.`
      );
  }
}

async function parsePdf(buffer: Buffer): Promise<ParseResult> {
  try {
    ensureWorkerConfigured();
    // pdf-parse v2 API: instantiate PDFParse with { data: Uint8Array }
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();

    const text = (result.text ?? "").trim();
    if (!text) {
      return {
        text: "",
        pageCount: result.total,
        warnings: [
          "PDF contained no extractable text. It may be a scanned image — OCR is not supported.",
        ],
      };
    }
    return {
      text,
      pageCount: result.total,
      warnings: [],
    };
  } catch (err) {
    throw new Error(
      `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function parseDocx(buffer: Buffer): Promise<ParseResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = (result.value ?? "").trim();
    if (!text) {
      return {
        text: "",
        warnings: ["DOCX contained no extractable text."],
      };
    }
    return {
      text,
      warnings: result.messages?.map((m) => m.message) ?? [],
    };
  } catch (err) {
    throw new Error(
      `Failed to parse DOCX: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
