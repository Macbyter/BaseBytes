#!/usr/bin/env bash
set -euo pipefail

# x402-acceptance.sh
# Tests the x402 payment-required flow: unpaid → 402 → paid → 200 NDJSON

echo "🧪 x402 Acceptance Test"
echo "======================="

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
X402_API_KEY="${X402_API_KEY:-${MINI_API_KEY:-}}"
TEST_OUTPUT="/tmp/x402_paid.ndjson"

if [ -z "$X402_API_KEY" ]; then
  echo "❌ ERROR: X402_API_KEY or MINI_API_KEY environment variable required"
  exit 1
fi

echo "📍 API URL: $API_URL"
echo ""

# Test 1: Unpaid request should return 402
echo "Test 1: Unpaid request → 402 Payment Required"
UNPAID_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/ai/query" \
  -H "Content-Type: application/json" \
  -d '{"query":"test query","sku":"rag-basic"}' || true)

UNPAID_BODY=$(echo "$UNPAID_RESPONSE" | head -n -1)
UNPAID_STATUS=$(echo "$UNPAID_RESPONSE" | tail -n 1)

if [ "$UNPAID_STATUS" != "402" ]; then
  echo "❌ FAIL: Expected 402, got $UNPAID_STATUS"
  exit 1
fi

echo "✅ Got 402 Payment Required"

# Validate 402 payload structure
if ! echo "$UNPAID_BODY" | jq -e '.network and .asset and .payTo and .amount and .memo' >/dev/null 2>&1; then
  echo "❌ FAIL: 402 response missing required fields (network, asset, payTo, amount, memo)"
  echo "Response: $UNPAID_BODY"
  exit 1
fi

# Check USDC-only requirement
ASSET=$(echo "$UNPAID_BODY" | jq -r '.asset')
if [[ ! "$ASSET" =~ USDC ]]; then
  echo "❌ FAIL: Asset must be USDC-based, got: $ASSET"
  exit 1
fi

echo "✅ 402 payload valid (network, asset:$ASSET, payTo, amount, memo)"
echo ""

# Test 2: Paid request should return 200 NDJSON
echo "Test 2: Paid request → 200 NDJSON"
PAID_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/ai/query" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $X402_API_KEY" \
  -d '{"query":"test query","sku":"rag-basic"}' \
  -o "$TEST_OUTPUT" || true)

PAID_STATUS=$(echo "$PAID_RESPONSE" | tail -n 1)

if [ "$PAID_STATUS" != "200" ]; then
  echo "❌ FAIL: Expected 200, got $PAID_STATUS"
  exit 1
fi

echo "✅ Got 200 OK"

# Validate NDJSON output
if [ ! -f "$TEST_OUTPUT" ] || [ ! -s "$TEST_OUTPUT" ]; then
  echo "❌ FAIL: No output file created"
  exit 1
fi

FIRST_LINE=$(head -n1 "$TEST_OUTPUT")
if ! echo "$FIRST_LINE" | jq empty 2>/dev/null; then
  echo "❌ FAIL: First line is not valid JSON"
  echo "Content: $FIRST_LINE"
  exit 1
fi

echo "✅ NDJSON output valid"
echo "First line: $FIRST_LINE"
echo ""

echo "✅ x402 Acceptance: PASSED"
echo "Output saved to: $TEST_OUTPUT"
