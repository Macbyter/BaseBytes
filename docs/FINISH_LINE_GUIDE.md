# Finish Line Guide: Phases 4.2–4.4

**Status:** 🎯 Ready to ship  
**Last Updated:** 2025-11-04

This guide walks you through the final operational steps to complete your production-ready setup.

---

## Quick Status Check

✅ **What's locked & verifiable:**
- Live tx rail: EIP-1559 self-tx confirmed on Base Sepolia (chain 0x14A34 / 84532)
- EAS anchoring: Migration + worker merged; status transitions working
- Quality gates: `metrics/thresholds.json` has `require_attested: true`, min-confidence 0.85, 300-second grace
- Tests & sim: vitest + pg-mem simulation suite merged (11/11 passing, ~463ms)
- CI: Workflows exist and pass tests; one manual step remains

---

## Phase 4.2: Secrets & Staging Rail

### 1. Bring up Postgres/Redis for staging

```bash
# Start infrastructure
docker compose up -d

# Verify services are healthy
docker compose ps

# Expected output:
# NAME                  STATUS
# basebytes-postgres    Up (healthy)
# basebytes-redis       Up (healthy)
```

### 2. Wire DB and run migrations

```bash
# Set DATABASE_URL for this shell
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/basebytes"

# Run migrations
npm run migrate

# Expected output:
# ✓ Migration 001_add_eas_receipt_fields.sql applied successfully
```

### 3. Set repository secrets

Go to: **Settings → Secrets and variables → Actions → New repository secret**

Required secrets:
- `BASE_SEPOLIA_RPC` (or `RPC_URL`) - Your Base Sepolia RPC endpoint
- `ATTESTER_PRIVATE_KEY` - Private key for attestation signing (0x-prefixed)
- `DATABASE_URL` - Connection string for staging/production DB

**Example values:**
```
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY
ATTESTER_PRIVATE_KEY=0x...
DATABASE_URL=postgres://postgres:postgres@host:5432/basebytes
```

### 4. Smoke test the chain

```bash
# Verify chain ID
npm run chain:check
# Expected: ✓ Connected to Base Sepolia (0x14A34 / 84532)

# Run self-transaction test
npm run tx:self
# Expected: ✓ Transaction confirmed: 0x...
```

---

## Phase 4.3: EAS Worker Smoke Test

### 1. Start the EAS worker

Open a new terminal:

```bash
cd /path/to/BaseBytes
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/basebytes"
npm run worker:eas || node workers/eas-attester.js
```

**Expected output:**
```
🚀 EAS Worker started
📡 Polling for pending receipts...
```

### 2. Seed a pending receipt

Open another terminal:

```bash
docker exec -it basebytes-postgres psql -U postgres -d basebytes -c "
  INSERT INTO receipts (
    receipt_uid, ts, app_id, sku, policy_version, decision, confidence,
    features_hash, feature_commitment, privacy_mode, zk_scheme, proof_ref, evidence_set
  ) VALUES (
    'rcpt_stg_1', now(), 'demo','defi:preTradeRisk:v1','v1','allow',0.93,
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'public','', '0x0', '{}'
  );
"
```

**Expected output:**
```
INSERT 0 1
```

### 3. Watch the worker process it

Wait ~10 seconds, then check the receipt status:

```bash
docker exec -it basebytes-postgres psql -U postgres -d basebytes -c "
  SELECT 
    receipt_uid, 
    attestation_status, 
    left(attestation_uid,10)||'…' AS uid, 
    left(coalesce(attestation_tx,''),10)||'…' AS tx 
  FROM receipts 
  WHERE receipt_uid='rcpt_stg_1';
"
```

**Green criterion:**
```
 receipt_uid  | attestation_status |    uid     |    tx
--------------+--------------------+------------+------------
 rcpt_stg_1   | onchain            | 0x1234...  | 0xabcd...
```

Both `attestation_uid` and `attestation_tx` should be populated.

---

## Phase 4.4: CI Guardrails & Branch Protection

### 1. Update CI workflow

**Option A: Via GitHub UI (recommended)**

1. Go to: https://github.com/Macbyter/BaseBytes/edit/main/.github/workflows/ci.yml
2. Replace content with:

```yaml
name: CI

on:
  push:
    branches: ["main", "release/**"]
  pull_request:
    branches: ["main", "release/**"]

jobs:
  build-and-test:
    name: Build and Test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
      checks: write
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Check JavaScript syntax
        run: |
          echo "Checking JavaScript syntax..."
          find scripts workers -name "*.js" -exec node --check {} \;
      
      - name: Run EAS worker simulation tests
        run: npm test
      
      - name: Validate metrics thresholds
        run: npm run metrics:verify
```

3. Commit directly to main: "ci: update workflow with test and metrics checks"

**Option B: Via command line**

```bash
# Copy the updated workflow
cp .github/workflows/ci-updated.yml .github/workflows/ci.yml

# Commit and push
git add .github/workflows/ci.yml
git commit -m "ci: update workflow with test and metrics checks"
git push origin main
```

### 2. Configure branch protection

Follow the detailed guide in `docs/BRANCH_PROTECTION.md`, or use this quick setup:

**Via GitHub UI:**

