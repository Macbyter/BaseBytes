-- Migration 003: Daily Anchors and Merkle Proofs
-- Adds daily Merkle root anchoring for receipts

BEGIN;

-- Daily anchors table: Stores Merkle roots for daily receipt batches
CREATE TABLE IF NOT EXISTS daily_anchors (
  id SERIAL PRIMARY KEY,
  anchor_date DATE NOT NULL UNIQUE,
  merkle_root TEXT NOT NULL,
  receipt_count INTEGER NOT NULL,
  first_receipt_id TEXT,
  last_receipt_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Optional on-chain anchor
  anchor_tx TEXT,
  anchor_block INTEGER,
  anchored_at TIMESTAMP
);

CREATE INDEX idx_daily_anchors_anchor_date ON daily_anchors(anchor_date);
CREATE INDEX idx_daily_anchors_merkle_root ON daily_anchors(merkle_root);

-- Receipt anchors: Links receipts to daily anchors with Merkle proof
CREATE TABLE IF NOT EXISTS receipt_anchors (
  id SERIAL PRIMARY KEY,
  receipt_id TEXT NOT NULL REFERENCES receipts(receipt_id) ON DELETE CASCADE,
  anchor_id INTEGER NOT NULL REFERENCES daily_anchors(id) ON DELETE CASCADE,
  leaf_index INTEGER NOT NULL,
  merkle_proof TEXT NOT NULL, -- JSON array of proof hashes
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(receipt_id, anchor_id)
);

CREATE INDEX idx_receipt_anchors_receipt_id ON receipt_anchors(receipt_id);
CREATE INDEX idx_receipt_anchors_anchor_id ON receipt_anchors(anchor_id);

COMMIT;
