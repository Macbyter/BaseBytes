# Maintainer Guide — BaseBytes

This document provides setup instructions, post-merge checklists, and operational procedures for repository maintainers.

---

## Table of Contents

1. [One-Time Setup](#one-time-setup)
2. [Post-Merge Checklist: PR #5 (tx-self helper)](#post-merge-checklist-pr-5-tx-self-helper)
3. [Post-Merge Checklist: PR #6 (EAS anchoring)](#post-merge-checklist-pr-6-eas-anchoring)
4. [Rollback Procedures](#rollback-procedures)
5. [Troubleshooting](#troubleshooting)

---

## One-Time Setup

### 1. Enable GitHub Actions Permissions

**Location:** Repository → Settings → Actions → General

**Required Settings:**
- **Workflow permissions:** Read and write permissions ✅
- **Allow GitHub Actions to create and approve pull requests** (optional, for automation bots)

**Why:** Workflows need write permissions to upload artifacts and update PR statuses.

---

### 2. Protect Main Branch

**Location:** Repository → Settings → Branches → Add branch protection rule

**Branch name pattern:** `main`

**Recommended Rules:**
- ✅ **Require a pull request before merging**
  - Require approvals: 1 (or 0 for solo development)
- ✅ **Require status checks to pass before merging**
  - Require branches to be up to date
  - Required checks: `Build and Test` (from CI workflow)
- ✅ **Require conversation resolution before merging**
- ✅ **Do not allow bypassing the above settings**

**Why:** Prevents direct pushes to main and ensures all changes go through PR review and CI validation.

---

### 3. Set Repository Secrets

**Location:** Repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

#### `BASE_SEPOLIA_RPC`
- **Value:** Your Base Sepolia RPC URL
- **Example:** `https://sepolia.base.org` or Alchemy/Infura endpoint
- **Used by:** Tx Self Action, EAS attester worker

#### `ATTESTER_PRIVATE_KEY`
- **Value:** Wallet private key with 0x prefix (64 hex characters)
- **Example:** `0x1234567890abcdef...`
- **Requirements:** 
  - Must be funded with ETH on Base Sepolia
  - Used for transaction signing
- **⚠️ Security:** Never commit this to the repository or share in issues/PRs

#### `ATTESTER_ADDRESS` (optional)
- **Value:** Ethereum address derived from the private key
- **Example:** `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- **Used by:** Validation checks

---

### 4. Set Codespaces Secrets (Optional, for Development)

**Location:** Your GitHub Settings → Codespaces → Secrets → New secret

Add the same secrets as above for interactive development in Codespaces:
- `BASE_SEPOLIA_RPC` (or `RPC_URL`)
- `ATTESTER_PRIVATE_KEY` (or `PRIVATE_KEY`)
- `ATTESTER_ADDRESS` (optional)

---

## Post-Merge Checklist: PR #5 (tx-self helper)

After merging PR #5, follow these steps to verify the tx-self helper functionality.

### 1. Verify Secrets Are Set

```bash
# Check that secrets exist (will not show values)
gh secret list
# Should show: BASE_SEPOLIA_RPC, ATTESTER_PRIVATE_KEY
```

### 2. Run Tx Self Action (Dry Run)

1. Go to **Actions** → **Tx Self (Manual)**
2. Click **Run workflow**
3. Select **dry-run** mode
4. Click **Run workflow**
5. Wait for completion (~30 seconds)
6. Verify:
   - ✅ Workflow completes successfully
   - ✅ Chain ID verified (0x14a34)
   - ✅ Masked transaction summary printed

### 3. Run Tx Self Action (Live)

1. Go to **Actions** → **Tx Self (Manual)**
2. Click **Run workflow**
3. Select **live** mode
4. Click **Run workflow**
5. Wait for completion (~1-2 minutes)
6. Verify:
   - ✅ Transaction broadcast successful
   - ✅ Transaction confirmed (1 confirmation)
   - ✅ Artifacts uploaded (download `tx-diagnostics-*`)

### 4. Verify on BaseScan

1. Download the artifact from the workflow run
2. Extract and open `tx_*.json`
3. Copy the transaction hash
4. Visit: `https://sepolia.basescan.org/tx/{hash}`
5. Verify:
   - ✅ Transaction appears on BaseScan (may take 15-45 seconds to index)
   - ✅ Status: Success
   - ✅ Value: 0 ETH
   - ✅ From/To: Same address (self-transaction)

### 5. Comment on PR #5

Add a comment with the BaseScan link:

```markdown
✅ Tx Self Action verified!

**Dry run:** Passed  
**Live transaction:** https://sepolia.basescan.org/tx/0x...  
**Artifact:** Uploaded and verified

All checks green! 🚀
```

---

## Post-Merge Checklist: PR #6 (EAS anchoring)

After merging PR #6, follow these steps to deploy the EAS anchoring system.

### 1. Apply Database Migration (Staging)

**⚠️ Important:** Test in staging environment first!

```bash
# Connect to staging database
export DATABASE_URL="postgresql://user:pass@staging-db:5432/basebytes"

# Apply migration (idempotent - safe to run multiple times)
psql "$DATABASE_URL" < migrations/001_add_eas_receipt_fields.sql

# Verify columns were added
psql "$DATABASE_URL" -c "
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'receipts' 
AND column_name LIKE 'attestation_%';
"
```

**Expected Output:**
```
       column_name        |     data_type      |  column_default  
--------------------------+--------------------+------------------
 attestation_status       | text               | 'pending'
 attestation_tx           | text               | 
 attestation_uid          | text               | 
 attestation_confirmed_at | timestamp with tz  | 
 attestation_chain_id     | text               | '0x14a34'
 attestation_error        | text               | 
```

### 2. Test Worker (Dry Run)

```bash
# Set environment variables
export BASE_SEPOLIA_RPC="https://sepolia.base.org"
export ATTESTER_PRIVATE_KEY="0x..."
export DATABASE_URL="postgresql://..."

# Run worker in dry-run mode (no database writes)
node workers/eas-attester.js --dry-run

# Verify:
# - Chain ID verified (84532)
# - Attester address displayed
# - Database connection successful
# - No errors
```

### 3. Create Test Receipt (Staging)

```bash
# Insert a test receipt with pending status
psql "$DATABASE_URL" -c "
INSERT INTO receipts (id, data_hash, created_at, attestation_status)
VALUES ('test-001', '0x1234567890abcdef', NOW(), 'pending')
RETURNING id, attestation_status;
"
```

### 4. Run Worker (Live)

```bash
# Run worker with short interval for testing
node workers/eas-attester.js --interval 10 --batch-size 1

# Watch the logs for:
# - "Processing receipt: test-001"
# - "Submitting attestation..."
# - "Transaction hash: 0x..."
# - "Attestation confirmed!"
# - "UID: 0x..."

# Press Ctrl+C to stop after successful attestation
```

### 5. Verify Database Updates

```bash
# Check the test receipt status
psql "$DATABASE_URL" -c "
SELECT 
  id,
  attestation_status,
  attestation_tx,
  attestation_uid,
  attestation_confirmed_at,
  attestation_chain_id
FROM receipts 
WHERE id = 'test-001';
"
```

**Expected:**
- `attestation_status` = `'onchain'`
- `attestation_tx` = `'0x...'` (transaction hash)
- `attestation_uid` = `'0x...'` (EAS attestation UID)
- `attestation_confirmed_at` = timestamp
- `attestation_chain_id` = `'0x14a34'`

### 6. Verify on BaseScan

```bash
# Get the transaction hash from the database
TX_HASH=$(psql "$DATABASE_URL" -t -c "SELECT attestation_tx FROM receipts WHERE id = 'test-001';" | xargs)

# Open in browser
echo "https://sepolia.basescan.org/tx/$TX_HASH"
```

Verify:
- ✅ Transaction appears on BaseScan
- ✅ Status: Success
- ✅ Interacted with EAS contract (0x4200...0021)
- ✅ Event logs show `Attested` event

### 7. Deploy to Production

Once staging tests pass:

```bash
# Apply migration to production database
export DATABASE_URL="postgresql://user:pass@prod-db:5432/basebytes"
psql "$DATABASE_URL" < migrations/001_add_eas_receipt_fields.sql

# Deploy worker (choose your deployment method)

# Option A: PM2
pm2 start workers/eas-attester.js --name eas-attester \
  --env BASE_SEPOLIA_RPC="$RPC" \
  --env ATTESTER_PRIVATE_KEY="$KEY" \
  --env DATABASE_URL="$DB"

# Option B: systemd
sudo systemctl start eas-attester

# Option C: Docker
docker run -d \
  -e BASE_SEPOLIA_RPC="$RPC" \
  -e ATTESTER_PRIVATE_KEY="$KEY" \
  -e DATABASE_URL="$DB" \
  basebytes/attester:latest

# Monitor logs
pm2 logs eas-attester
# or
sudo journalctl -u eas-attester -f
# or
docker logs -f <container-id>
```

### 8. Monitor Attestation Activity

```bash
# Check attestation rate
psql "$DATABASE_URL" -c "
SELECT 
  attestation_status,
  COUNT(*) as count
FROM receipts
GROUP BY attestation_status
ORDER BY count DESC;
"

# Check recent attestations
psql "$DATABASE_URL" -c "
SELECT 
  id,
  attestation_status,
  attestation_confirmed_at
FROM receipts
WHERE attestation_status = 'onchain'
ORDER BY attestation_confirmed_at DESC
LIMIT 10;
"
```

---

## Rollback Procedures

### Rollback PR #5 (tx-self helper)

If issues arise with the tx-self helper:

```bash
# Revert the merge commit
git revert <merge-commit-hash> -m 1

# Or delete the script
git rm scripts/send-eth.js
git commit -m "rollback: remove tx-self helper"
git push origin main
```

**Impact:** Tx Self Action will fail, but no data is affected.

---

### Rollback PR #6 (EAS anchoring)

#### Option 1: Revert Migration (Recommended for Staging)

```bash
# Create rollback migration
cat > migrations/001_rollback_eas_fields.sql << 'EOF'
-- Rollback: Remove EAS attestation fields from receipts

DROP INDEX IF EXISTS idx_receipts_attestation_confirmed;
DROP INDEX IF EXISTS idx_receipts_attestation_chain_id;
DROP INDEX IF EXISTS idx_receipts_attestation_status;

ALTER TABLE receipts DROP COLUMN IF EXISTS attestation_error;
ALTER TABLE receipts DROP COLUMN IF EXISTS attestation_chain_id;
ALTER TABLE receipts DROP COLUMN IF EXISTS attestation_confirmed_at;
ALTER TABLE receipts DROP COLUMN IF EXISTS attestation_uid;
ALTER TABLE receipts DROP COLUMN IF EXISTS attestation_tx;
ALTER TABLE receipts DROP COLUMN IF EXISTS attestation_status;
EOF

# Apply rollback
psql "$DATABASE_URL" < migrations/001_rollback_eas_fields.sql
```

#### Option 2: Stop Worker Only (Recommended for Production)

```bash
# Stop the worker without reverting the migration
pm2 stop eas-attester
# or
sudo systemctl stop eas-attester
# or
docker stop <container-id>

# Receipts will remain in 'pending' status until worker is restarted
```

**Impact:** New receipts won't be attested, but existing data is preserved.

---

### Requeue Failed Attestations

If attestations fail and need to be retried:

```bash
# Reset failed receipts to pending
psql "$DATABASE_URL" -c "
UPDATE receipts
SET 
  attestation_status = 'pending',
  attestation_error = NULL
WHERE attestation_status = 'skipped'
OR (attestation_status = 'attesting' AND attestation_confirmed_at IS NULL);
"

# Restart worker to process pending receipts
pm2 restart eas-attester
```

---

## Troubleshooting

### Tx Self Action Fails

**Symptom:** Workflow fails with "Error: RPC URL is required"

**Solution:**
1. Verify secrets are set: `gh secret list`
2. Check secret names match exactly: `BASE_SEPOLIA_RPC`, `ATTESTER_PRIVATE_KEY`
3. Re-run workflow

---

**Symptom:** Workflow fails with "Chain ID mismatch"

**Solution:**
1. Verify RPC URL points to Base Sepolia (chainId 84532)
2. Test RPC: `curl -X POST $RPC_URL -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'`
3. Expected response: `{"jsonrpc":"2.0","id":1,"result":"0x14a34"}`

---

**Symptom:** Transaction fails with "insufficient funds"

**Solution:**
1. Check wallet balance on BaseScan
2. Fund wallet with Base Sepolia ETH (use faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
3. Re-run workflow

---

### EAS Worker Issues

**Symptom:** Worker fails to connect to database

**Solution:**
1. Verify `DATABASE_URL` is set correctly
2. Test connection: `psql "$DATABASE_URL" -c "SELECT 1;"`
3. Check database credentials and network access

---

**Symptom:** Worker processes receipts but status stays 'attesting'

**Solution:**
1. Check transaction on BaseScan - may be pending
2. Verify gas price is sufficient (Base Sepolia can be slow)
3. Wait for confirmation (can take 1-5 minutes)
4. Check worker logs for errors

---

**Symptom:** Worker logs "EAS contract call failed"

**Solution:**
1. Verify EAS contract address: `0x4200000000000000000000000000000000000021`
2. Check wallet has ETH for gas
3. Verify chainId is correct (84532)
4. Check RPC endpoint is responsive

---

**Symptom:** Receipts stuck in 'pending' status

**Solution:**
1. Check if worker is running: `pm2 list` or `ps aux | grep eas-attester`
2. Check worker logs for errors
3. Verify worker has correct environment variables
4. Restart worker: `pm2 restart eas-attester`

---

## Additional Resources

- [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)
- [Base Sepolia RPC](https://docs.base.org/network-information)
- [BaseScan (Sepolia)](https://sepolia.basescan.org/)
- [EAS Documentation](https://docs.attest.sh/)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)

---

## Support

For issues not covered in this guide:
1. Check existing GitHub issues
2. Review workflow/worker logs
3. Create a new issue with:
   - Error message
   - Steps to reproduce
   - Environment details
   - Relevant logs (with secrets masked)

---

**Last Updated:** 2025-11-03  
**Maintainer:** BaseBytes Team
