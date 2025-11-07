-- Migration 002: EAS Receipt Integration
-- Adds receipt tracking and EAS attestation support

BEGIN;

-- Receipts table: Tracks payment receipts and EAS attestations
CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  receipt_id TEXT NOT NULL UNIQUE,
  payment_id INTEGER REFERENCES payments(id) ON DELETE CASCADE,
  buyer TEXT NOT NULL,
  seller TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  amount_usd6 BIGINT NOT NULL,
  units INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp INTEGER NOT NULL,
  
  -- EAS attestation fields
  attestation_uid TEXT UNIQUE,
  schema_uid TEXT,
  attested_at TIMESTAMP,
  attestation_tx TEXT,
  
  -- Receipt metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_receipts_receipt_id ON receipts(receipt_id);
CREATE INDEX idx_receipts_buyer ON receipts(buyer);
CREATE INDEX idx_receipts_seller ON receipts(seller);
CREATE INDEX idx_receipts_sku_id ON receipts(sku_id);
CREATE INDEX idx_receipts_attestation_uid ON receipts(attestation_uid);
CREATE INDEX idx_receipts_payment_id ON receipts(payment_id);

-- EAS Schema Registry
-- Stores EAS schema UIDs for different receipt types
CREATE TABLE IF NOT EXISTS eas_schemas (
  id SERIAL PRIMARY KEY,
  schema_name TEXT NOT NULL UNIQUE,
  schema_uid TEXT NOT NULL,
  schema_definition TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'base-sepolia',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_eas_schemas_schema_name ON eas_schemas(schema_name);
CREATE INDEX idx_eas_schemas_schema_uid ON eas_schemas(schema_uid);

-- Insert default receipt schema
-- This will be updated with actual UID after schema registration
INSERT INTO eas_schemas (schema_name, schema_uid, schema_definition, network) VALUES
  (
    'basebytes-receipt-v1',
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    'string receiptId,address buyer,address seller,string skuId,uint256 amountUsd6,uint32 units,bytes32 txHash',
    'base-sepolia'
  )
ON CONFLICT (schema_name) DO NOTHING;

COMMIT;
