#!/usr/bin/env bash
# ============================================================
# QA Test: Document-Scoped Queries
# ============================================================
# Verifies that the user can restrict a query to specific documents.
# ============================================================

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
DOC1="/home/z/my-project/scripts/test-doc.txt"
DOC2="/home/z/my-project/scripts/test-doc.pdf"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

# Helper: get status of a document by ID (uses python for JSON parsing)
get_status() {
  local id="$1"
  curl -s "$BASE_URL/api/documents" | \
    python3 -c "
import json, sys
data = json.load(sys.stdin)
for d in data.get('data', []):
    if d['id'] == '$id':
        print(d['status'])
        break
"
}

# Upload DOC1
info "Uploading DOC1 (Acme Corp)..."
U1=$(curl -s -X POST "$BASE_URL/api/documents" -F "file=@$DOC1;type=text/plain")
echo "   $U1"
DOC1_ID=$(echo "$U1" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
[ -n "$DOC1_ID" ] || fail "DOC1 upload failed"
info "DOC1 ID: $DOC1_ID"
pass "DOC1 uploaded"

# Upload DOC2
info "Uploading DOC2 (Z.ai Handbook PDF)..."
U2=$(curl -s -X POST "$BASE_URL/api/documents" -F "file=@$DOC2;type=application/pdf")
echo "   $U2"
DOC2_ID=$(echo "$U2" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
[ -n "$DOC2_ID" ] || fail "DOC2 upload failed"
info "DOC2 ID: $DOC2_ID"
pass "DOC2 uploaded"

# Wait for both to be ready
info "Waiting for both docs to be ready..."
for i in $(seq 1 30); do
  sleep 2
  R1=$(get_status "$DOC1_ID")
  R2=$(get_status "$DOC2_ID")
  info "Attempt $i: DOC1=$R1, DOC2=$R2"
  if [ "$R1" = "ready" ] && [ "$R2" = "ready" ]; then
    pass "Both docs ready"
    break
  fi
  if [ "$R1" = "error" ] || [ "$R2" = "error" ]; then
    fail "Ingestion error"
  fi
  [ "$i" = "30" ] && fail "Ingestion timed out"
done

# Test 1: Query WITHOUT documentIds (search all)
info "Test 1: Query without documentIds (search all docs)..."
Q1=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"What was Acme Corp revenue in 2024?"}')
echo "$Q1" | grep -q '"ok":true' || fail "Query failed"
echo "$Q1" | grep -iq "12.5" || fail "Answer should mention 12.5M"
echo "$Q1" | grep -q '"searchedDocumentNames"' || fail "Should return searchedDocumentNames"
pass "All-docs query returns searchedDocumentNames"

# Test 2: Query scoped to DOC1 only (Acme Corp)
info "Test 2: Query scoped to DOC1 (Acme Corp)..."
Q2=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What was Acme Corp revenue in 2024?\",\"documentIds\":[\"$DOC1_ID\"]}")
echo "   $(echo "$Q2" | head -c 200)..."
echo "$Q2" | grep -q '"ok":true' || fail "Query failed"
echo "$Q2" | grep -iq "12.5" || fail "Answer should mention \$12.5M"
echo "$Q2" | grep -q "\"$DOC1_ID\"" || fail "Should include DOC1 in searched"
echo "$Q2" | grep -q "\"$DOC2_ID\"" && fail "Should NOT include DOC2 in searched"
pass "Scoped query to DOC1 returns Acme answer"

# Test 3: Query scoped to DOC2 only (Z.ai handbook)
info "Test 3: Query scoped to DOC2 (Z.ai Handbook)..."
Q3=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"How much is the on-call stipend?\",\"documentIds\":[\"$DOC2_ID\"]}")
echo "   $(echo "$Q3" | head -c 200)..."
echo "$Q3" | grep -q '"ok":true' || fail "Query failed"
echo "$Q3" | grep -iq "400" || fail "Answer should mention \$400 stipend"
echo "$Q3" | grep -q "\"$DOC2_ID\"" || fail "Should include DOC2 in searched"
echo "$Q3" | grep -q "\"$DOC1_ID\"" && fail "Should NOT include DOC1 in searched"
pass "Scoped query to DOC2 returns handbook answer"

# Test 4: Cross-document query — ask DOC2 question scoped to DOC1
info "Test 4: Cross-document query (ask DOC2 question scoped to DOC1)..."
Q4=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"How much is the on-call stipend?\",\"documentIds\":[\"$DOC1_ID\"]}")
echo "   $(echo "$Q4" | head -c 200)..."
echo "$Q4" | grep -q '"ok":true' || fail "Query failed"
echo "$Q4" | grep -iq "couldn't find\|not.*document\|not.*contain\|no information" \
  || fail "Model should admit ignorance (info is in DOC2, not DOC1)"
pass "Cross-document query correctly returns 'couldn't find'"

# Test 5: Invalid documentId → 409
info "Test 5: Query with invalid documentId (should 409)..."
HTTP_CODE=$(curl -s -o /tmp/q5.json -w "%{http_code}" -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"test","documentIds":["invalid_id_xyz"]}')
echo "   HTTP $HTTP_CODE — $(cat /tmp/q5.json | head -c 200)"
[ "$HTTP_CODE" = "409" ] || fail "Expected 409, got $HTTP_CODE"
pass "Invalid documentId returns 409"

# Cleanup
info "Cleaning up..."
curl -s -X DELETE "$BASE_URL/api/documents/$DOC1_ID" > /dev/null
curl -s -X DELETE "$BASE_URL/api/documents/$DOC2_ID" > /dev/null
pass "Cleanup done"

echo ""
echo "============================================================"
echo -e "${GREEN}DOCUMENT-SCOPED QUERY TESTS PASSED!${NC}"
echo "============================================================"
