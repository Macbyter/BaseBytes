/**
 * Proof Handler for BaseBytes API
 * Handles /proofs/:id endpoint for Merkle inclusion proofs
 */

const { Pool } = require('pg');
const { verifyProof, hashReceipt } = require('../lib/merkle');

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL });

/**
 * Get Merkle proof for a receipt
 */
async function getProof(receiptId) {
  const result = await pool.query(`
    SELECT 
      r.receipt_id,
      r.buyer,
      r.seller,
      r.sku_id,
      r.amount_usd6,
      r.units,
      r.tx_hash,
      r.created_at,
      ra.leaf_index,
      ra.merkle_proof,
      da.id as anchor_id,
      da.anchor_date,
      da.merkle_root,
      da.receipt_count,
      da.anchor_tx,
      da.anchor_block
    FROM receipts r
    INNER JOIN receipt_anchors ra ON r.receipt_id = ra.receipt_id
    INNER JOIN daily_anchors da ON ra.anchor_id = da.id
    WHERE r.receipt_id = $1
  `, [receiptId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Parse proof
  const proof = JSON.parse(row.merkle_proof);

  // Compute leaf hash
  const leafHash = hashReceipt({
    receipt_id: row.receipt_id,
    buyer: row.buyer,
    seller: row.seller,
    sku_id: row.sku_id,
    amount_usd6: row.amount_usd6,
    units: row.units,
    tx_hash: row.tx_hash
  });

  // Verify proof
  const isValid = verifyProof(leafHash, proof, row.merkle_root, row.leaf_index);

  return {
    receipt_id: row.receipt_id,
    anchor: {
      id: row.anchor_id,
      date: row.anchor_date,
      merkle_root: row.merkle_root,
      receipt_count: row.receipt_count,
      anchor_tx: row.anchor_tx,
      anchor_block: row.anchor_block
    },
    proof: {
      leaf_hash: leafHash,
      leaf_index: row.leaf_index,
      siblings: proof,
      verified: isValid
    },
    receipt: {
      buyer: row.buyer,
      seller: row.seller,
      sku_id: row.sku_id,
      amount_usd6: row.amount_usd6.toString(),
      units: row.units,
      tx_hash: row.tx_hash,
      created_at: row.created_at
    }
  };
}

/**
 * List anchors
 */
async function listAnchors(limit = 10, offset = 0) {
  const result = await pool.query(`
    SELECT 
      id,
      anchor_date,
      merkle_root,
      receipt_count,
      anchor_tx,
      anchor_block,
      created_at
    FROM daily_anchors
    ORDER BY anchor_date DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  return result.rows.map(row => ({
    id: row.id,
    date: row.anchor_date,
    merkle_root: row.merkle_root,
    receipt_count: row.receipt_count,
    anchor_tx: row.anchor_tx,
    anchor_block: row.anchor_block,
    created_at: row.created_at
  }));
}

module.exports = {
  getProof,
  listAnchors
};
