# Phase 4.3: EAS Worker Smoke Test (End-to-End)

This guide covers running an end-to-end smoke test of the EAS attestation worker.

## Prerequisites

- ✅ Phase 4.2 completed (secrets set, database running, migrations applied)
- ✅ Environment variables set:
  - `DATABASE_URL`
  - `BASE_SEPOLIA_RPC`
  - `ATTESTER_PRIVATE_KEY`

---

## Step 1: Seed Test Receipt

Insert a test receipt into the database:

```sql
-- Connect to database
psql "$DATABASE_URL"

-- Create receipts table if it doesn't exist
CREATE TABLE IF NOT EXISTS receipts (
  receipt_uid TEXT PRIMARY KEY,
  app_id TEXT,
  sku TEXT,
  policy_version TEXT,
  decision TEXT,
  confidence NUMERIC,
  features_hash TEXT,
  feature_commitment TEXT,
  privacy_mode TEXT,
  zk_scheme TEXT,
  proof_ref TEXT,
  evidence_set TEXT[],
  ts TIMESTAMPTZ DEFAULT now(),
  attestation_status TEXT DEFAULT 'pending',
  attestation_tx TEXT,
  attestation_uid TEXT,
  attestation_confirmed_at TIMESTAMPTZ,
  attestation_chain_id TEXT DEFAULT '0x14a34',
  attestation_error TEXT
);

-- Insert test receipt
INSERT INTO receipts (
  receipt_uid, app_id, sku, policy_version, decision, confidence,
  features_hash, feature_commitment, privacy_mode, zk_scheme, proof_ref,
  evidence_set, ts
)
VALUES (
  'rcpt_stg_1',
  'demo',
  'defi:preTradeRisk:v1',
  'v1',
  'allow',
  0.93,
  '0xabc123',
  '0xabc123',
  'public',
  '',
  '0x0',
  ARRAY[]::TEXT[],
  now()
);

-- Verify insertion
SELECT receipt_uid, attestation_status, attestation_uid
FROM receipts
WHERE receipt_uid = 'rcpt_stg_1';
```

Expected output:
```
 receipt_uid  | attestation_status | attestation_uid
--------------+--------------------+-----------------
 rcpt_stg_1   | pending            |
```

---

## Step 2: Run EAS Worker (Dry Run)

Test the worker without making actual on-chain transactions:

```bash
# Dry run mode (no database writes, no transactions)
node workers/eas-attester.js --dry-run
```

Expected output:
```
🚀 BaseBytes EAS Attester Worker
Mode: 🧪 DRY RUN (simulation only)
RPC: https://base-sepolia.g.alchemy.com/v2/...
Database: postgresql://postgres:***@localhost:5432/basebytes

🔍 Verifying chain ID...
   Chain ID: 84532 (0x14a34)
   ✅ Chain ID verified: Base Sepolia

📋 Polling for pending receipts...
   Found 1 pending receipt(s)

🔄 Processing receipt: rcpt_stg_1
   Status: pending → attesting (DRY RUN)
   Would attest with EAS contract: 0x4200000000000000000000000000000000000021

✅ Dry run complete. No database writes performed.
```

---

## Step 3: Run EAS Worker (Live)

Run the worker to actually attest the receipt on-chain:

```bash
# Live mode (will make on-chain transactions)
node workers/eas-attester.js --interval 10 --batch-size 5
```

Expected output:
```
🚀 BaseBytes EAS Attester Worker
Mode: ⚡ LIVE (will broadcast)
RPC: https://base-sepolia.g.alchemy.com/v2/...
Database: postgresql://postgres:***@localhost:5432/basebytes
Poll interval: 10s
Batch size: 5

🔍 Verifying chain ID...
   Chain ID: 84532 (0x14a34)
   ✅ Chain ID verified: Base Sepolia

📋 Polling for pending receipts...
   Found 1 pending receipt(s)

🔄 Processing receipt: rcpt_stg_1
   Status: pending → attesting
   Attesting to EAS contract: 0x4200000000000000000000000000000000000021
   
📡 Broadcasting attestation...
   Transaction hash: 0x1234...5678
   Waiting for confirmation...
   
✅ Attestation confirmed!
   UID: 0xabcd...ef01
   TX: 0x1234...5678
   Status: attesting → onchain

💾 Database updated
   attestation_uid: 0xabcd...ef01
   attestation_tx: 0x1234...5678
   attestation_status: onchain
   attestation_confirmed_at: 2025-11-04 09:30:15

🔗 View on BaseScan:
   https://sepolia.basescan.org/tx/0x1234...5678

⏰ Next poll in 10 seconds...
```

---

## Step 4: Verify Attestation

### Check Database

```sql
-- Connect to database
psql "$DATABASE_URL"

-- Query the attested receipt
SELECT 
  receipt_uid,
  attestation_status,
  attestation_uid,
  attestation_tx,
  attestation_confirmed_at,
  attestation_chain_id
FROM receipts
WHERE receipt_uid = 'rcpt_stg_1';
```

Expected output:
```
 receipt_uid  | attestation_status | attestation_uid                                                          | attestation_tx                                                           | attestation_confirmed_at      | attestation_chain_id
--------------+--------------------+--------------------------------------------------------------------------+--------------------------------------------------------------------------+-------------------------------+----------------------
 rcpt_stg_1   | onchain            | 0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab | 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef | 2025-11-04 09:30:15.123456+00 | 0x14a34
```

