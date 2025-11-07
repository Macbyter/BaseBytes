-- Migration 001: Initial schema for BaseBytes
-- Creates core tables: skus, payments, entitlements, balances, indexer_state

BEGIN;

-- SKUs table: Product catalog
CREATE TABLE IF NOT EXISTS skus (
  id SERIAL PRIMARY KEY,
  sku_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  price_usd6 BIGINT NOT NULL,
  unit_name TEXT NOT NULL DEFAULT 'unit',
  schema_type TEXT,
  schema_version TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_skus_sku_id ON skus(sku_id);
CREATE INDEX idx_skus_active ON skus(active);

-- Payments table: All payment transactions
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_timestamp INTEGER NOT NULL,
  buyer TEXT NOT NULL,
  seller TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  amount_usd6 BIGINT NOT NULL,
  units INTEGER NOT NULL,
  rights INTEGER NOT NULL,
  indexed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tx_hash, log_index)
);

CREATE INDEX idx_payments_buyer ON payments(buyer);
CREATE INDEX idx_payments_seller ON payments(seller);
CREATE INDEX idx_payments_sku_id ON payments(sku_id);
CREATE INDEX idx_payments_tx_hash ON payments(tx_hash);
CREATE INDEX idx_payments_block_number ON payments(block_number);

-- Entitlements table: Buyer units per SKU
CREATE TABLE IF NOT EXISTS entitlements (
  id SERIAL PRIMARY KEY,
  buyer TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  units_remaining INTEGER NOT NULL,
  units_purchased INTEGER NOT NULL,
  first_purchase_at TIMESTAMP DEFAULT NOW(),
  last_purchase_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(buyer, sku_id)
);

CREATE INDEX idx_entitlements_buyer ON entitlements(buyer);
CREATE INDEX idx_entitlements_sku_id ON entitlements(sku_id);

-- Balances table: Seller earnings aggregation
CREATE TABLE IF NOT EXISTS balances (
  id SERIAL PRIMARY KEY,
  seller TEXT NOT NULL UNIQUE,
  total_earned_usd6 BIGINT DEFAULT 0,
  total_units_sold INTEGER DEFAULT 0,
  last_sale_at TIMESTAMP
);

CREATE INDEX idx_balances_seller ON balances(seller);

-- Indexer state table: Resumability tracking
CREATE TABLE IF NOT EXISTS indexer_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_processed_block INTEGER NOT NULL,
  last_processed_at TIMESTAMP DEFAULT NOW(),
  CHECK (id = 1)
);

-- Insert initial SKUs
INSERT INTO skus (sku_id, title, price_usd6, unit_name, schema_type, schema_version) VALUES
  ('defi:preTradeRisk', 'DeFi Pre-Trade Risk', 200000, 'unit', 'risk-assessment', '1.0'),
  ('bridge:provenance', 'Bridge Provenance', 150000, 'unit', 'provenance-check', '1.0'),
  ('market:claimGuard', 'Market Claim Guard', 250000, 'unit', 'claim-validation', '1.0')
ON CONFLICT (sku_id) DO NOTHING;

-- Initialize indexer state
INSERT INTO indexer_state (id, last_processed_block)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

COMMIT;
