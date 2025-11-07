/**
 * Receipt Handler for BaseBytes API
 * Handles /ai/receipt/:id endpoint
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: DATABASE_URL });

/**
 * Get receipt by ID
 */
async function getReceipt(receiptId) {
  const result = await pool.query(`
    SELECT 
      r.receipt_id,
      r.buyer,
      r.seller,
      r.sku_id,
      r.amount_usd6,
      r.units,
      r.tx_hash,
      r.block_number,
      r.block_timestamp,
      r.attestation_uid,
      r.schema_uid,
      r.attested_at,
      r.attestation_tx,
      r.created_at,
      s.title as sku_title,
      s.schema_type,
      s.schema_version
    FROM receipts r
    LEFT JOIN skus s ON r.sku_id = s.sku_id
    WHERE r.receipt_id = $1
  `, [receiptId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    receipt_id: row.receipt_id,
    buyer: row.buyer,
    seller: row.seller,
    sku: {
      id: row.sku_id,
      title: row.sku_title,
      schema_type: row.schema_type,
      schema_version: row.schema_version
    },
    payment: {
      amount_usd: (parseFloat(row.amount_usd6) / 1000000).toFixed(2),
      amount_usd6: row.amount_usd6.toString(),
      units: row.units,
      tx_hash: row.tx_hash,
      block_number: row.block_number,
      block_timestamp: row.block_timestamp
    },
    attestation: row.attestation_uid ? {
      uid: row.attestation_uid,
      schema_uid: row.schema_uid,
      attested_at: row.attested_at,
      tx_hash: row.attestation_tx,
      explorer_url: `https://sepolia.basescan.org/tx/${row.attestation_tx}`,
      eas_url: `https://base-sepolia.easscan.org/attestation/view/${row.attestation_uid}`
    } : null,
    created_at: row.created_at
  };
}

/**
 * List receipts for a buyer
 */
async function listReceipts(buyer, limit = 10, offset = 0) {
  const result = await pool.query(`
    SELECT 
      r.receipt_id,
      r.buyer,
      r.seller,
      r.sku_id,
      r.amount_usd6,
      r.units,
      r.attestation_uid,
      r.created_at,
      s.title as sku_title
    FROM receipts r
    LEFT JOIN skus s ON r.sku_id = s.sku_id
    WHERE r.buyer = $1
    ORDER BY r.created_at DESC
    LIMIT $2 OFFSET $3
  `, [buyer.toLowerCase(), limit, offset]);

  return result.rows.map(row => ({
    receipt_id: row.receipt_id,
    sku: {
      id: row.sku_id,
      title: row.sku_title
    },
    amount_usd: (parseFloat(row.amount_usd6) / 1000000).toFixed(2),
    units: row.units,
    attestation_uid: row.attestation_uid,
    created_at: row.created_at
  }));
}

module.exports = {
  getReceipt,
  listReceipts
};
