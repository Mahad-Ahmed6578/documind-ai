#!/usr/bin/env bash
# ============================================================
# Create a downloadable ZIP of the entire RAG project
# ============================================================
# Includes:
#   - All source code (src/, prisma/, public/)
#   - Configuration files (package.json, tsconfig, etc.)
#   - Documentation (README, .env.example)
#   - QA test scripts (scripts/)
#   - Deliverables (download/ — PDF report, architecture diagram, screenshots)
#   - Sample test documents
#
# Excludes (via .gitignore + explicit excludes):
#   - node_modules/ (user runs `bun install` after extraction)
#   - .next/ (build cache)
#   - db/ (SQLite database file — regenerated on `bun run db:push`)
#   - .env (contains secrets — user copies from .env.example)
#   - dev.log, server.log
# ============================================================

set -euo pipefail

PROJECT_DIR="/home/z/my-project"
OUTPUT_ZIP="/home/z/my-project/download/rag-document-qa-project.zip"
STAGING_DIR="/tmp/rag-zip-staging"

# Clean up any previous staging dir
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/rag-document-qa"

echo "==> Staging project files..."

# ─── Source code ─────────────────────────────────────────────
mkdir -p "$STAGING_DIR/rag-document-qa/src"
cp -r "$PROJECT_DIR/src/"* "$STAGING_DIR/rag-document-qa/src/"

# ─── Prisma schema ───────────────────────────────────────────
mkdir -p "$STAGING_DIR/rag-document-qa/prisma"
cp "$PROJECT_DIR/prisma/schema.prisma" "$STAGING_DIR/rag-document-qa/prisma/"

# ─── Public assets ───────────────────────────────────────────
if [ -d "$PROJECT_DIR/public" ]; then
  cp -r "$PROJECT_DIR/public" "$STAGING_DIR/rag-document-qa/"
fi

# ─── Scripts (QA tests, generators, sample docs) ─────────────
mkdir -p "$STAGING_DIR/rag-document-qa/scripts"
cp -r "$PROJECT_DIR/scripts/"* "$STAGING_DIR/rag-document-qa/scripts/"

# ─── Deliverables (PDF report, architecture diagram, screenshots) ──
mkdir -p "$STAGING_DIR/rag-document-qa/download"
cp "$PROJECT_DIR/download/"*.pdf "$STAGING_DIR/rag-document-qa/download/" 2>/dev/null || true
cp "$PROJECT_DIR/download/"*.png "$STAGING_DIR/rag-document-qa/download/" 2>/dev/null || true

# ─── Config files ────────────────────────────────────────────
cp "$PROJECT_DIR/package.json" "$STAGING_DIR/rag-document-qa/"
cp "$PROJECT_DIR/tsconfig.json" "$STAGING_DIR/rag-document-qa/"
cp "$PROJECT_DIR/next.config.ts" "$STAGING_DIR/rag-document-qa/"
cp "$PROJECT_DIR/tailwind.config.ts" "$STAGING_DIR/rag-document-qa/" 2>/dev/null || true
cp "$PROJECT_DIR/postcss.config.mjs" "$STAGING_DIR/rag-document-qa/"
cp "$PROJECT_DIR/components.json" "$STAGING_DIR/rag-document-qa/"
cp "$PROJECT_DIR/eslint.config.mjs" "$STAGING_DIR/rag-document-qa/"
cp "$PROJECT_DIR/bun.lock" "$STAGING_DIR/rag-document-qa/" 2>/dev/null || true
cp "$PROJECT_DIR/.gitignore" "$STAGING_DIR/rag-document-qa/"

# ─── Environment example (NOT the actual .env with secrets) ──
cp "$PROJECT_DIR/.env.example" "$STAGING_DIR/rag-document-qa/"

# ─── Documentation ───────────────────────────────────────────
cp "$PROJECT_DIR/README.md" "$STAGING_DIR/rag-document-qa/"

# ─── Caddyfile (for local proxy if needed) ───────────────────
cp "$PROJECT_DIR/Caddyfile" "$STAGING_DIR/rag-document-qa/" 2>/dev/null || true

# ─── Create a SETUP.md with quick-start instructions ─────────
cat > "$STAGING_DIR/rag-document-qa/SETUP.md" << 'SETUPEOF'
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

1. Push this folder to a new GitHub repository
2. Go to https://vercel.com/new
3. Import your repository
4. Set environment variables (copy from `.env.example`)
5. For production database: switch `prisma/schema.prisma` provider to `"postgresql"` and set `DATABASE_URL` to Vercel Postgres
6. Deploy!

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
SETUPEOF

# ─── Remove any leftover dev artifacts from staging ──────────
rm -f "$STAGING_DIR/rag-document-qa/dev.log"
rm -f "$STAGING_DIR/rag-document-qa/server.log"
rm -rf "$STAGING_DIR/rag-document-qa/.next"
rm -rf "$STAGING_DIR/rag-document-qa/node_modules"
rm -rf "$STAGING_DIR/rag-document-qa/db"
rm -rf "$STAGING_DIR/rag-document-qa/.zscripts"
rm -rf "$STAGING_DIR/rag-document-qa/skills"
rm -rf "$STAGING_DIR/rag-document-qa/examples"

# ─── Create the ZIP ──────────────────────────────────────────
echo "==> Creating ZIP archive..."
cd "$STAGING_DIR"
zip -r "$OUTPUT_ZIP" rag-document-qa/ -x "*/.DS_Store" "*/Thumbs.db" > /dev/null

# ─── Report size ─────────────────────────────────────────────
SIZE=$(du -h "$OUTPUT_ZIP" | cut -f1)
FILES=$(find "$STAGING_DIR/rag-document-qa" -type f | wc -l)
echo ""
echo "✅ ZIP created: $OUTPUT_ZIP"
echo "   Size: $SIZE"
echo "   Files: $FILES"
echo ""

# List top-level contents of the ZIP
echo "==> ZIP contents (top-level):"
unzip -l "$OUTPUT_ZIP" | head -30
echo "   ..."
echo ""
rm -rf "$STAGING_DIR"
