# 🧠 DocuMind AI

> **Enterprise AI Document Intelligence Platform** — Upload PDFs, DOCX, or TXT files and ask questions. Get cited, grounded answers powered by RAG (Retrieval-Augmented Generation) with swappable LLM providers, production-grade vector search, and PostgreSQL persistence.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)](https://www.prisma.io/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?logo=supabase)](https://supabase.com/)
[![Pinecone](https://img.shields.io/badge/Pinecone-Vector_DB-000?logo=pinecone)](https://www.pinecone.io/)
[![OpenRouter](https://img.shields.io/badge/OpenRouter-LLM_Gateway-6366f1)](https://openrouter.ai/)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000?logo=vercel)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 🎯 What This Project Demonstrates

| Category | Details |
|----------|---------|
| **LLM Providers** | OpenRouter (200+ models, default: GLM-4.5-Air), Google Gemini, Z.ai GLM-4 |
| **Embedding Providers** | Gemini text-embedding-004 (768d), GLM-4 Semantic (512d), TF-IDF (256d) |
| **Vector Stores** | Pinecone (production), In-memory (development) |
| **Database** | Supabase PostgreSQL (production), SQLite (development) |
| **Key Features** | Document-scoped queries, comparison boost, citation support, markdown rendering, localStorage persistence |

### Architecture Overview

```
                    User
                     │
                     ▼
        ┌────────────────────────┐
        │   Next.js Frontend     │
        │   (React 19 + Tailwind)│
        └───────────┬────────────┘
                    │
                    ▼
        ┌────────────────────────┐
        │   API Routes (App Dir) │
        │   /api/documents       │
        │   /api/query           │
        │   /api/health          │
        └───┬──────────┬─────────┘
            │          │
     ┌──────┘          └──────┐
     ▼                        ▼
┌──────────┐          ┌──────────────┐
│ Supabase │          │  RAG Engine  │
│ PostgreSQL│         │              │
│ (Prisma) │          │ ┌──────────┐ │
└──────────┘          │ │Embeddings│ │
                      │ │(Gemini)  │ │
                      │ └────┬─────┘ │
                      │      ▼       │
                      │ ┌──────────┐ │
                      │ │ Pinecone │ │
                      │ │(Search)  │ │
                      │ └────┬─────┘ │
                      │      ▼       │
                      │ ┌──────────┐ │
                      │ │OpenRouter│ │
                      │ │(LLM)    │ │
                      │ └──────────┘ │
                      └──────────────┘
```

---

## 🧠 How It Works (4 Phases)

### Phase 1 — Document Upload
User drops a file (PDF/DOCX/TXT/MD, max 25 MB). API validates and creates a `Document` row. Supports up to 50 documents.

### Phase 2 — Ingestion Pipeline (< 3s)
1. **Parse** — pdf-parse / mammoth / UTF-8 reader
2. **Chunk** — LangChain RecursiveCharacterTextSplitter (1500 chars, 300 overlap) + force-split fallback
3. **Embed** — Gemini text-embedding-004 (768-dim transformer embeddings)
4. **Persist** — Prisma → PostgreSQL (metadata) + Pinecone (vectors)

### Phase 3 — Query & Retrieval (~50ms)
1. Embed question using same Gemini embedder
2. Vector search via Pinecone → top K=6 most relevant chunks
3. **Fallback**: if 0 results, return first N chunks per document
4. **Comparison boost**: if "compare" + 2+ docs selected, fetch from ALL docs

### Phase 4 — Generation (~700ms)
1. Build RAG prompt with retrieved chunks + scope hint
2. Call GLM-4.5-Air via OpenRouter (with 429 retry + exponential backoff)
3. Render markdown response (headings, bold, lists, tables, LaTeX math)
4. Save to localStorage → conversation survives page refresh

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- npm or bun

### Local Development

```bash
# 1. Clone
git clone https://github.com/Mahad-Ahmed6578/documind-ai.git
cd documind-ai

# 2. Install
npm install

# 3. Configure
cp .env.example .env.local
# Edit .env.local — set your API keys

# 4. Initialize DB (SQLite for local dev)
npm run db:push

# 5. Run
npm run dev
# Open http://localhost:3000
```

### Using SQLite (Local Dev)
Set `DATABASE_URL=file:./db/custom.db` in `.env.local` — zero configuration needed.

### Using PostgreSQL (Production)
Set `DATABASE_URL` to your Supabase/PostgreSQL connection string. The Prisma schema auto-detects the provider.

---

## 🔧 Configuration

All providers are **swappable via environment variables** — no code changes required.

### LLM Provider
```bash
LLM_PROVIDER=openrouter  # Default: GLM-4.5-Air via OpenRouter (free)
LLM_PROVIDER=gemini      # Google Gemini (requires GEMINI_API_KEY)
LLM_PROVIDER=zai         # Z.ai GLM-4 (free, no key required)
```

### OpenRouter Configuration
```bash
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENROUTER_MODEL=z-ai/glm-4.5-air:free     # Default
# Other free models:
# OPENROUTER_MODEL=openai/gpt-oss-120b:free
# OPENROUTER_MODEL=google/gemma-4-31b:free
```

### Embedding Provider
```bash
EMBED_PROVIDER=gemini  # Gemini text-embedding-004 (768-dim, best quality)
EMBED_PROVIDER=glm4    # GLM-4 Semantic (512-dim, local, no API)
EMBED_PROVIDER=tfidf   # TF-IDF (256-dim, fastest, no API)
```

### Vector Store Provider
```bash
VECTOR_STORE_PROVIDER=pinecone  # Production: Pinecone managed vector DB
VECTOR_STORE_PROVIDER=memory    # Development: in-memory via Prisma
```

---

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── documents/         # GET, POST, DELETE document endpoints
│   │   ├── query/             # POST — RAG query with document scope
│   │   └── health/            # GET — system status + provider config
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/rag/
│   ├── header.tsx             # Live config badges (LLM · Embed · VectorDB)
│   ├── document-uploader.tsx  # Drag & drop file upload
│   ├── document-list.tsx      # Selection checkboxes for scoped queries
│   ├── chat-interface.tsx     # Fixed scroll + markdown rendering
│   ├── source-citations.tsx   # Cited chunk references
│   └── markdown-renderer.tsx  # Full markdown + LaTeX math support
├── hooks/
│   └── use-rag.ts             # Zustand store + localStorage persistence
├── lib/
│   ├── db.ts                  # Prisma client singleton
│   ├── documents-store.ts     # Zustand shared state
│   ├── types.ts               # TypeScript interfaces
│   └── rag/
│       ├── document-parser.ts  # PDF/DOCX/TXT parser
│       ├── text-splitter.ts    # 1500 chars + force-split
│       ├── embeddings.ts       # 3 providers: tfidf, glm4, gemini
│       ├── vector-store.ts     # 2 stores: memory, pinecone
│       ├── pinecone-store.ts   # Pinecone integration
│       ├── llm.ts              # 3 LLMs: zai, gemini, openrouter
│       └── rag-pipeline.ts     # Fallback + comparison boost
prisma/
├── schema.prisma              # SQLite (local development)
└── schema.postgresql.prisma   # PostgreSQL (production)
```

---

## 🗄️ Database Schema

```prisma
model Document {
  id         String   @id @default(cuid())
  filename   String
  fileSize   Int
  mimeType   String
  status     String   @default("processing")
  chunkCount Int      @default(0)
  errorMsg   String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  chunks     DocumentChunk[]
}

model DocumentChunk {
  id         String   @id @default(cuid())
  documentId String
  content    String
  embedding  String   // JSON-serialized vector
  chunkIndex Int
  tokenCount Int      @default(0)
}

model ChatMessage {
  id        String   @id @default(cuid())
  sessionId String
  role      String   // user | assistant
  content   String
  sources   String?  // JSON-serialized source metadata
  createdAt DateTime @default(now())
}

model Setting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}
```

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | System status, provider configs, database health |
| `POST` | `/api/documents` | Upload a document (multipart/form-data) |
| `GET` | `/api/documents` | List all uploaded documents |
| `DELETE` | `/api/documents/:id` | Delete a document and its chunks |
| `POST` | `/api/query` | Ask a question with optional document scope |

### Query Request
```json
{
  "question": "What are the key findings?",
  "documentIds": ["doc1", "doc2"],  // optional: scope to specific docs
  "sessionId": "session-uuid"
}
```

---

## ☁️ Production Deployment

### Deploy to Vercel

1. Push to GitHub
2. Import repository in Vercel
3. Set environment variables in Vercel Dashboard:
   - `DATABASE_URL` — Supabase PostgreSQL (pooler, port 6543)
   - `DIRECT_URL` — Supabase PostgreSQL (direct, port 5432)
   - `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`
   - `GEMINI_API_KEY`, `GOOGLE_API_KEY`
   - `PINECONE_API_KEY`, `PINECONE_INDEX`, `PINECONE_ENVIRONMENT`
   - `LLM_PROVIDER`, `EMBED_PROVIDER`, `VECTOR_STORE_PROVIDER`
4. Deploy — Prisma auto-generates the PostgreSQL client

### CI/CD
- Every push to `main` → triggers production deployment
- Every PR → triggers preview deployment

---

## 🔒 Security

- ✅ API keys stored exclusively in environment variables
- ✅ `.env` files excluded from version control via `.gitignore`
- ✅ Input validation on file uploads (type, size, count)
- ✅ File size limit: 25 MB per document
- ✅ MIME type validation for supported formats
- ✅ Cascading deletes for document cleanup
- ✅ Rate-limit retry with exponential backoff
- ✅ No hardcoded secrets in source code

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS 4, shadcn/ui |
| **Backend** | Next.js API Routes (App Router), Server Actions |
| **Database** | Supabase PostgreSQL (prod), SQLite (dev), Prisma ORM |
| **LLM** | OpenRouter → GLM-4.5-Air (default), Gemini, Z.ai |
| **Embeddings** | Google Gemini text-embedding-004 |
| **Vector Search** | Pinecone (serverless, AWS us-east-1) |
| **State Management** | Zustand + localStorage persistence |
| **Deployment** | Vercel (serverless) |
| **Document Parsing** | pdf-parse, mammoth (DOCX), native UTF-8 |
| **Markdown** | react-markdown, remark-gfm, rehype-katex |

---

## 📜 License

[MIT](LICENSE) — use as reference for your own portfolio.
