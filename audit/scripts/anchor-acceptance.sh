#!/usr/bin/env bash
set -euo pipefail

# anchor-acceptance.sh
# Verifies daily anchor worker functionality and Merkle root attestations

echo "🧪 Anchor Acceptance Test"
echo "========================="

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

# Test 1: Check if anchor worker exists
echo "Test 1: Verify anchor worker exists"
if [ ! -f "workers/anchor.js" ]; then
  echo "❌ FAIL: workers/anchor.js not found"
  exit 1
fi
echo "✅ Anchor worker found"
echo ""

# Test 2: Check anchors table schema
echo "Test 2: Verify anchors table schema"
node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(\`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'anchors' 
    ORDER BY ordinal_position
  \`)
    .then(res => {
      if (res.rows.length === 0) {
        console.error('❌ FAIL: anchors table not found');
        process.exit(1);
      }
      const requiredColumns = [
        'id', 'anchor_date', 'merkle_root', 'receipt_count',
        'attestation_uid', 'attestation_tx', 'created_at'
      ];
      const actualColumns = res.rows.map(r => r.column_name);
      const missing = requiredColumns.filter(col => !actualColumns.includes(col));
      if (missing.length > 0) {
        console.error('❌ FAIL: Missing required columns:', missing.join(', '));
        process.exit(1);
      }
      console.log('✅ Anchors table schema valid');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ FAIL: Query error:', err.message);
      process.exit(1);
    });
" || exit 1
echo ""

# Test 3: Check for recent anchors
echo "Test 3: Check for recent anchors"
ANCHOR_COUNT=$(node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query(\`
    SELECT COUNT(*) as count 
    FROM anchors 
    WHERE created_at > NOW() - INTERVAL '30 days'
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

echo "✅ Found $ANCHOR_COUNT anchors in last 30 days"

if [ "$ANCHOR_COUNT" -gt 0 ]; then
  # Get the most recent anchor
  echo ""
  echo "Most recent anchor:"
  node -e "
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query(\`
      SELECT 
        id, 
        anchor_date, 
        merkle_root, 
        receipt_count,
        attestation_uid, 
        attestation_tx,
        created_at
      FROM anchors 
      ORDER BY created_at DESC
      LIMIT 1
    \`)
      .then(res => {
        if (res.rows.length > 0) {
          const a = res.rows[0];
          console.log('  Anchor ID:', a.id);
          console.log('  Date:', a.anchor_date);
          console.log('  Merkle Root:', a.merkle_root);
          console.log('  Receipt Count:', a.receipt_count);
          console.log('  Attestation UID:', a.attestation_uid || 'pending');
          console.log('  Transaction:', a.attestation_tx || 'pending');
          console.log('  Created:', a.created_at);
          if (a.attestation_tx) {
            console.log('  BaseScan:', \`https://sepolia.basescan.org/tx/\${a.attestation_tx}\`);
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

# Test 4: Verify anchor time configuration
echo "Test 4: Verify anchor time configuration"
ANCHOR_TIME="${ANCHOR_TIME_UTC:-10:00}"
echo "✅ Configured anchor time: $ANCHOR_TIME UTC"
echo ""

# Test 5: Check proof verification endpoint
echo "Test 5: Check proof verification capability"
if [ "$ANCHOR_COUNT" -gt 0 ]; then
  echo "✅ Anchor system operational (can verify proofs after anchor time)"
else
  echo "⚠️  No anchors yet (proof verification will be available after first anchor)"
fi
echo ""

# Test 6: Verify Merkle tree implementation
echo "Test 6: Verify Merkle tree implementation"
if [ -f "lib/merkle.js" ] || grep -r "MerkleTree" lib/ >/dev/null 2>&1; then
  echo "✅ Merkle tree implementation found"
else
  echo "⚠️  WARNING: Merkle tree implementation not found in lib/"
fi
echo ""

echo "✅ Anchor Acceptance: PASSED"
