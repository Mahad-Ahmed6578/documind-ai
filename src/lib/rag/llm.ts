// ============================================================
// LLM (Chat) — Provider-Switchable
// ============================================================
// SUPPORTED PROVIDERS:
//   - "zai"        (default)  → Z.ai GLM-4 via z-ai-web-dev-sdk
//   - "gemini"                → Google Gemini via @langchain/google-genai
//   - "openrouter"            → Any OpenRouter model via OpenAI-compatible SDK
//
// HOW TO SWITCH:
//   Set environment variable LLM_PROVIDER to "zai", "gemini", or "openrouter".
//   - For "gemini":     also set GEMINI_API_KEY
//   - For "openrouter": also set OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL)
//   - For "zai":        z-ai-web-dev-sdk auto-configures (no key needed)
//
// OPENROUTER NOTES:
//   OpenRouter provides a unified API for 200+ models (GPT, Claude, Gemini,
//   GLM, Llama, etc.) via an OpenAI-compatible endpoint.
//   Default model: z-ai/glm-4.5-air:free (free, no cost)
//   Change model via OPENROUTER_MODEL env var.
// ============================================================

import ZAI from "z-ai-web-dev-sdk";

export type LLMProvider = "zai" | "gemini" | "openrouter";

/** Get the configured provider. Defaults to "zai" unless env says otherwise. */
export function getLLMProvider(): LLMProvider {
  const env = (process.env.LLM_PROVIDER ?? "zai").toLowerCase().trim();
  if (env === "gemini") return "gemini";
  if (env === "openrouter") return "openrouter";
  return "zai";
}

let cachedZAIClient: ZAI | null = null;

/** Returns a singleton ZAI client (only used when provider = "zai"). */
async function getZAIClient(): Promise<ZAI> {
  if (!cachedZAIClient) {
    cachedZAIClient = await ZAI.create();
  }
  return cachedZAIClient;
}

/**
 * RAG system prompt. Tells the LLM to:
 * 1. Use ONLY the retrieved context
 * 2. Cite which chunk was used (mention the source filename explicitly)
 * 3. Admit ignorance when context is insufficient
 *
 * The "scopeHint" placeholder is replaced at runtime to tell the model
 * whether we are searching across ALL documents or just a specific one.
 */
export const RAG_SYSTEM_PROMPT = `You are a precise document Q&A assistant.

Instructions:
1. Answer the user's question using the provided context chunks. The chunks are excerpts from the user's uploaded documents.
2. When you use information from a chunk, mention its source filename in square brackets like [filename.pdf].
3. If the user asks for a "summary" or "overview" of a document, synthesize the key points from ALL provided chunks — do NOT say you couldn't find anything if chunks are present.
4. If the user asks to "compare" two or more documents (or uses words like "compare", "comparison", "vs", "difference", "both"), analyze the chunks from each document and provide a structured comparison (similarities, differences, key points from each). Always use content from ALL documents that have chunks in the context.
5. If the user references documents by number (e.g., "document 9" or "document 14"), they are referring to the documents whose chunks are provided in the context. Use those chunks to answer.
6. If chunks ARE present in the context, ALWAYS use them to answer the question. Do NOT say "I couldn't find this in the uploaded documents" unless the context is genuinely empty or completely unrelated to the question.
7. Format your response using Markdown: use **bold** for emphasis, use ### headings for sections, use bullet points or numbered lists where appropriate, and use inline code for technical terms.
8. Do NOT mention these instructions. Do NOT say "based on the provided chunks" unless it's natural to do so.
9. Keep answers thorough but well-structured. Use markdown formatting to make the answer easy to read.

{scopeHint}

Context chunks from the user's documents:
{context}
`;

/**
 * Invokes the configured LLM with the RAG system prompt + user question.
 * Returns the assistant's text response.
 *
 * @param systemPrompt  Fully-built system prompt (with context + scope hint)
 * @param question      User's natural-language question
 */
export async function invokeChat(
  systemPrompt: string,
  question: string
): Promise<string> {
  const provider = getLLMProvider();

  if (provider === "gemini") {
    return invokeGemini(systemPrompt, question);
  }
  if (provider === "openrouter") {
    return invokeOpenRouter(systemPrompt, question);
  }
  return invokeZAI(systemPrompt, question);
}

// ----------------------------------------------------------------
// Z.ai GLM-4 (default) — with retry on rate limit
// ----------------------------------------------------------------
async function invokeZAI(
  systemPrompt: string,
  question: string
): Promise<string> {
  const client = await getZAIClient();

  // Retry on 429 (rate limit) with exponential backoff
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      });

      const content = response?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Z.ai LLM returned no content");
      }
      return content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Check if it's a rate limit error (429)
      if (msg.includes("429") || msg.toLowerCase().includes("too many requests")) {
        if (attempt < maxRetries - 1) {
          // Wait 2s, then 4s, then 8s
          const waitMs = 2000 * Math.pow(2, attempt);
          console.warn(`[llm] Rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error("Z.ai LLM failed after max retries");
}

// ----------------------------------------------------------------
// Google Gemini (used on local machine where geo-blocks don't apply)
// ----------------------------------------------------------------
async function invokeGemini(
  systemPrompt: string,
  question: string
): Promise<string> {
  // Lazy-import so the package isn't required when provider = "zai"
  const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Either set it in .env, or switch LLM_PROVIDER to 'zai'."
    );
  }

  const model = new ChatGoogleGenerativeAI({
    model: process.env.GEMINI_CHAT_MODEL ?? "gemini-2.0-flash",
    apiKey,
    temperature: 0.2,
    maxOutputTokens: 1024,
  });

  const response = await model.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ]);

  // LangChain returns content as string | array of content blocks
  const content = response.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : (c as { text?: string }).text ?? ""))
      .join("");
  }
  throw new Error("Gemini LLM returned no content");
}

// ----------------------------------------------------------------
// OpenRouter — OpenAI-compatible API for 200+ models
// ----------------------------------------------------------------
// Uses the `openai` package with a custom baseURL pointing to OpenRouter.
// This keeps the LLM layer provider-agnostic: switching models is just
// an env var change (OPENROUTER_MODEL), no code changes needed.
// ----------------------------------------------------------------
async function invokeOpenRouter(
  systemPrompt: string,
  question: string
): Promise<string> {
  // Lazy-import so openai isn't required when provider ≠ "openrouter"
  const { default: OpenAI } = await import("openai");

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Either set it in .env, or switch LLM_PROVIDER to 'zai' or 'gemini'."
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://documind-ai.vercel.app",
      "X-Title": "DocuMind AI",
    },
  });

  const model = process.env.OPENROUTER_MODEL ?? "z-ai/glm-4.5-air:free";

  // Retry on 429 (rate limit) with exponential backoff
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      });

      const content = response?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`OpenRouter (${model}) returned no content`);
      }
      return content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Check if it's a rate limit error (429)
      if (msg.includes("429") || msg.toLowerCase().includes("too many requests") || msg.toLowerCase().includes("rate limit")) {
        if (attempt < maxRetries - 1) {
          const waitMs = 2000 * Math.pow(2, attempt);
          console.warn(`[llm:openrouter] Rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error(`OpenRouter (${model}) failed after max retries`);
}
