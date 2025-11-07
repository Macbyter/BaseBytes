#!/bin/bash
# Acceptance tests for PR #5: Daily Anchor + Merkle Proofs
# Issue #21: https://github.com/Macbyter/BaseBytes/issues/21

set -e

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/basebytes_test}"

echo "=== BaseBytes Daily Anchor Acceptance Tests ==="
echo ""

# Test 1: Anchor tables exist
echo "✓ Test 1: Anchor tables created"
TABLES=$(psql "$DATABASE_URL" -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('daily_anchors', 'receipt_anchors')" | tr -d ' ' | grep -v '^$' | wc -l)

if [ "$TABLES" -eq 2 ]; then
  echo "  PASS: Anchor tables exist (daily_anchors, receipt_anchors)"
else
  echo "  ❌ FAIL: Expected 2 tables, found $TABLES"
  exit 1
fi
echo ""

# Test 2: Create test receipts
echo "✓ Test 2: Setup test receipts"

# Insert test payments and receipts
psql "$DATABASE_URL" -c "INSERT INTO payments (tx_hash, log_index, block_number, block_timestamp, buyer, seller, sku_id, amount_usd6, units, rights) VALUES ('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 0, 1000, 1000, '0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002', 'defi:preTradeRisk', 200000, 1, 0) ON CONFLICT DO NOTHING" > /dev/null 2>&1

PAYMENT_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM payments WHERE tx_hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' LIMIT 1" | tr -d ' ')

psql "$DATABASE_URL" -c "INSERT INTO receipts (receipt_id, payment_id, buyer, seller, sku_id, amount_usd6, units, tx_hash, block_number, block_timestamp, created_at) VALUES ('anchor-test-001', $PAYMENT_ID, '0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002', 'defi:preTradeRisk', 200000, 1, '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 1000, 1000, '2025-11-06 12:00:00') ON CONFLICT DO NOTHING" > /dev/null 2>&1

psql "$DATABASE_URL" -c "INSERT INTO receipts (receipt_id, payment_id, buyer, seller, sku_id, amount_usd6, units, tx_hash, block_number, block_timestamp, created_at) VALUES ('anchor-test-002', $PAYMENT_ID, '0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002', 'defi:preTradeRisk', 200000, 1, '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 1000, 1000, '2025-11-06 13:00:00') ON CONFLICT DO NOTHING" > /dev/null 2>&1

RECEIPT_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM receipts WHERE receipt_id LIKE 'anchor-test-%'" | tr -d ' ')

if [ "$RECEIPT_COUNT" -ge 2 ]; then
  echo "  PASS: Test receipts created ($RECEIPT_COUNT)"
else
  echo "  ❌ FAIL: Test receipts not created"
  exit 1
fi
echo ""

# Test 3: Run daily anchor worker
echo "✓ Test 3: Daily anchor worker execution"

cd /home/ubuntu/BaseBytes
DATABASE_URL="$DATABASE_URL" node workers/daily-anchor.js 2025-11-06 > /tmp/anchor-test.log 2>&1

if grep -q "Daily anchor complete" /tmp/anchor-test.log; then
  echo "  PASS: Daily anchor worker completed"
else
  echo "  ❌ FAIL: Daily anchor worker failed"
  cat /tmp/anchor-test.log
  exit 1
fi
echo ""

# Test 4: Anchor created
echo "✓ Test 4: Daily anchor created in database"

ANCHOR_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM daily_anchors WHERE anchor_date = '2025-11-06'" | tr -d ' ')

if [ "$ANCHOR_COUNT" -eq 1 ]; then
  echo "  PASS: Daily anchor created"
else
  echo "  ❌ FAIL: Daily anchor not found"
  exit 1
fi

MERKLE_ROOT=$(psql "$DATABASE_URL" -t -c "SELECT merkle_root FROM daily_anchors WHERE anchor_date = '2025-11-06'" | tr -d ' ')
echo "  Merkle root: $MERKLE_ROOT"
echo ""

# Test 5: Merkle proofs stored
echo "✓ Test 5: Merkle proofs stored for receipts"

PROOF_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM receipt_anchors WHERE receipt_id LIKE 'anchor-test-%'" | tr -d ' ')

if [ "$PROOF_COUNT" -ge 2 ]; then
  echo "  PASS: Merkle proofs stored ($PROOF_COUNT)"
else
  echo "  ❌ FAIL: Merkle proofs not stored"
  exit 1
fi

# Check proof structure
PROOF_JSON=$(psql "$DATABASE_URL" -t -c "SELECT merkle_proof FROM receipt_anchors WHERE receipt_id = 'anchor-test-001' LIMIT 1" | tr -d ' ')

if echo "$PROOF_JSON" | grep -q "0x"; then
  echo "  PASS: Proof contains hash values"
else
  echo "  ❌ FAIL: Proof format invalid"
  exit 1
fi
echo ""

# Test 6: Proof structure validation
echo "✓ Test 6: Proof structure validation"

# Verify proof is valid JSON array
PROOF_ARRAY=$(psql "$DATABASE_URL" -t -c "SELECT merkle_proof FROM receipt_anchors WHERE receipt_id = 'anchor-test-001' LIMIT 1" | tr -d ' ')

if echo "$PROOF_ARRAY" | jq '.' > /dev/null 2>&1; then
  echo "  PASS: Proof is valid JSON"
else
  echo "  ❌ FAIL: Proof is not valid JSON"
  exit 1
fi

# Check proof array length
PROOF_LENGTH=$(echo "$PROOF_ARRAY" | jq 'length')
if [ "$PROOF_LENGTH" -ge 1 ]; then
  echo "  PASS: Proof contains $PROOF_LENGTH sibling(s)"
else
  echo "  ❌ FAIL: Proof array empty"
  exit 1
fi
echo ""

# Cleanup
psql "$DATABASE_URL" -c "DELETE FROM receipt_anchors WHERE receipt_id LIKE 'anchor-test-%'" > /dev/null 2>&1
psql "$DATABASE_URL" -c "DELETE FROM receipts WHERE receipt_id LIKE 'anchor-test-%'" > /dev/null 2>&1
psql "$DATABASE_URL" -c "DELETE FROM daily_anchors WHERE anchor_date = '2025-11-06'" > /dev/null 2>&1
psql "$DATABASE_URL" -c "DELETE FROM payments WHERE tx_hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'" > /dev/null 2>&1

echo "=== All acceptance tests passed ✓ ==="
echo ""
echo "Acceptance criteria verified:"
echo "1. ✓ Anchor tables created (daily_anchors, receipt_anchors)"
echo "2. ✓ Test receipts setup successful"
echo "3. ✓ Daily anchor worker executes successfully"
echo "4. ✓ Daily anchor created with Merkle root"
echo "5. ✓ Merkle proofs stored for all receipts"
echo "6. ✓ Proof structure validated (JSON array with siblings)"