### Check BaseScan

Visit the transaction on BaseScan:
```
https://sepolia.basescan.org/tx/{attestation_tx}
```

Verify:
- ✅ Transaction confirmed
- ✅ To address: `0x4200000000000000000000000000000000000021` (EAS contract)
- ✅ Status: Success
- ✅ Block number present

---

## Step 5: Test Error Handling

### Test Invalid Receipt

```sql
-- Insert receipt with invalid data
INSERT INTO receipts (
  receipt_uid, app_id, sku, policy_version, decision, confidence,
  features_hash, feature_commitment, privacy_mode, zk_scheme, proof_ref,
  evidence_set, ts
)
VALUES (
  'rcpt_invalid_1',
  '',  -- Invalid: empty app_id
  'test',
  'v1',
  'deny',
  0.5,
  '',
  '',
  'public',
  '',
  '0x0',
  ARRAY[]::TEXT[],
  now()
);
```

Run worker and verify error handling:
```bash
node workers/eas-attester.js --interval 10
```

Expected behavior:
- Worker detects invalid data
- Sets `attestation_status` to `skipped`
- Records error in `attestation_error` column
- Continues processing other receipts

### Verify Error Recorded

```sql
SELECT receipt_uid, attestation_status, attestation_error
FROM receipts
WHERE receipt_uid = 'rcpt_invalid_1';
```

Expected output:
```
 receipt_uid     | attestation_status | attestation_error
-----------------+--------------------+------------------
 rcpt_invalid_1  | skipped            | Invalid app_id: cannot be empty
```

---

## Step 6: Test Grace Period

The `require_attested: true` threshold includes a 300-second grace period.

### Test Sequence

1. **Insert new receipt**
   ```sql
   INSERT INTO receipts (receipt_uid, app_id, sku, policy_version, decision, confidence, features_hash, feature_commitment, privacy_mode, zk_scheme, proof_ref, evidence_set, ts)
   VALUES ('rcpt_grace_1', 'demo', 'test:v1', 'v1', 'allow', 0.9, '0x123', '0x123', 'public', '', '0x0', '{}', now());
   ```

2. **Check status immediately** (within 300s)
   ```sql
   SELECT receipt_uid, attestation_status, 
          EXTRACT(EPOCH FROM (now() - ts)) as age_seconds
   FROM receipts WHERE receipt_uid = 'rcpt_grace_1';
   ```
   
   Expected: `attestation_status = 'pending'`, age < 300s
   Result: **Accepted** (within grace period)

3. **Wait for worker to attest**
   - Worker polls every 10-60 seconds
   - Attestation should complete within grace period

4. **Verify final status**
   ```sql
   SELECT receipt_uid, attestation_status, attestation_uid
   FROM receipts WHERE receipt_uid = 'rcpt_grace_1';
   ```
   
   Expected: `attestation_status = 'onchain'`, attestation_uid present

---

## Troubleshooting

### Worker Not Finding Receipts

```sql
-- Check pending receipts
SELECT receipt_uid, attestation_status, ts
FROM receipts
WHERE attestation_status = 'pending'
ORDER BY ts DESC;
```

### Worker Failing to Attest

Check logs for:
- ❌ RPC connection errors → Verify `BASE_SEPOLIA_RPC`
- ❌ Insufficient gas → Fund attester address with Base Sepolia ETH
- ❌ Invalid private key → Verify `ATTESTER_PRIVATE_KEY` format
- ❌ Database errors → Check `DATABASE_URL` and connection

### Attestation Stuck in "attesting"

```sql
-- Find stuck attestations
SELECT receipt_uid, attestation_status, 
       EXTRACT(EPOCH FROM (now() - ts)) as stuck_seconds
FROM receipts
WHERE attestation_status = 'attesting'
  AND ts < now() - interval '5 minutes';
```

Reset if needed:
```sql
UPDATE receipts
SET attestation_status = 'pending',
    attestation_error = 'Reset from stuck state'
WHERE attestation_status = 'attesting'
  AND ts < now() - interval '5 minutes';
```

---

## Cleanup

```sql
-- Remove test receipts
DELETE FROM receipts WHERE receipt_uid LIKE 'rcpt_%';

-- Or reset all attestations
UPDATE receipts
SET attestation_status = 'pending',
    attestation_tx = NULL,
    attestation_uid = NULL,
    attestation_confirmed_at = NULL,
    attestation_error = NULL
WHERE attestation_status != 'pending';
```

---

## Success Criteria

✅ **Phase 4.3 Complete** when:
1. Test receipt inserted successfully
2. Worker runs in dry-run mode without errors
3. Worker attests receipt on-chain (live mode)
4. Database updated with `attestation_uid` and `attestation_tx`
5. Transaction visible on BaseScan
6. Error handling works for invalid receipts
7. Grace period behavior verified

---

## Next Steps

After completing Phase 4.3:
1. ✅ EAS worker smoke test passed
2. ✅ End-to-end attestation verified
3. ➡️ Proceed to **Phase 4.4: CI Guardrails & Branch Protection**

See `PHASE_4_4_CI_GUARDRAILS.md` for next steps.
