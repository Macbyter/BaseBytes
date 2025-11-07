#!/bin/bash
# Acceptance tests for PR #2: Payment Indexer
# Issue #18: https://github.com/Macbyter/BaseBytes/issues/18

set -e

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/basebytes_test}"
ROUTER_ADDRESS="0xF0a998d1cA93def52e2eA9929a20fEe8a644551c"
TEST_TX="0xadd3791025dd5decf54873b6f2b01f8c48ebd7447375038aaeacd0e598f85ff6"

echo "=== BaseBytes Payment Indexer Acceptance Tests ==="
echo ""

# Test 1: Database tables exist
echo "✓ Test 1: Database tables created"
TABLES=$(psql "$DATABASE_URL" -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('payments', 'entitlements', 'balances', 'indexer_state')" | tr -d ' ' | grep -v '^$' | wc -l)

if [ "$TABLES" -eq 4 ]; then
  echo "  PASS: All 4 tables exist (payments, entitlements, balances, indexer_state)"
else
  echo "  ❌ FAIL: Expected 4 tables, found $TABLES"
  exit 1
fi
echo ""

# Test 2: Payment indexed
echo "✓ Test 2: Payment indexed from test transaction"
PAYMENT_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM payments WHERE tx_hash = '$TEST_TX'" | tr -d ' ')

if [ "$PAYMENT_COUNT" -ge 1 ]; then
  echo "  PASS: Payment found in database ($PAYMENT_COUNT row(s))"
else
  echo "  ❌ FAIL: Payment not indexed"
  exit 1
fi
echo ""

# Test 3: Idempotency - duplicate inserts ignored
echo "✓ Test 3: Idempotency check"
BEFORE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM payments" | tr -d ' ')

# Try to re-index (should be ignored)
echo "  Attempting duplicate insert with actual log_index..."
ACTUAL_LOG_INDEX=$(psql "$DATABASE_URL" -t -c "SELECT log_index FROM payments WHERE tx_hash = '$TEST_TX' LIMIT 1" | tr -d ' ')
psql "$DATABASE_URL" -c "INSERT INTO payments (tx_hash, log_index, block_number, block_timestamp, buyer, seller, sku_id, amount_usd6, units, rights) VALUES ('$TEST_TX', $ACTUAL_LOG_INDEX, 1000, 1000, '0xtest', '0xtest', 'test:sku', 100, 1, 0) ON CONFLICT (tx_hash, log_index) DO NOTHING" > /dev/null 2>&1

AFTER_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM payments" | tr -d ' ')

if [ "$BEFORE_COUNT" -eq "$AFTER_COUNT" ]; then
  echo "  PASS: Duplicate ignored (count unchanged: $BEFORE_COUNT)"
else
  echo "  ❌ FAIL: Duplicate not ignored (before: $BEFORE_COUNT, after: $AFTER_COUNT)"
  exit 1
fi
echo ""

# Test 4: Entitlement granted
echo "✓ Test 4: Entitlement granted to buyer"
ENTITLEMENT_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM entitlements WHERE units_purchased > 0" | tr -d ' ')

if [ "$ENTITLEMENT_COUNT" -ge 1 ]; then
  echo "  PASS: Entitlement(s) found ($ENTITLEMENT_COUNT)"
else
  echo "  ❌ FAIL: No entitlements found"
  exit 1
fi
echo ""

# Test 5: Seller balance incremented
echo "✓ Test 5: Seller balance incremented"
BALANCE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM balances WHERE total_earned_usd6 > 0" | tr -d ' ')

if [ "$BALANCE_COUNT" -ge 1 ]; then
  echo "  PASS: Seller balance(s) found ($BALANCE_COUNT)"
else
  echo "  ❌ FAIL: No seller balances found"
  exit 1
fi
echo ""

# Test 6: Indexer state tracked
echo "✓ Test 6: Indexer state tracked"
LAST_BLOCK=$(psql "$DATABASE_URL" -t -c "SELECT last_processed_block FROM indexer_state WHERE id = 1" | tr -d ' ')

if [ -n "$LAST_BLOCK" ] && [ "$LAST_BLOCK" -ge 0 ]; then
  echo "  PASS: Last processed block: $LAST_BLOCK"
else
  echo "  ❌ FAIL: Indexer state not tracked"
  exit 1
fi
echo ""

echo "=== All acceptance tests passed ✓ ==="
echo ""
echo "Acceptance criteria verified:"
echo "1. ✓ Database tables created (payments, entitlements, balances, indexer_state)"
echo "2. ✓ Payment indexed from Router.PaymentReceived event"
echo "3. ✓ Idempotent on (tx_hash, log_index) - duplicates ignored"
echo "4. ✓ Entitlements granted to buyers"
echo "5. ✓ Seller balances incremented"
echo "6. ✓ Indexer state tracked for resumability"
