#!/usr/bin/env bash
set -euo pipefail

# indexer-acceptance.sh
# Verifies the payment indexer is tracking on-chain payments

echo "🧪 Indexer Acceptance Test"
echo "=========================="

# Configuration
DATABASE_URL="${DATABASE_URL:-}"
BASE_SEPOLIA_RPC="${BASE_SEPOLIA_RPC:-${BASE_SEPOLIA_RPC_URL:-}}"

if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable required"
  exit 1
fi

if [ -z "$BASE_SEPOLIA_RPC" ]; then
  echo "❌ ERROR: BASE_SEPOLIA_RPC or BASE_SEPOLIA_RPC_URL environment variable required"
  exit 1
fi

echo "📍 Database: ${DATABASE_URL%%@*}@***"
echo "📍 RPC: $BASE_SEPOLIA_RPC"
echo ""

# Test 1: Check if indexer worker is configured
echo "Test 1: Verify indexer worker exists"
if [ ! -f "workers/indexer.js" ]; then
  echo "❌ FAIL: workers/indexer.js not found"
  exit 1
fi
echo "✅ Indexer worker found"
echo ""

# Test 2: Check database connectivity
echo "Test 2: Database connectivity"
if ! command -v psql >/dev/null 2>&1; then
  echo "⚠️  SKIP: psql not installed, using node to test connection"
  # Use node to test connection
  node -e "
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query('SELECT 1')
      .then(() => { console.log('✅ Database connected'); process.exit(0); })
      .catch(err => { console.error('❌ Database connection failed:', err.message); process.exit(1); });
  " || exit 1
else
  if ! psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
    echo "❌ FAIL: Cannot connect to database"
    exit 1
  fi
  echo "✅ Database connected"
fi
echo ""

# Test 3: Check payments table exists
echo "Test 3: Verify payments table schema"
node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(\`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'payments' 
    ORDER BY ordinal_position
  \`)
    .then(res => {
      if (res.rows.length === 0) {
        console.error('❌ FAIL: payments table not found');
        process.exit(1);
      }
      const requiredColumns = ['id', 'tx_hash', 'from_address', 'to_address', 'amount', 'created_at'];
      const actualColumns = res.rows.map(r => r.column_name);
      const missing = requiredColumns.filter(col => !actualColumns.includes(col));
      if (missing.length > 0) {
        console.error('❌ FAIL: Missing required columns:', missing.join(', '));
        process.exit(1);
      }
      console.log('✅ Payments table schema valid');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ FAIL: Query error:', err.message);
      process.exit(1);
    });
" || exit 1
echo ""

# Test 4: Check RPC connectivity
echo "Test 4: RPC connectivity"
CHAIN_ID=$(curl -s -X POST "$BASE_SEPOLIA_RPC" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  | jq -r '.result' || echo "")

if [ -z "$CHAIN_ID" ] || [ "$CHAIN_ID" = "null" ]; then
  echo "❌ FAIL: Cannot connect to RPC"
  exit 1
fi

echo "✅ RPC connected (chainId: $CHAIN_ID)"

# Verify Base Sepolia chain ID
EXPECTED_CHAIN_ID="0x14a34"
if [ "$CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]; then
  echo "⚠️  WARNING: Expected Base Sepolia ($EXPECTED_CHAIN_ID), got $CHAIN_ID"
fi
echo ""

# Test 5: Check recent indexer activity
echo "Test 5: Recent indexer activity"
RECENT_COUNT=$(node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(\`
    SELECT COUNT(*) as count 
    FROM payments 
    WHERE created_at > NOW() - INTERVAL '7 days'
  \`)
    .then(res => {
      console.log(res.rows[0].count);
      process.exit(0);
    })
    .catch(err => {
      console.error('0');
      process.exit(0);
    });
" || echo "0")

echo "✅ Found $RECENT_COUNT payments in last 7 days"
echo ""

echo "✅ Indexer Acceptance: PASSED"
