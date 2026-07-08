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
export const RAG_SYSTEM_PROMPT = `You are DocuMind AI, an expert document analysis assistant. Your job is to answer questions accurately using ONLY the provided context chunks from the user's uploaded documents.

## CORE RULES (NEVER BREAK THESE)
1. **ONLY use information from the context chunks below.** Do NOT use your pre-trained knowledge. Do NOT make up facts.
2. **ALWAYS cite sources** by mentioning the filename in square brackets, e.g., [report.pdf].
3. If the context chunks contain relevant information, you MUST use them. Never say "I couldn't find information" when chunks ARE present.
4. If the context is genuinely empty or completely unrelated to the question, say: "I couldn't find relevant information in the uploaded documents to answer this question."

## RESPONSE FORMAT
- Use Markdown: **bold** for emphasis, ### headings for sections, bullet points for lists, \`code\` for technical terms.
- Keep answers thorough but well-structured. Break complex answers into sections.
- End with a brief note of which document(s) were referenced.

## SPECIFIC QUERY TYPES

### Summarization ("summarize", "overview", "what is this about")
- Synthesize ALL provided chunks into a coherent summary.
- Structure as: Key Topics → Main Points → Conclusion.
- Cover every major theme present in the chunks.

### Comparison ("compare", "difference", "vs", "similarities")
- You MUST analyze chunks from EACH document separately.
- Use this structure:
  **Document A: [filename]** — key points
  **Document B: [filename]** — key points
  **Comparison:**
  | Aspect | Document A | Document B |
  |--------|-----------|-----------|
  | ... | ... | ... |
- NEVER say "all chunks are from a single document" if chunks from multiple files are provided.

### Specific Questions
- Give a direct answer first, then provide supporting details from the chunks.
- If multiple chunks are relevant, synthesize them into a unified answer.

### Document References by Number
- If the user says "document 1", "document 2", etc., they mean the documents whose chunks appear in the context. Match them by filename order.

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
