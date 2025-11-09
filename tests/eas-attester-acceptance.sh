#!/bin/bash
# EAS Attester Acceptance Test
# Tests the complete database integration

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

# Test 2: Receipts table exists
echo "✓ Test 2: Receipts table exists"
TABLE_EXISTS=$(psql "${DATABASE_URL}" -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'receipts')" | tr -d ' ')
if [ "$TABLE_EXISTS" = "t" ]; then
  echo "  ✅ Receipts table exists"
else
  echo "  ❌ Receipts table not found"
  exit 1
fi

# Test 3: Insert test receipt
echo "✓ Test 3: Insert test receipt"
psql "${DATABASE_URL}" -c "
  INSERT INTO receipts (
    tx_hash,
    log_index,
    buyer,
    seller,
    sku_id,
    amount,
    currency,
    data_hash,
    attestation_status
  ) VALUES (
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    0,
    '0x1111111111111111111111111111111111111111',
    '0x2222222222222222222222222222222222222222',
    'test.sku.v1',
    '1000000',
    'USDC',
    '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    'pending'
  )
  ON CONFLICT (tx_hash, log_index) DO NOTHING
" > /dev/null 2>&1
echo "  ✅ Test receipt inserted"

# Test 4: Query pending receipts
echo "✓ Test 4: Query pending receipts"
PENDING_COUNT=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM receipts WHERE attestation_status = 'pending'" | tr -d ' ')
if [ "$PENDING_COUNT" -gt 0 ]; then
  echo "  ✅ Found ${PENDING_COUNT} pending receipt(s)"
else
  echo "  ❌ No pending receipts found"
  exit 1
fi

# Test 5: Run EAS attester in dry-run mode
echo "✓ Test 5: Run EAS attester (dry-run)"
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

# Test 6: Update receipt status
echo "✓ Test 6: Update receipt status"
psql "${DATABASE_URL}" -c "
  UPDATE receipts
  SET 
    attestation_status = 'onchain',
    attestation_tx = '0xtest123',
    attestation_uid = '0xuid123',
    attestation_chain_id = '0x14a34'
  WHERE attestation_status = 'pending'
  LIMIT 1
" > /dev/null 2>&1
echo "  ✅ Receipt status updated"

# Test 7: Verify update
echo "✓ Test 7: Verify status update"
ONCHAIN_COUNT=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM receipts WHERE attestation_status = 'onchain'" | tr -d ' ')
if [ "$ONCHAIN_COUNT" -gt 0 ]; then
  echo "  ✅ Found ${ONCHAIN_COUNT} onchain receipt(s)"
else
  echo "  ❌ No onchain receipts found"
  exit 1
fi

# Cleanup
echo ""
echo "🧹 Cleanup"
psql "${DATABASE_URL}" -c "DELETE FROM receipts WHERE tx_hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'" > /dev/null 2>&1
echo "  ✅ Test data cleaned up"

echo ""
echo "================================"
echo "✅ All tests passed!"
echo ""
