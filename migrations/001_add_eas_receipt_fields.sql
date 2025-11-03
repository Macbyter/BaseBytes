-- Migration: Add EAS (Ethereum Attestation Service) anchoring fields to receipts
-- Description: Tracks attestation status and on-chain anchoring for data receipts
-- Version: 001
-- Date: 2025-11-03

-- Add EAS attestation fields to receipts table
-- Idempotent: safe to run multiple times

-- Attestation status tracking
ALTER TABLE IF EXISTS receipts 
ADD COLUMN IF NOT EXISTS attestation_status TEXT DEFAULT 'pending'
CHECK (attestation_status IN ('pending', 'attesting', 'onchain', 'skipped'));

-- Attestation transaction hash (when submitted to chain)
ALTER TABLE IF EXISTS receipts 
ADD COLUMN IF NOT EXISTS attestation_tx TEXT;

-- Attestation UID (unique identifier from EAS contract)
ALTER TABLE IF EXISTS receipts 
ADD COLUMN IF NOT EXISTS attestation_uid TEXT;

-- Timestamp when attestation was confirmed on-chain
ALTER TABLE IF EXISTS receipts 
ADD COLUMN IF NOT EXISTS attestation_confirmed_at TIMESTAMPTZ;

-- Chain ID where attestation was anchored (default: Base Sepolia)
ALTER TABLE IF EXISTS receipts 
ADD COLUMN IF NOT EXISTS attestation_chain_id TEXT DEFAULT '0x14a34';

-- Error message if attestation failed
ALTER TABLE IF NOT EXISTS receipts 
ADD COLUMN IF NOT EXISTS attestation_error TEXT;

-- Create index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_receipts_attestation_status 
ON receipts(attestation_status);

-- Create index for chain ID queries
CREATE INDEX IF NOT EXISTS idx_receipts_attestation_chain_id 
ON receipts(attestation_chain_id);

-- Create index for confirmed attestations
CREATE INDEX IF NOT EXISTS idx_receipts_attestation_confirmed 
ON receipts(attestation_confirmed_at) 
WHERE attestation_status = 'onchain';

-- Comments for documentation
COMMENT ON COLUMN receipts.attestation_status IS 
'Attestation lifecycle: pending → attesting → onchain (or skipped on error)';

COMMENT ON COLUMN receipts.attestation_tx IS 
'Transaction hash of the attestation submission (0x...)';

COMMENT ON COLUMN receipts.attestation_uid IS 
'Unique attestation identifier from EAS contract (0x...)';

COMMENT ON COLUMN receipts.attestation_confirmed_at IS 
'Timestamp when attestation transaction was confirmed (1+ confirmations)';

COMMENT ON COLUMN receipts.attestation_chain_id IS 
'Chain ID where attestation is anchored (0x14a34 = Base Sepolia / 84532)';

COMMENT ON COLUMN receipts.attestation_error IS 
'Error message if attestation failed (for debugging and retry logic)';

-- Migration complete
-- Next: Implement worker to manage status transitions
