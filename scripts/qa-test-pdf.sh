#!/usr/bin/env bash
# QA test specifically for PDF upload + query

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PDF="/home/z/my-project/scripts/test-doc.pdf"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# Upload PDF
info "Uploading PDF ($PDF)..."
UPLOAD=$(curl -s -X POST "$BASE_URL/api/documents" \
  -F "file=@$PDF;type=application/pdf")
echo "   Response: $UPLOAD"
echo "$UPLOAD" | grep -q '"ok":true' || fail "PDF upload failed: $UPLOAD"
DOC_ID=$(echo "$UPLOAD" | grep -oE '"id":"[^"]+"' | head -1 | sed 's/"id":"//; s/"//')
info "Document ID: $DOC_ID"
pass "PDF upload succeeded"

# Wait for ingestion
info "Waiting for PDF ingestion..."
for i in $(seq 1 30); do
  sleep 2
  DOC=$(curl -s "$BASE_URL/api/documents")
  STATUS=$(echo "$DOC" | grep -oE '"status":"[^"]+"' | head -1 | sed 's/"status":"//; s/"//')
  info "Attempt $i: status=$STATUS"
  if [ "$STATUS" = "ready" ]; then
    pass "PDF ingestion complete"
    break
  fi
  if [ "$STATUS" = "error" ]; then
    fail "PDF ingestion failed: $DOC"
  fi
  [ "$i" = "30" ] && fail "PDF ingestion timed out"
done

# Query: on-call stipend
info "Query: 'How much is the on-call stipend?'"
QUERY=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"How much is the on-call stipend per week?"}')
echo "   Response (truncated): $(echo "$QUERY" | head -c 400)..."
echo "$QUERY" | grep -q '"ok":true' || fail "Query failed: $QUERY"
echo "$QUERY" | grep -iq "400" || fail "Answer should mention $400"
pass "On-call stipend query returned correct answer"

# Query: deployment time
info "Query: 'How long does a deployment take?'"
QUERY2=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"How long does an average deployment take?"}')
echo "   Response (truncated): $(echo "$QUERY2" | head -c 400)..."
echo "$QUERY2" | grep -q '"ok":true' || fail "Query failed: $QUERY2"
echo "$QUERY2" | grep -iq "18" || fail "Answer should mention 18 minutes"
pass "Deployment time query returned correct answer"

# Query: infra cost
info "Query: 'What is the monthly infrastructure cost?'"
QUERY3=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the monthly infrastructure cost?"}')
echo "   Response (truncated): $(echo "$QUERY3" | head -c 400)..."
echo "$QUERY3" | grep -q '"ok":true' || fail "Query failed: $QUERY3"
echo "$QUERY3" | grep -iq "42,000" || fail "Answer should mention $42,000"
pass "Infra cost query returned correct answer"

# Cleanup
info "Cleaning up: deleting PDF document..."
curl -s -X DELETE "$BASE_URL/api/documents/$DOC_ID" > /dev/null
pass "Cleanup complete"

echo ""
echo "============================================================"
echo -e "${GREEN}PDF QA TESTS PASSED!${NC}"
echo "============================================================"