1. Go to: **Settings → Branches → Add rule**
2. Branch name pattern: `main`
3. Enable these settings:
   - ✅ Require a pull request before merging
     - Required approvals: 1 (or 0 for solo projects)
   - ✅ Require status checks to pass before merging
     - ✅ Require branches to be up to date
     - Required checks:
       - `Build and Test`
       - `Run EAS worker simulation tests`
       - `Validate metrics thresholds`
   - ✅ Require conversation resolution before merging
4. Click **Create** or **Save changes**

**Via GitHub CLI:**

```bash
gh api repos/Macbyter/BaseBytes/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field 'required_status_checks[contexts][]=Build and Test' \
  --field required_pull_request_reviews[required_approving_review_count]=0 \
  --field enforce_admins=false \
  --field required_conversation_resolution=true
```

### 3. Test branch protection

```bash
# Create test branch
git checkout -b chore/verify-protection
echo "# CI sanity ✓" >> .github/ci-sanity.md
git add .
git commit -m "chore: verify branch protection hooks"
git push -u origin chore/verify-protection

# Create PR
gh pr create --base main --head chore/verify-protection \
  --title "Test: Branch Protection" \
  --body "Testing branch protection rules and required status checks"

# Verify:
# 1. PR shows required checks
# 2. Merge button is disabled until checks pass
# 3. All checks run and pass
# 4. Merge button becomes enabled

# Clean up after verification
gh pr close <PR_NUMBER>
git checkout main
git branch -D chore/verify-protection
git push origin --delete chore/verify-protection
```

---

## Verification Checklist

After completing all phases, verify:

### Phase 4.2: Secrets & Staging
- [ ] Docker containers running (postgres + redis)
- [ ] Migrations applied successfully
- [ ] Repository secrets configured
- [ ] Chain check passes (`npm run chain:check`)
- [ ] Self-transaction test passes (`npm run tx:self`)

### Phase 4.3: EAS Worker
- [ ] Worker starts without errors
- [ ] Pending receipt inserted successfully
- [ ] Worker processes receipt (status → attesting)
- [ ] Receipt reaches `onchain` status
- [ ] `attestation_uid` and `attestation_tx` populated

### Phase 4.4: CI & Protection
- [ ] CI workflow updated
- [ ] Branch protection configured
- [ ] Test PR shows required checks
- [ ] Checks run automatically
- [ ] Merge blocked until checks pass
- [ ] Merge succeeds after checks pass

---

## Troubleshooting

### Docker containers won't start

**Problem:** `docker compose up -d` fails

**Solutions:**
- Ensure Docker is installed and running
- Check port conflicts: `lsof -i :5432` (postgres) or `lsof -i :6379` (redis)
- Try: `docker compose down && docker compose up -d`

### Migration fails

**Problem:** `npm run migrate` returns error

**Solutions:**
- Verify DATABASE_URL is set: `echo $DATABASE_URL`
- Check postgres is running: `docker compose ps`
- Verify connection: `psql $DATABASE_URL -c "SELECT 1;"`
- Check migration file exists: `ls migrations/001_*.sql`

### Worker doesn't process receipts

**Problem:** Receipt stays in `pending` status

**Solutions:**
- Check worker logs for errors
- Verify DATABASE_URL is set correctly
- Ensure EAS contract addresses are correct (Base Sepolia)
- Check network connectivity to Base Sepolia RPC
- Verify ATTESTER_PRIVATE_KEY has funds for gas

### CI checks don't appear in PR

**Problem:** Required status checks missing

**Solutions:**
- Ensure CI workflow has run at least once on main
- Check workflow syntax: `.github/workflows/ci.yml`
- Verify workflow is enabled: **Settings → Actions → General**
- Wait a few minutes for GitHub to index the workflow

---

## Quick Commands Reference

```bash
# Infrastructure
docker compose up -d                 # Start services
docker compose down                  # Stop services
docker compose ps                    # Check status
docker compose logs -f postgres      # View logs

# Database
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/basebytes"
npm run migrate                      # Run migrations
psql $DATABASE_URL                   # Connect to DB

# Testing
npm test                             # Run all tests
npm run test:watch                   # Watch mode
npm run metrics:verify               # Validate thresholds
npm run chain:check                  # Verify chain ID
npm run tx:self                      # Self-transaction test

# Worker
npm run worker:eas                   # Start EAS worker
node workers/eas-attester.js         # Alternative start

# Git/GitHub
gh pr list                           # List PRs
gh pr create                         # Create PR
gh pr merge <N> --squash             # Merge PR
gh repo view --web                   # Open repo in browser
```

---

## Success Criteria

You're ready to ship when:

✅ All Phase 4.2 checklist items complete  
✅ All Phase 4.3 checklist items complete  
✅ All Phase 4.4 checklist items complete  
✅ Test PR successfully demonstrates branch protection  
✅ EAS worker successfully attests a receipt end-to-end

---

## Next Steps After Completion

1. **Deploy to production**
   - Update DATABASE_URL to production DB
   - Update RPC_URL to production/mainnet endpoint
   - Update EAS contract addresses (if using mainnet)

2. **Monitor and maintain**
   - Set up logging/monitoring for workers
   - Configure alerts for attestation failures
   - Regular database backups
   - Monitor gas costs for attestations

3. **Scale as needed**
   - Add more worker instances for higher throughput
   - Implement queue system (Redis) for batch processing
   - Consider rate limiting for RPC calls

---

**Status:** 🎯 Ready to ship  
**Timeline:** ~30 minutes to complete all phases  
**Support:** See `docs/BRANCH_PROTECTION.md` and `MAINTAINER.md` for additional guidance
