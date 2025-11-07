#!/bin/bash
# Acceptance tests for PR #4: EAS Receipt Integration
# Issue #20: https://github.com/Macbyter/BaseBytes/issues/20

set -e

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/basebytes_test}"

echo "=== BaseBytes EAS Receipt Acceptance Tests ==="
echo ""

# Test 1: Receipt tables exist
echo "✓ Test 1: Receipt tables created"
TABLES=$(psql "$DATABASE_URL" -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('receipts', 'eas_schemas')" | tr -d ' ' | grep -v '^$' | wc -l)

if [ "$TABLES" -eq 2 ]; then
  echo "  PASS: Receipt tables exist (receipts, eas_schemas)"
else
  echo "  ❌ FAIL: Expected 2 tables, found $TABLES"
  exit 1
fi
echo ""

# Test 2: EAS schema entry exists
echo "✓ Test 2: EAS schema registered in database"
SCHEMA_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM eas_schemas WHERE schema_name = 'basebytes-receipt-v1'" | tr -d ' ')

if [ "$SCHEMA_COUNT" -eq 1 ]; then
  echo "  PASS: EAS schema entry exists"
else
  echo "  ❌ FAIL: EAS schema not found"
  exit 1
fi

SCHEMA_UID=$(psql "$DATABASE_URL" -t -c "SELECT schema_uid FROM eas_schemas WHERE schema_name = 'basebytes-receipt-v1'" | tr -d ' ')
echo "  Schema UID: $SCHEMA_UID"
echo ""

# Test 3: Receipt indexes created
echo "✓ Test 3: Receipt indexes created"
INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'receipts'" | tr -d ' ')

if [ "$INDEX_COUNT" -ge 6 ]; then
  echo "  PASS: Receipt indexes created ($INDEX_COUNT)"
else
  echo "  ❌ FAIL: Expected at least 6 indexes, found $INDEX_COUNT"
  exit 1
fi
echo ""

# Test 4: Receipt foreign key to payments
echo "✓ Test 4: Foreign key constraint to payments table"
FK_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_name = 'receipts' AND constraint_type = 'FOREIGN KEY'" | tr -d ' ')

if [ "$FK_COUNT" -ge 1 ]; then
  echo "  PASS: Foreign key constraint exists"
else
  echo "  ❌ FAIL: Foreign key constraint not found"
  exit 1
fi
echo ""

# Test 5: Insert test receipt
echo "✓ Test 5: Insert and query receipt"

# Insert test payment first
psql "$DATABASE_URL" -c "INSERT INTO payments (tx_hash, log_index, block_number, block_timestamp, buyer, seller, sku_id, amount_usd6, units, rights) VALUES ('0xtest123', 0, 1000, 1000, '0xbuyer', '0xseller', 'defi:preTradeRisk', 200000, 1, 0) ON CONFLICT DO NOTHING" > /dev/null 2>&1

PAYMENT_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM payments WHERE tx_hash = '0xtest123' LIMIT 1" | tr -d ' ')

# Insert test receipt
psql "$DATABASE_URL" -c "INSERT INTO receipts (receipt_id, payment_id, buyer, seller, sku_id, amount_usd6, units, tx_hash, block_number, block_timestamp) VALUES ('test-receipt-001', $PAYMENT_ID, '0xbuyer', '0xseller', 'defi:preTradeRisk', 200000, 1, '0xtest123', 1000, 1000) ON CONFLICT DO NOTHING" > /dev/null 2>&1

RECEIPT_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM receipts WHERE receipt_id = 'test-receipt-001'" | tr -d ' ')

if [ "$RECEIPT_COUNT" -eq 1 ]; then
  echo "  PASS: Receipt inserted successfully"
else
  echo "  ❌ FAIL: Receipt not inserted"
  exit 1
fi

# Query receipt
RECEIPT_BUYER=$(psql "$DATABASE_URL" -t -c "SELECT buyer FROM receipts WHERE receipt_id = 'test-receipt-001'" | tr -d ' ')

if [ "$RECEIPT_BUYER" = "0xbuyer" ]; then
  echo "  PASS: Receipt query successful"
else
  echo "  ❌ FAIL: Receipt query failed"
  exit 1
fi
echo ""

# Test 6: Attestation fields nullable
echo "✓ Test 6: Attestation fields support null (pending state)"

ATTESTATION_UID=$(psql "$DATABASE_URL" -t -c "SELECT attestation_uid FROM receipts WHERE receipt_id = 'test-receipt-001'" | tr -d ' ')

if [ -z "$ATTESTATION_UID" ]; then
  echo "  PASS: Attestation UID is null (pending state)"
else
  echo "  ❌ FAIL: Attestation UID should be null initially"
  exit 1
fi

# Update with attestation
psql "$DATABASE_URL" -c "UPDATE receipts SET attestation_uid = '0xattest123', attested_at = NOW() WHERE receipt_id = 'test-receipt-001'" > /dev/null 2>&1

UPDATED_UID=$(psql "$DATABASE_URL" -t -c "SELECT attestation_uid FROM receipts WHERE receipt_id = 'test-receipt-001'" | tr -d ' ')

if [ "$UPDATED_UID" = "0xattest123" ]; then
  echo "  PASS: Attestation UID updated successfully"
else
  echo "  ❌ FAIL: Attestation UID update failed"
  exit 1
fi
echo ""

# Cleanup
psql "$DATABASE_URL" -c "DELETE FROM receipts WHERE receipt_id = 'test-receipt-001'" > /dev/null 2>&1
psql "$DATABASE_URL" -c "DELETE FROM payments WHERE tx_hash = '0xtest123'" > /dev/null 2>&1

echo "=== All acceptance tests passed ✓ ==="
echo ""
echo "Acceptance criteria verified:"
echo "1. ✓ Receipt tables created (receipts, eas_schemas)"
echo "2. ✓ EAS schema registered in database"
echo "3. ✓ Receipt indexes created for performance"
echo "4. ✓ Foreign key constraint to payments table"
echo "5. ✓ Receipt insert and query functional"
echo "6. ✓ Attestation fields support pending state (null)"
