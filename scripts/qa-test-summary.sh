#!/usr/bin/env bash
# ============================================================
# QA Test: Summary queries (the "couldn't find" bug fix)
# ============================================================
# Verifies that summary/overview queries always return a real
# answer, never "I couldn't find this in the uploaded documents."
#
# This tests the FALLBACK retrieval logic: when TF-IDF cosine
# similarity returns 0 chunks (because "summarize this document"
# doesn't have word overlap with the document content), the system
# falls back to returning the first few chunks of each document.
# ============================================================

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
info "Uploading PDF..."
U=$(curl -s -X POST "$BASE_URL/api/documents" -F "file=@$PDF;type=application/pdf")
DOC_ID=$(echo "$U" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
[ -n "$DOC_ID" ] || fail "Upload failed"
info "DOC ID: $DOC_ID"
pass "Upload succeeded"

# Wait for ready
for i in $(seq 1 15); do
  sleep 2
  STATUS=$(curl -s "$BASE_URL/api/documents" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for d in data.get('data',[]):
    if d['id']=='$DOC_ID':
        print(d['status'])
        break
" 2>/dev/null)
  info "Attempt $i: status=$STATUS"
  [ "$STATUS" = "ready" ] && { pass "Ready"; break; }
  [ "$STATUS" = "error" ] && fail "Ingestion error"
  [ "$i" = "15" ] && fail "Timeout"
done

# Test 1: "Provide a summary of this document" — should NOT return "couldn't find"
info "Test 1: 'Provide a summary of this document'"
Q1=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"Provide a summary of this document"}')
echo "$Q1" | grep -q '"ok":true' || fail "Query failed"
# Check that the answer is NOT "couldn't find"
ANSWER=$(echo "$Q1" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])")
SOURCE_COUNT=$(echo "$Q1" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']['sources']))")
info "Answer length: ${#ANSWER} chars, sources: $SOURCE_COUNT"
echo "$ANSWER" | grep -iq "couldn't find" && fail "Should NOT say 'couldn't find' for summary query"
[ ${#ANSWER} -gt 100 ] || fail "Answer too short (${#ANSWER} chars) — should be a real summary"
[ "$SOURCE_COUNT" -gt 0 ] || fail "Should have fallback sources"
pass "Summary query returns real answer (not 'couldn't find')"

# Test 2: "Summarize this document" — variant
info "Test 2: 'Summarize this document'"
Q2=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"Summarize this document"}')
ANSWER2=$(echo "$Q2" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])" 2>/dev/null)
echo "$ANSWER2" | grep -iq "couldn't find" && fail "Should NOT say 'couldn't find' for 'summarize'"
[ ${#ANSWER2} -gt 100 ] || fail "Answer too short"
pass "'Summarize' variant works"

# Test 3: "Give me an overview" — variant
info "Test 3: 'Give me an overview of this document'"
Q3=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"Give me an overview of this document"}')
ANSWER3=$(echo "$Q3" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])" 2>/dev/null)
echo "$ANSWER3" | grep -iq "couldn't find" && fail "Should NOT say 'couldn't find' for 'overview'"
[ ${#ANSWER3} -gt 100 ] || fail "Answer too short"
pass "'Overview' variant works"

# Test 4: "Roman Urdu summary" — multilingual query
info "Test 4: 'Is document ka summary do' (Roman Urdu)"
Q4=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"Is document ka summary do"}')
ANSWER4=$(echo "$Q4" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])" 2>/dev/null)
echo "$ANSWER4" | grep -iq "couldn't find" && fail "Should NOT say 'couldn't find' for Roman Urdu summary"
[ ${#ANSWER4} -gt 100 ] || fail "Answer too short"
pass "Roman Urdu summary query works"

# Test 5: Specific factual question still works (should find chunks via similarity)
info "Test 5: 'What is the monthly infrastructure cost?' (factual)"
Q5=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the monthly infrastructure cost?"}')
ANSWER5=$(echo "$Q5" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])" 2>/dev/null)
echo "$ANSWER5" | grep -iq "42,000\|42000" || fail "Should mention $42,000"
pass "Factual query still returns correct answer"

# Test 6: Hallucination test — ask something NOT in the document
info "Test 6: 'What is the CEO salary?' (not in doc — should admit ignorance)"
Q6=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the CEO salary?"}')
ANSWER6=$(echo "$Q6" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])" 2>/dev/null)
echo "$ANSWER6" | grep -iq "couldn't find" || fail "Should say 'couldn't find' for info not in doc"
pass "Hallucination guardrail still works"

# Cleanup
info "Cleaning up..."
curl -s -X DELETE "$BASE_URL/api/documents/$DOC_ID" > /dev/null
pass "Cleanup done"

echo ""
echo "============================================================"
echo -e "${GREEN}SUMMARY QUERY TESTS PASSED!${NC}"
echo "============================================================"
