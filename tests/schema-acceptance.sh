#!/bin/bash
# Acceptance tests for PR #3: Database Schema
# Issue #19: https://github.com/Macbyter/BaseBytes/issues/19

set -e

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/basebytes_test}"

echo "=== BaseBytes Database Schema Acceptance Tests ==="
echo ""

# Test 1: All tables exist
echo "✓ Test 1: Core tables exist"
TABLES=$(psql "$DATABASE_URL" -t -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('skus', 'payments', 'entitlements', 'balances', 'indexer_state', 'migrations')" | tr -d ' ' | grep -v '^$' | wc -l)

if [ "$TABLES" -eq 6 ]; then
  echo "  PASS: All 6 tables exist (skus, payments, entitlements, balances, indexer_state, migrations)"
else
  echo "  ❌ FAIL: Expected 6 tables, found $TABLES"
  exit 1
fi
echo ""

# Test 2: SKUs table populated
echo "✓ Test 2: SKUs table populated with catalog"
SKU_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM skus" | tr -d ' ')

if [ "$SKU_COUNT" -eq 3 ]; then
  echo "  PASS: 3 SKUs in catalog"
else
  echo "  ❌ FAIL: Expected 3 SKUs, found $SKU_COUNT"
  exit 1
fi

# Verify SKU data
DEFI_PRICE=$(psql "$DATABASE_URL" -t -c "SELECT price_usd6 FROM skus WHERE sku_id = 'defi:preTradeRisk'" | tr -d ' ')
if [ "$DEFI_PRICE" -eq 200000 ]; then
  echo "  PASS: DeFi Pre-Trade Risk price correct (0.20 USDC)"
else
  echo "  ❌ FAIL: DeFi price mismatch"
  exit 1
fi
echo ""

# Test 3: Indexes created
echo "✓ Test 3: Database indexes created"
INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('skus', 'payments', 'entitlements', 'balances')" | tr -d ' ')

if [ "$INDEX_COUNT" -ge 10 ]; then
  echo "  PASS: Indexes created ($INDEX_COUNT)"
else
  echo "  ❌ FAIL: Expected at least 10 indexes, found $INDEX_COUNT"
  exit 1
fi
echo ""

# Test 4: Unique constraints
echo "✓ Test 4: Unique constraints enforced"

# Test SKU unique constraint
psql "$DATABASE_URL" -c "INSERT INTO skus (sku_id, title, price_usd6) VALUES ('test:sku', 'Test SKU', 100000)" > /dev/null 2>&1
DUPLICATE_RESULT=$(psql "$DATABASE_URL" -c "INSERT INTO skus (sku_id, title, price_usd6) VALUES ('test:sku', 'Duplicate', 100000)" 2>&1 || true)

if echo "$DUPLICATE_RESULT" | grep -q "duplicate key"; then
  echo "  PASS: SKU unique constraint enforced"
else
  echo "  ❌ FAIL: SKU unique constraint not working"
  exit 1
fi

# Cleanup
psql "$DATABASE_URL" -c "DELETE FROM skus WHERE sku_id = 'test:sku'" > /dev/null 2>&1
echo ""

# Test 5: Migration tracking
echo "✓ Test 5: Migration tracking table"
MIGRATION_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM migrations" | tr -d ' ')

if [ "$MIGRATION_COUNT" -ge 1 ]; then
  echo "  PASS: Migration(s) tracked ($MIGRATION_COUNT)"
else
  echo "  ❌ FAIL: No migrations tracked"
  exit 1
fi

MIGRATION_NAME=$(psql "$DATABASE_URL" -t -c "SELECT name FROM migrations ORDER BY applied_at LIMIT 1" | tr -d ' ')
if [ "$MIGRATION_NAME" = "001_initial_schema.sql" ]; then
  echo "  PASS: Initial migration recorded"
else
  echo "  ❌ FAIL: Migration name mismatch"
  exit 1
fi
echo ""

# Test 6: Idempotent migrations
echo "✓ Test 6: Migrations are idempotent"
BEFORE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM skus" | tr -d ' ')

# Re-run migrations (should skip already applied)
DATABASE_URL="$DATABASE_URL" node scripts/run-migrations.js > /tmp/migration-rerun.log 2>&1

AFTER_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM skus" | tr -d ' ')

if [ "$BEFORE_COUNT" -eq "$AFTER_COUNT" ]; then
  echo "  PASS: Re-running migrations is safe (SKU count unchanged: $BEFORE_COUNT)"
else
  echo "  ❌ FAIL: Migration not idempotent"
  exit 1
fi

if grep -q "already applied" /tmp/migration-rerun.log; then
  echo "  PASS: Migration runner skips applied migrations"
else
  echo "  ❌ FAIL: Migration runner did not skip"
  exit 1
fi
echo ""

echo "=== All acceptance tests passed ✓ ==="
echo ""
echo "Acceptance criteria verified:"
echo "1. ✓ All core tables created (skus, payments, entitlements, balances, indexer_state)"
echo "2. ✓ SKU catalog populated with 3 products"
echo "3. ✓ Database indexes created for performance"
echo "4. ✓ Unique constraints enforced"
echo "5. ✓ Migration tracking table functional"
echo "6. ✓ Migrations are idempotent and safe to re-run"
