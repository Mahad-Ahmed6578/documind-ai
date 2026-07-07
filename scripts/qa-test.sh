#!/usr/bin/env bash
# ============================================================
# QA Test Script for RAG Document Q&A System
# ============================================================
# Tests the full pipeline:
#   1. Health endpoint
#   2. Document list (empty)
#   3. Upload a TXT document
#   4. Document list (with one doc)
#   5. Wait for ingestion to complete
#   6. Ask a question (query)
#   7. Verify the answer contains expected info
#   8. Ask a question that's NOT in the doc (hallucination test)
#   9. Delete the document
#  10. Verify deletion
# ============================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_DOC="${TEST_DOC:-/home/z/my-project/scripts/test-doc.txt}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# ---- 1. Health check ----
info "1. Health check..."
HEALTH=$(curl -s "$BASE_URL/api/health")
echo "   Response: $HEALTH"
echo "$HEALTH" | grep -q '"status":"ok"' || fail "Health status not ok"
pass "Health check"

# ---- 2. Document list (empty initially) ----
info "2. List documents (should be empty)..."
LIST=$(curl -s "$BASE_URL/api/documents")
echo "   Response: $LIST"
echo "$LIST" | grep -q '"data":\[\]' || fail "Expected empty list"
pass "Empty document list"

# ---- 3. Upload document ----
info "3. Upload test document ($TEST_DOC)..."
UPLOAD=$(curl -s -X POST "$BASE_URL/api/documents" \
  -F "file=@$TEST_DOC;type=text/plain")
echo "   Response: $UPLOAD"
echo "$UPLOAD" | grep -q '"ok":true' || fail "Upload failed: $UPLOAD"
DOC_ID=$(echo "$UPLOAD" | grep -oE '"id":"[^"]+"' | head -1 | sed 's/"id":"//; s/"//')
[ -n "$DOC_ID" ] || fail "No document ID returned"
info "Document ID: $DOC_ID"
pass "Upload succeeded"

# ---- 4. Wait for ingestion ----
info "4. Waiting for ingestion to complete (max 60s)..."
for i in $(seq 1 30); do
  sleep 2
  DOC=$(curl -s "$BASE_URL/api/documents")
  STATUS=$(echo "$DOC" | grep -oE '"status":"[^"]+"' | head -1 | sed 's/"status":"//; s/"//')
  info "Attempt $i: status=$STATUS"
  if [ "$STATUS" = "ready" ]; then
    pass "Ingestion complete"
    break
  fi
  if [ "$STATUS" = "error" ]; then
    fail "Ingestion failed with status=error. Response: $DOC"
  fi
  [ "$i" = "30" ] && fail "Ingestion timed out"
done

# ---- 5. Query: ask about revenue ----
info "5. Query: 'What was Acme Corp's revenue in 2024?'"
QUERY=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"What was Acme Corp revenue in fiscal year 2024?"}')
echo "   Response: $QUERY"
echo "$QUERY" | grep -q '"ok":true' || fail "Query failed: $QUERY"
echo "$QUERY" | grep -iq "12.5" || fail "Answer should mention 12.5 million"
pass "Revenue query returned correct answer"

# ---- 6. Query: ask about funding ----
info "6. Query: 'Who led Acme Corp Series B funding round?'"
QUERY2=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"Who led the Series B funding round?"}')
echo "   Response: $QUERY2"
echo "$QUERY2" | grep -q '"ok":true' || fail "Query failed: $QUERY2"
echo "$QUERY2" | grep -iq "Andreessen" || fail "Answer should mention Andreessen Horowitz"
pass "Funding query returned correct answer"

# ---- 7. Hallucination test: ask something not in doc ----
info "7. Hallucination test: 'What is the CEO salary?' (not in doc)"
QUERY3=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the CEO salary?"}')
echo "   Response: $QUERY3"
echo "$QUERY3" | grep -q '"ok":true' || fail "Query failed: $QUERY3"
# The model should say it couldn't find this info
echo "$QUERY3" | grep -iq "couldn't find\|not.*document\|not.*contain\|no information" \
  || fail "Model should admit ignorance"
pass "Hallucination test passed (model admitted ignorance)"

# ---- 8. Delete document ----
info "8. Delete document $DOC_ID..."
DEL=$(curl -s -X DELETE "$BASE_URL/api/documents/$DOC_ID")
echo "   Response: $DEL"
echo "$DEL" | grep -q '"ok":true' || fail "Delete failed: $DEL"
pass "Document deleted"

# ---- 9. Verify deletion ----
info "9. Verify document is gone..."
LIST2=$(curl -s "$BASE_URL/api/documents")
echo "   Response: $LIST2"
echo "$LIST2" | grep -q '"data":\[\]' || fail "Document list should be empty after delete"
pass "Document list is empty after deletion"

echo ""
echo "============================================================"
echo -e "${GREEN}ALL QA TESTS PASSED!${NC}"
echo "============================================================"
