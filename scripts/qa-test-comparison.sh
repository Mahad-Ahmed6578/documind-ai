#!/usr/bin/env bash
# ============================================================
# QA Test: Comparison queries (the "couldn't find" bug fix v2)
# ============================================================
# Verifies that comparison queries between two documents work
# correctly — the LLM should return a structured comparison,
# NOT "I couldn't find this in the uploaded documents."
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

# Upload DOC1
info "Uploading DOC1..."
U1=$(curl -s -X POST "$BASE_URL/api/documents" -F "file=@$DOC1;type=text/plain")
DOC1_ID=$(echo "$U1" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
[ -n "$DOC1_ID" ] || fail "DOC1 upload failed"
pass "DOC1 uploaded"

# Upload DOC2
info "Uploading DOC2..."
U2=$(curl -s -X POST "$BASE_URL/api/documents" -F "file=@$DOC2;type=application/pdf")
DOC2_ID=$(echo "$U2" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
[ -n "$DOC2_ID" ] || fail "DOC2 upload failed"
pass "DOC2 uploaded"

# Wait for ready
for i in $(seq 1 15); do
  sleep 2
  R1=$(curl -s "$BASE_URL/api/documents" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for d in data.get('data',[]):
    if d['id']=='$DOC1_ID': print(d['status']); break
" 2>/dev/null)
  R2=$(curl -s "$BASE_URL/api/documents" | python3 -c "
import json,sys
data=json.load(sys.stdin)
for d in data.get('data',[]):
    if d['id']=='$DOC2_ID': print(d['status']); break
" 2>/dev/null)
  info "Attempt $i: DOC1=$R1, DOC2=$R2"
  [ "$R1" = "ready" ] && [ "$R2" = "ready" ] && { pass "Both ready"; break; }
  [ "$i" = "15" ] && fail "Timeout"
done

# Test 1: "compare both documents"
info "Test 1: 'compare both documents'"
Q1=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"compare both documents\",\"documentIds\":[\"$DOC1_ID\",\"$DOC2_ID\"]}")
ANSWER1=$(echo "$Q1" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])" 2>/dev/null)
SOURCES1=$(echo "$Q1" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']['sources']))" 2>/dev/null)
info "Answer length: ${#ANSWER1} chars, sources: $SOURCES1"
echo "$ANSWER1" | grep -iq "couldn't find" && fail "Should NOT say 'couldn't find'"
[ ${#ANSWER1} -gt 200 ] || fail "Answer too short"
# Should mention both documents
echo "$ANSWER1" | grep -iq "acme" || fail "Should mention Acme Corp (from DOC1)"
echo "$ANSWER1" | grep -iq "z.ai\|engineering\|handbook\|on-call\|deployment" || fail "Should mention Z.ai handbook content (from DOC2)"
pass "'compare both documents' returns proper comparison"

# Test 2: "comparison kro document 9 and 14 k" (the exact user query)
info "Test 2: 'comparison kro document 9 and 14 k'"
Q2=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"comparison kro document 9 and 14 k\",\"documentIds\":[\"$DOC1_ID\",\"$DOC2_ID\"]}")
ANSWER2=$(echo "$Q2" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])" 2>/dev/null)
info "Answer length: ${#ANSWER2} chars"
echo "$ANSWER2" | grep -iq "couldn't find" && fail "Should NOT say 'couldn't find' — should compare the available docs"
[ ${#ANSWER2} -gt 200 ] || fail "Answer too short"
pass "'comparison kro document 9 and 14 k' works"

# Test 3: "What are the differences between these documents?"
info "Test 3: 'What are the differences between these documents?'"
Q3=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What are the differences between these documents?\",\"documentIds\":[\"$DOC1_ID\",\"$DOC2_ID\"]}")
ANSWER3=$(echo "$Q3" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])" 2>/dev/null)
echo "$ANSWER3" | grep -iq "couldn't find" && fail "Should NOT say 'couldn't find'"
[ ${#ANSWER3} -gt 200 ] || fail "Answer too short"
pass "'differences between' query works"

# Test 4: Comparison WITHOUT selecting documents (search all)
info "Test 4: 'compare the uploaded documents' (no documentIds)"
Q4=$(curl -s -X POST "$BASE_URL/api/query" \
  -H "Content-Type: application/json" \
  -d '{"question":"compare the uploaded documents"}')
ANSWER4=$(echo "$Q4" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['answer'])" 2>/dev/null)
echo "$ANSWER4" | grep -iq "couldn't find" && fail "Should NOT say 'couldn't find'"
[ ${#ANSWER4} -gt 200 ] || fail "Answer too short"
pass "Comparison without documentIds works"

# Cleanup
info "Cleaning up..."
curl -s -X DELETE "$BASE_URL/api/documents/$DOC1_ID" > /dev/null
curl -s -X DELETE "$BASE_URL/api/documents/$DOC2_ID" > /dev/null
pass "Cleanup done"

echo ""
echo "============================================================"
echo -e "${GREEN}COMPARISON QUERY TESTS PASSED!${NC}"
echo "============================================================"
