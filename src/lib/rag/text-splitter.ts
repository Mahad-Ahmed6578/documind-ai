// ============================================================
// Text Splitter — chunking documents for RAG
// ============================================================
// Uses LangChain's RecursiveCharacterTextSplitter with metadata-
// enriched chunks for better retrieval quality.
//
// CHUNKING STRATEGY:
//   - chunkSize: 1000 chars (~250 tokens) — tighter chunks for
//     more specific retrieval
//   - chunkOverlap: 200 chars preserves context across boundaries
//   - Page number tracking from PDF markers
//   - Metadata header prepended to each chunk for context
//   - Text cleaning: collapse whitespace, normalize newlines
// ============================================================

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const SPLITTER_CONFIG = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ["\n\n\n", "\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ", ""],
};

let cachedSplitter: RecursiveCharacterTextSplitter | null = null;

export function getSplitter() {
  if (!cachedSplitter) {
    cachedSplitter = new RecursiveCharacterTextSplitter(SPLITTER_CONFIG);
  }
  return cachedSplitter;
}

/** Rough token estimate (~4 chars per token — close enough for budgeting). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Clean raw extracted text:
 *  - Collapse 3+ newlines into 2
 *  - Collapse multiple spaces into single
 *  - Trim leading/trailing whitespace
 */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")         // normalize line endings
    .replace(/\n{3,}/g, "\n\n")     // collapse excessive newlines
    .replace(/[ \t]{2,}/g, " ")     // collapse multiple spaces
    .trim();
}

/**
 * Detect page markers inserted by pdf-parse (e.g., "-- 3 of 10 --")
 * and return a map of character offset → page number.
 */
function buildPageMap(text: string): Map<number, number> {
  const pageMap = new Map<number, number>();
  const pageRegex = /--\s*(\d+)\s+of\s+\d+\s*--/g;
  let match: RegExpExecArray | null;
  while ((match = pageRegex.exec(text)) !== null) {
    pageMap.set(match.index, parseInt(match[1], 10));
  }
  return pageMap;
}

/**
 * Find the page number for a given chunk by checking its position
 * relative to the page markers.
 */
function getPageForChunk(chunkStart: number, pageMap: Map<number, number>): number | null {
  let bestPage: number | null = null;
  let bestOffset = -1;
  for (const [offset, page] of pageMap) {
    if (offset <= chunkStart && offset > bestOffset) {
      bestOffset = offset;
      bestPage = page;
    }
  }
  return bestPage;
}

/**
 * Splits raw text into chunk strings with metadata enrichment.
 * - Empty chunks are filtered out.
 * - Very short chunks (< 40 chars) are merged with the previous chunk.
 * - Each chunk gets a metadata header: [Source: filename | Page: X | Chunk: Y]
 * - If the text is one long line with no separators, force-split it.
 */
export async function splitText(text: string, filename?: string): Promise<string[]> {
  const cleaned = cleanText(text);
  const pageMap = buildPageMap(cleaned);
  const splitter = getSplitter();
  let chunks = await splitter.splitText(cleaned);

  // Filter out empty/whitespace-only chunks
  chunks = chunks.filter((c) => c.trim().length > 0);

  // Merge very short chunks into the previous one
  const merged: string[] = [];
  for (const chunk of chunks) {
    if (chunk.trim().length < 40 && merged.length > 0) {
      merged[merged.length - 1] += "\n" + chunk;
    } else {
      merged.push(chunk);
    }
  }

  // If we ended up with 1 huge chunk (no separators found), force-split it
  if (merged.length === 1 && merged[0].length > 1500) {
    const big = merged[0];
    const forced: string[] = [];
    for (let i = 0; i < big.length; i += 1000) {
      const slice = big.slice(i, i + 1000);
      if (slice.trim().length > 0) {
        forced.push(slice);
      }
    }
    return addMetadataHeaders(forced, cleaned, pageMap, filename);
  }

  return addMetadataHeaders(merged, cleaned, pageMap, filename);
}

/**
 * Add metadata header to each chunk for better retrieval context.
 */
function addMetadataHeaders(
  chunks: string[],
  fullText: string,
  pageMap: Map<number, number>,
  filename?: string
): string[] {
  return chunks.map((chunk, i) => {
    // Find approximate position of this chunk in the original text
    const chunkStart = fullText.indexOf(chunk.slice(0, 50));
    const page = chunkStart >= 0 ? getPageForChunk(chunkStart, pageMap) : null;

    const parts: string[] = [];
    if (filename) parts.push(`Source: ${filename}`);
    if (page !== null) parts.push(`Page: ${page}`);
    parts.push(`Chunk: ${i + 1} of ${chunks.length}`);

    const header = `[${parts.join(" | ")}]`;
    return `${header}\n${chunk}`;
  });
}
