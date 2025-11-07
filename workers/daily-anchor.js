#!/usr/bin/env node
/**
 * BaseBytes Daily Anchor Worker
 * Generates daily Merkle tree anchors for receipts
 * Runs at 10:00 Europe/Dublin timezone
 */

const { Pool } = require('pg');
const { buildMerkleTree, generateProof, hashReceipt } = require('../lib/merkle');

const DATABASE_URL = process.env.DATABASE_URL;
const TIMEZONE = 'Europe/Dublin';
const ANCHOR_HOUR = 10; // 10:00 AM

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable required');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

/**
 * Get receipts for a specific date
 */
async function getReceiptsForDate(date) {
  const result = await pool.query(`
    SELECT 
      receipt_id,
      buyer,
      seller,
      sku_id,
      amount_usd6,
      units,
      tx_hash,
      created_at
    FROM receipts
    WHERE DATE(created_at AT TIME ZONE $2) = $1
    ORDER BY created_at ASC
  `, [date, TIMEZONE]);

  return result.rows;
}

/**
 * Create daily anchor
 */
async function createDailyAnchor(date) {
  console.log(`\n=== Creating Daily Anchor for ${date} ===\n`);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check if anchor already exists
    const existing = await client.query(
      'SELECT id FROM daily_anchors WHERE anchor_date = $1',
      [date]
    );

    if (existing.rows.length > 0) {
      console.log(`⏭️  Anchor already exists for ${date}`);
      await client.query('ROLLBACK');
      return { status: 'exists', anchor_id: existing.rows[0].id };
    }

    // Get receipts for date
    const receipts = await getReceiptsForDate(date);

    if (receipts.length === 0) {
      console.log(`⏭️  No receipts found for ${date}`);
      await client.query('ROLLBACK');
      return { status: 'no_receipts' };
    }

    console.log(`📥 Found ${receipts.length} receipt(s) for ${date}`);

    // Hash receipts
    const leaves = receipts.map(r => hashReceipt(r));

    // Build Merkle tree
    const merkleTree = buildMerkleTree(leaves);
    const merkleRoot = merkleTree.root;

    console.log(`🌳 Merkle root: ${merkleRoot}`);

    // Insert anchor
    const anchorResult = await client.query(`
      INSERT INTO daily_anchors (
        anchor_date,
        merkle_root,
        receipt_count,
        first_receipt_id,
        last_receipt_id
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [
      date,
      merkleRoot,
      receipts.length,
      receipts[0].receipt_id,
      receipts[receipts.length - 1].receipt_id
    ]);

    const anchorId = anchorResult.rows[0].id;

    console.log(`✓ Anchor created (ID: ${anchorId})`);

    // Generate and store proofs for each receipt
    console.log(`📝 Generating Merkle proofs...`);

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      const proof = generateProof(merkleTree, i);

      await client.query(`
        INSERT INTO receipt_anchors (
          receipt_id,
          anchor_id,
          leaf_index,
          merkle_proof
        )
        VALUES ($1, $2, $3, $4)
      `, [
        receipt.receipt_id,
        anchorId,
        i,
        JSON.stringify(proof)
      ]);
    }

    console.log(`✓ Stored ${receipts.length} proof(s)`);

    await client.query('COMMIT');

    console.log(`\n✅ Daily anchor complete for ${date}`);

    return {
      status: 'created',
      anchor_id: anchorId,
      merkle_root: merkleRoot,
      receipt_count: receipts.length
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
function getYesterdayDate() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * Main function
 */
async function main() {
  console.log('=== BaseBytes Daily Anchor Worker ===');
  console.log(`Timezone: ${TIMEZONE}`);
  console.log(`Anchor time: ${ANCHOR_HOUR}:00\n`);

  // Get target date (yesterday)
  const targetDate = process.argv[2] || getYesterdayDate();

  try {
    const result = await createDailyAnchor(targetDate);
    
    if (result.status === 'created') {
      console.log(`\nSummary:`);
      console.log(`  Date: ${targetDate}`);
      console.log(`  Anchor ID: ${result.anchor_id}`);
      console.log(`  Merkle Root: ${result.merkle_root}`);
      console.log(`  Receipts: ${result.receipt_count}`);
    }

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error creating anchor:', error.message);
    await pool.end();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { createDailyAnchor };
