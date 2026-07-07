// ============================================================
// Text Splitter — chunking documents for RAG
// ============================================================
// We use LangChain's RecursiveCharacterTextSplitter because it
// preserves sentence/paragraph boundaries better than naive
// fixed-length chunking.
//
// CHUNKING STRATEGY:
//   - chunkSize: 1500 chars (~375 tokens) — larger chunks give the
//     LLM more context per citation
//   - chunkOverlap: 300 chars preserves context across boundaries
//   - separators: ordered by preference — paragraphs first, then
//     sentences, then words
//   - If a single chunk is > 1500 chars with no separator, it gets
//     force-split at 1500 char boundaries (the splitter handles this)
// ============================================================

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const SPLITTER_CONFIG = {
  chunkSize: 1500,
  chunkOverlap: 300,
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
 * Splits raw text into chunk strings.
 * - Empty chunks are filtered out.
 * - Very short chunks (< 50 chars) are merged with the previous chunk.
 * - If the text is one long line with no separators, force-split it.
 */
export async function splitText(text: string): Promise<string[]> {
  const splitter = getSplitter();
  let chunks = await splitter.splitText(text);

  // Filter out empty/whitespace-only chunks
  chunks = chunks.filter((c) => c.trim().length > 0);

  // Merge very short chunks into the previous one
  const merged: string[] = [];
  for (const chunk of chunks) {
    if (chunk.trim().length < 50 && merged.length > 0) {
      merged[merged.length - 1] += "\n" + chunk;
    } else {
      merged.push(chunk);
    }
  }

  // If we ended up with 1 huge chunk (no separators found), force-split it
  if (merged.length === 1 && merged[0].length > 2000) {
    const big = merged[0];
    const forced: string[] = [];
    for (let i = 0; i < big.length; i += 1500) {
      const slice = big.slice(i, i + 1500);
      if (slice.trim().length > 0) {
        forced.push(slice);
      }
    }
    return forced;
  }

  return merged;
}
