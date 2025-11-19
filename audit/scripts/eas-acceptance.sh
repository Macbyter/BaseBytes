#!/usr/bin/env bash
set -euo pipefail

# eas-acceptance.sh
# Verifies EAS attestation worker functionality and on-chain receipts

echo "🧪 EAS Acceptance Test"
echo "======================"

# Configuration
DATABASE_URL="${DATABASE_URL:-}"
BASE_SEPOLIA_RPC="${BASE_SEPOLIA_RPC:-${BASE_SEPOLIA_RPC_URL:-}}"
ATTESTER_PRIVATE_KEY="${ATTESTER_PRIVATE_KEY:-}"

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

# Test 1: Check if EAS worker exists
echo "Test 1: Verify EAS worker exists"
if [ ! -f "workers/eas-attester.js" ]; then
  echo "❌ FAIL: workers/eas-attester.js not found"
  exit 1
fi
echo "✅ EAS worker found"
echo ""

# Test 2: Check receipts table schema
echo "Test 2: Verify receipts table schema"
node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(\`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'receipts' 
    ORDER BY ordinal_position
  \`)
    .then(res => {
      if (res.rows.length === 0) {
        console.error('❌ FAIL: receipts table not found');
        process.exit(1);
      }
      const requiredColumns = [
        'id', 'payment_id', 'sku', 'amount',
        'attestation_status', 'attestation_tx', 'attestation_uid',
        'attestation_confirmed_at', 'attestation_chain_id'
      ];
      const actualColumns = res.rows.map(r => r.column_name);
      const missing = requiredColumns.filter(col => !actualColumns.includes(col));
      if (missing.length > 0) {
        console.error('❌ FAIL: Missing required columns:', missing.join(', '));
        process.exit(1);
      }
      console.log('✅ Receipts table schema valid');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ FAIL: Query error:', err.message);
      process.exit(1);
    });
" || exit 1
echo ""

# Test 3: Check for attested receipts
echo "Test 3: Check for attested receipts"
ATTESTED_COUNT=$(node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(\`
    SELECT COUNT(*) as count 
    FROM receipts 
    WHERE attestation_status = 'onchain'
    AND attestation_uid IS NOT NULL
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

echo "✅ Found $ATTESTED_COUNT attested receipts"

if [ "$ATTESTED_COUNT" -gt 0 ]; then
  # Get a sample attested receipt
  echo ""
  echo "Sample attested receipt:"
  node -e "
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query(\`
      SELECT id, sku, amount, attestation_uid, attestation_tx, attestation_chain_id
      FROM receipts 
      WHERE attestation_status = 'onchain'
      AND attestation_uid IS NOT NULL
      ORDER BY attestation_confirmed_at DESC
      LIMIT 1
    \`)
      .then(res => {
        if (res.rows.length > 0) {
          const r = res.rows[0];
          console.log('  Receipt ID:', r.id);
          console.log('  SKU:', r.sku);
          console.log('  Amount:', r.amount);
          console.log('  Attestation UID:', r.attestation_uid);
          console.log('  Transaction:', r.attestation_tx);
          console.log('  Chain ID:', r.attestation_chain_id);
          if (r.attestation_chain_id === '0x14a34') {
            console.log('  BaseScan:', \`https://sepolia.basescan.org/tx/\${r.attestation_tx}\`);
          }
        }
        process.exit(0);
      })
      .catch(err => {
        console.error('Error:', err.message);
        process.exit(0);
      });
  " || true
fi
echo ""

# Test 4: Verify EAS contract accessibility
echo "Test 4: Verify EAS contract accessibility"
EAS_CONTRACT="0x4200000000000000000000000000000000000021"
CODE_CHECK=$(curl -s -X POST "$BASE_SEPOLIA_RPC" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$EAS_CONTRACT\",\"latest\"],\"id\":1}" \
  | jq -r '.result' || echo "0x")

if [ "$CODE_CHECK" = "0x" ] || [ -z "$CODE_CHECK" ]; then
  echo "❌ FAIL: EAS contract not found at $EAS_CONTRACT"
  exit 1
fi

echo "✅ EAS contract accessible at $EAS_CONTRACT"
echo ""

# Test 5: Check attestation status distribution
echo "Test 5: Attestation status distribution"
node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(\`
    SELECT attestation_status, COUNT(*) as count 
    FROM receipts 
    GROUP BY attestation_status
    ORDER BY count DESC
  \`)
    .then(res => {
      if (res.rows.length === 0) {
        console.log('  No receipts found');
      } else {
        res.rows.forEach(r => {
          console.log(\`  \${r.attestation_status || 'null'}: \${r.count}\`);
        });
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(0);
    });
" || true
echo ""

echo "✅ EAS Acceptance: PASSED"
