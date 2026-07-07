# Quick Start Guide

## 1. Install Dependencies

```bash
# Using Bun (recommended — fastest)
bun install

# OR using npm
npm install
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your preferred providers:

```bash
# LLM Provider (chat responses)
LLM_PROVIDER=zai      # default, free, no API key needed
# LLM_PROVIDER=gemini # Google Gemini, requires GEMINI_API_KEY

# Embedding Provider (text → vectors)
EMBED_PROVIDER=glm4   # default, GLM-4 Semantic (512-dim), no API key
# EMBED_PROVIDER=tfidf  # TF-IDF (256-dim), no API key
# EMBED_PROVIDER=gemini # Gemini (768-dim), requires GEMINI_API_KEY

# Vector Store Provider
VECTOR_STORE_PROVIDER=memory    # default, in-memory
# VECTOR_STORE_PROVIDER=pinecone # Pinecone, requires PINECONE_API_KEY
```

## 3. Initialize Database

```bash
bun run db:push
# or: npx prisma db push
```

## 4. Start Dev Server

```bash
bun run dev
# or: npm run dev
```

Open http://localhost:3000

## 5. Run QA Tests (optional)

```bash
bash scripts/qa-test.sh           # TXT flow (9 tests)
bash scripts/qa-test-pdf.sh       # PDF flow (4 tests)
bash scripts/qa-test-scoped.sh    # Document-scoped queries (5 tests)
bash scripts/qa-test-summary.sh   # Summary queries (6 tests)
bash scripts/qa-test-comparison.sh # Comparison queries (4 tests)
```

## 6. Deploy to Vercel

1. Push this folder to a new GitHub repository.
2. Go to https://vercel.com/new.
3. Import your repository.
4. Set environment variables from `.env.example`.
5. Set `DATABASE_URL` to Vercel Postgres. Prisma generation will automatically use the PostgreSQL schema for non-file URLs.
6. Deploy.

## 7. Deploy to Render

1. Push this folder to GitHub.
2. Go to https://dashboard.render.com/new/blueprint.
3. Select the repository so Render reads the included [render.yaml](render.yaml).
4. Let Render provision the web service and PostgreSQL database.
5. Set any optional env vars you need for Gemini or Pinecone.
6. Deploy. The build will generate the Prisma client from the PostgreSQL schema automatically.

## Project Structure

```
rag-document-qa/
├── src/                    # Application source code
│   ├── app/                # Next.js App Router (pages + API routes)
│   ├── components/         # React components (rag/ + ui/)
│   ├── hooks/              # Client-side hooks (use-rag, use-toast)
│   └── lib/                # Core libraries (rag pipeline, db, types)
├── prisma/                 # Database schema
├── scripts/                # QA tests + report generators
├── download/               # Deliverables (PDF report, diagrams)
├── public/                 # Static assets
├── .env.example            # Environment variable template
├── package.json
├── README.md               # Full documentation
└── SETUP.md                # This file
```

## Documentation

- **README.md** — Full project documentation
- **download/RAG-Document-QA-Technical-Report.pdf** — 20+ page technical report
- **download/architecture-diagram.png** — System architecture diagram
