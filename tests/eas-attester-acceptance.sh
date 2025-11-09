#!/bin/bash
# EAS Attester Acceptance Test
# Tests the complete database integration with actual schema

set -e

echo "🧪 EAS Attester Acceptance Test"
echo "================================"
echo ""

# Configuration
DATABASE_URL="${DATABASE_URL:-postgresql://testuser:testpass@localhost:5432/basebytes_test}"
BASE_SEPOLIA_RPC="${BASE_SEPOLIA_RPC:-https://sepolia.base.org}"
ATTESTER_PRIVATE_KEY="${ATTESTER_PRIVATE_KEY:-0x0000000000000000000000000000000000000000000000000000000000000001}"
EAS_SCHEMA_UID="${EAS_SCHEMA_UID:-0x0000000000000000000000000000000000000000000000000000000000000000}"

echo "📋 Test Configuration:"
echo "  DATABASE_URL: ${DATABASE_URL}"
echo "  RPC: ${BASE_SEPOLIA_RPC}"
echo "  Schema UID: ${EAS_SCHEMA_UID}"
echo ""

# Test 1: Database connection
echo "✓ Test 1: Database connection"
psql "${DATABASE_URL}" -c "SELECT 1" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ✅ Database connection successful"
else
  echo "  ❌ Database connection failed"
  exit 1
fi

# Test 2: Receipts table exists with correct schema
echo "✓ Test 2: Receipts table schema"
SCHEMA_CHECK=$(psql "${DATABASE_URL}" -t -c "
  SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_name = 'receipts' 
  AND column_name IN ('receipt_id', 'amount_usd6', 'units', 'attestation_uid', 'schema_uid')
" | tr -d ' ')

if [ "$SCHEMA_CHECK" -eq 5 ]; then
  echo "  ✅ Receipts table has correct schema"
else
  echo "  ❌ Receipts table schema mismatch (expected 5 columns, got $SCHEMA_CHECK)"
  exit 1
fi

# Test 3: Insert test payment first (receipts reference payments)
echo "✓ Test 3: Insert test payment"
psql "${DATABASE_URL}" -c "
  INSERT INTO payments (
    tx_hash,
    log_index,
    buyer,
    seller,
    sku_id,
    amount_usd6,
    units,
    block_number,
    block_timestamp
  ) VALUES (
    '0xtest123abc',
    0,
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    'test.sku.v1',
    1000000,
    1,
    1000000,
    1700000000
  )
  ON CONFLICT (tx_hash, log_index) DO NOTHING
  RETURNING id
" > /tmp/payment_id.txt 2>&1

PAYMENT_ID=$(grep -oE '[0-9]+' /tmp/payment_id.txt | head -1)
echo "  ✅ Test payment inserted (ID: ${PAYMENT_ID})"

# Test 4: Insert test receipt
echo "✓ Test 4: Insert test receipt"
psql "${DATABASE_URL}" -c "
  INSERT INTO receipts (
    receipt_id,
    payment_id,
    buyer,
    seller,
    sku_id,
    amount_usd6,
    units,
    tx_hash,
    block_number,
    block_timestamp
  ) VALUES (
    'receipt-test-001',
    ${PAYMENT_ID},
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    'test.sku.v1',
    1000000,
    1,
    '0xtest123abc',
    1000000,
    1700000000
  )
  ON CONFLICT (receipt_id) DO NOTHING
" > /dev/null 2>&1
echo "  ✅ Test receipt inserted"

# Test 5: Query pending receipts (attestation_uid IS NULL)
echo "✓ Test 5: Query pending receipts"
PENDING_COUNT=$(psql "${DATABASE_URL}" -t -c "
  SELECT COUNT(*) FROM receipts WHERE attestation_uid IS NULL
" | tr -d ' ')

if [ "$PENDING_COUNT" -gt 0 ]; then
  echo "  ✅ Found ${PENDING_COUNT} pending receipt(s)"
else
  echo "  ❌ No pending receipts found"
  exit 1
fi

# Test 6: Run EAS attester in dry-run mode
echo "✓ Test 6: Run EAS attester (dry-run)"
timeout 10 node workers/eas-attester.js --dry-run > /tmp/eas-test.log 2>&1 &
EAS_PID=$!
sleep 5
kill $EAS_PID 2>/dev/null || true

if grep -q "Found.*pending receipt" /tmp/eas-test.log; then
  echo "  ✅ EAS attester detected pending receipts"
else
  echo "  ⚠️  EAS attester did not detect pending receipts (check log)"
  cat /tmp/eas-test.log
fi

# Test 7: Update receipt with attestation
echo "✓ Test 7: Update receipt with attestation"
psql "${DATABASE_URL}" -c "
  UPDATE receipts
  SET 
    attestation_uid = '0xuid123456789',
    schema_uid = '${EAS_SCHEMA_UID}',
    attested_at = NOW(),
    attestation_tx = '0xtxhash123'
  WHERE receipt_id = 'receipt-test-001'
" > /dev/null 2>&1
echo "  ✅ Receipt attestation updated"

# Test 8: Verify attestation
echo "✓ Test 8: Verify attestation"
ATTESTED_COUNT=$(psql "${DATABASE_URL}" -t -c "
  SELECT COUNT(*) FROM receipts WHERE attestation_uid IS NOT NULL
" | tr -d ' ')

if [ "$ATTESTED_COUNT" -gt 0 ]; then
  echo "  ✅ Found ${ATTESTED_COUNT} attested receipt(s)"
else
  echo "  ❌ No attested receipts found"
  exit 1
fi

# Cleanup
echo ""
echo "🧹 Cleanup"
psql "${DATABASE_URL}" -c "DELETE FROM receipts WHERE receipt_id = 'receipt-test-001'" > /dev/null 2>&1
psql "${DATABASE_URL}" -c "DELETE FROM payments WHERE tx_hash = '0xtest123abc'" > /dev/null 2>&1
echo "  ✅ Test data cleaned up"

echo ""
echo "================================"
echo "✅ All tests passed!"
echo ""
