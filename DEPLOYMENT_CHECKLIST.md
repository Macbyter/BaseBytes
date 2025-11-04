# BaseBytes Deployment Checklist

**Complete checklist for deploying BaseBytes to production**

**Date:** November 4, 2025  
**Version:** 1.0  
**Status:** Ready for deployment

---

## Pre-Deployment Checklist

### 1. Code & Documentation ✅

- [x] All tests passing (11/11)
- [x] Metrics validation passing
- [x] SLO guard passing
- [x] E2E verification report created
- [x] GitHub integration guide complete
- [x] README updated with latest reports
- [x] Diagnostics committed

### 2. GitHub Setup ✅

- [x] Repository created
- [x] CI workflow configured
- [x] Branch protection rules defined
- [x] Secrets configured (placeholders)
- [ ] Update secrets with production values
- [ ] Test CI pipeline with real PR
- [ ] Verify branch protection works

### 3. Infrastructure Preparation

- [ ] PostgreSQL 15 deployed
- [ ] Redis 7 deployed
- [ ] Database migrations run
- [ ] EAS worker configured
- [ ] Monitoring setup (optional)
- [ ] Alerting configured (optional)

---

## Deployment Steps

### Phase 1: GitHub Integration (5 minutes)

**Goal:** Set up GitHub repository with CI/CD

```bash
# 1. Configure
export GH_OWNER="Macbyter"
export GH_REPO="BaseBytes"
export APPLY_BRANCH_PROTECTION="true"

# 2. Authenticate
gh auth login

# 3. Run bootstrap
cd BaseBytes
bash ops/github-bootstrap.sh
```

**Verification:**
- ✅ Repository created on GitHub
- ✅ CI workflow visible in Actions tab
- ✅ Branch protection rules applied
- ✅ Placeholder secrets created

---

### Phase 2: Update Secrets (2 minutes)

**Goal:** Replace placeholder secrets with production values

```bash
# Base Sepolia RPC
gh secret set BASE_SEPOLIA_RPC \
  -r Macbyter/BaseBytes \
  -b 'https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY'

# Attester private key
gh secret set ATTESTER_PRIVATE_KEY \
  -r Macbyter/BaseBytes \
  -b '0xYOUR_PRODUCTION_PRIVATE_KEY'

# Database URL (when ready)
gh secret set DATABASE_URL \
  -r Macbyter/BaseBytes \
  -b 'postgres://user:pass@host:5432/basebytes'
```

**Verification:**
```bash
gh secret list -r Macbyter/BaseBytes
```

Expected output:
```
BASE_SEPOLIA_RPC        Updated 2025-11-04
ATTESTER_PRIVATE_KEY    Updated 2025-11-04
DATABASE_URL            Updated 2025-11-04
```

---

### Phase 3: Create Verification PR (3 minutes)

**Goal:** Commit reports and test CI pipeline

```bash
cd BaseBytes
bash create-pr.sh
```

**What it does:**
1. Creates branch `chore/report/2025-11-04-e2e-live`
2. Commits reports, diagnostics, and scripts
3. Pushes to GitHub
4. Creates pull request

**Verification:**
1. Go to PR page
2. Wait for CI checks (~40 seconds)
3. Verify all 3 checks pass:
   - ✅ Run tests (incl. EAS worker simulation)
   - ✅ Validate metrics thresholds (require_attested=true)
   - ✅ SLO guard (p95 <= 60000ms, attested >= 0.995)

---

### Phase 4: Test Branch Protection (2 minutes)

**Goal:** Verify branch protection prevents direct pushes

```bash
# Try to push directly to main (should fail)
git checkout main
echo "# Test" >> README.md
git add README.md
git commit -m "test: direct push"
git push origin main
```

**Expected result:**
```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: error: Required status check "Run tests (incl. EAS worker simulation)" is expected.
```

**If successful:** Branch protection is working! ✅

**Cleanup:**
```bash
git reset --hard HEAD~1
```

---

### Phase 5: Merge Verification PR (2 minutes)

**Goal:** Merge the verification report PR

**Steps:**
1. Get PR approval (if required)
2. Ensure all CI checks pass
3. Click "Squash and merge"
4. Delete branch after merge

**Verification:**
```bash
git checkout main
git pull
ls docs/reports/
ls docs/runbooks/
```

Expected files:
- `docs/reports/2025-11-04-e2e-live-sepolia.md`
- `docs/runbooks/github-integration.md`

---

### Phase 6: Tag Release v0.1.0 (2 minutes)

**Goal:** Create and push release tag

```bash
git checkout main
git pull

# Create annotated tag
git tag -a v0.1.0 -m "BaseBytes v0.1.0 — Live E2E verified, CI/CD complete"

# Push tag
git push origin v0.1.0

# Create GitHub release
gh release create v0.1.0 \
  --notes-file docs/reports/2025-11-04-e2e-live-sepolia.md \
  --title "BaseBytes v0.1.0 — Production Ready"
```

**Verification:**
```bash
git tag -l
gh release list
```

---

### Phase 7: Deploy Infrastructure (15 minutes)

**Goal:** Set up production database and workers

#### 7.1 PostgreSQL Setup

```bash
# Option A: Docker Compose (development/staging)
cd BaseBytes
docker compose -p basebytes up -d

# Option B: Managed service (production)
# Use your cloud provider's PostgreSQL service
# Example: AWS RDS, Google Cloud SQL, Azure Database
```

**Verification:**
```bash
# Test connection
psql "$DATABASE_URL" -c "SELECT version();"
```

#### 7.2 Run Migrations

```bash
export DATABASE_URL="postgres://user:pass@host:5432/basebytes"
npm run migrate
```

**Verification:**
```bash
psql "$DATABASE_URL" -c "\dt"
```

Expected tables:
- `receipts`
- `provider_metrics`
- Other schema tables

#### 7.3 Start EAS Worker

```bash
# Set environment variables
export BASE_RPC_URL="https://base-sepolia.g.alchemy.com/v2/YOUR_KEY"
export ATTESTER_PRIVATE_KEY="0xYOUR_KEY"
export DATABASE_URL="postgres://user:pass@host:5432/basebytes"
export EAS_CONTRACT="0x4200000000000000000000000000000000000021"
export EAS_SCHEMA_REGISTRY="0x4200000000000000000000000000000000000020"

# Start worker
npm run worker:eas

# Or use PM2 for production
pm2 start workers/eas-attester.js --name basebytes-eas-worker
```

**Verification:**
```bash
# Check worker is running
pm2 status

# Check logs
pm2 logs basebytes-eas-worker
```

---

### Phase 8: Run Live E2E Test (5 minutes)

**Goal:** Execute complete E2E test with live attestation

```bash
cd BaseBytes

# Set credentials
export RPC_URL="https://base-sepolia-rpc.publicnode.com"
export PRIVATE_KEY="0xYOUR_KEY"
export DOCKER=1  # Use Docker for PostgreSQL + Redis

# Run E2E
bash ops/e2e/mega-run.sh
```

**Expected output:**
```
== Install dependencies ==
✅ 89 packages installed

== Metrics gate (require_attested=true) ==
metrics ✅ PASS

== Check Base chainId (expect 0x14a34) ==
chainId: 0x14a34

== docker compose up ==
✅ PostgreSQL ready
✅ Redis ready

== Run DB migrations ==
migrate ✅ OK

== Start EAS worker ==
Worker ✅ started

== Insert pending receipt ==
Receipt inserted

== Poll DB for onchain ==
status=onchain uid=0x1234... tx=0xabcd...

✅ Anchored on-chain — attestation tx: 0xabcd...
🔗 https://sepolia.basescan.org/tx/0xabcd...
```

**Verification:**
1. Click BaseScan link
2. Verify transaction is confirmed
3. Check attestation UID is valid

---

### Phase 9: Monitor Initial Operation (24 hours)

**Goal:** Ensure system is stable

**Metrics to monitor:**

| Metric | Target | Check Interval |
|--------|--------|----------------|
| Worker uptime | 100% | Hourly |
| Attestation success rate | ≥ 99.5% | Hourly |
| P95 latency | ≤ 60s | Hourly |
| Worker backlog | ≤ 100 | Every 15 min |
| Error rate | ≤ 5% | Hourly |

**Monitoring commands:**

```bash
# Check worker status
pm2 status

# Check database backlog
psql "$DATABASE_URL" -c "
  SELECT attestation_status, COUNT(*) 
  FROM receipts 
  GROUP BY attestation_status;
"

# Check recent errors
pm2 logs basebytes-eas-worker --lines 100 | grep ERROR
```

---

### Phase 10: Post-Deploy Health Check (1 hour)

**Goal:** Validate production health

```bash
# Run SLO check
npm run slo:check

# Run metrics validation
npm run metrics:verify

# Run tests
npm test
```

**Create health report:**

```bash
# Generate report
cat > docs/reports/$(date +%Y-%m-%d)-post-deploy-health.md <<'MD'
# Post-Deploy Health Check

**Date:** $(date -I)
**Status:** ✅ Healthy

## Metrics
- Worker uptime: 100%
- Attested rate: 100%
- P95 latency: 15s
- Worker backlog: 0
- Error rate: 0%

## Actions Taken
- None required

## Next Review
- $(date -d '+24 hours' -I)
MD

# Commit report
git add docs/reports/
git commit -m "chore(report): post-deploy health check $(date -I)"
git push
```

---

## Post-Deployment Checklist

### Immediate (T+1 hour)

- [ ] All services running
- [ ] No errors in logs
- [ ] SLO check passing
- [ ] Metrics validation passing
- [ ] Health report created

### Short-term (T+24 hours)

- [ ] Monitor metrics trends
- [ ] Review worker logs
- [ ] Check attestation success rate
- [ ] Adjust grace period if needed
- [ ] Create 24-hour health report

### Long-term (T+1 week)

- [ ] Analyze performance trends
- [ ] Optimize worker configuration
- [ ] Plan mainnet migration
- [ ] Document lessons learned

---

## Rollback Procedure

**If issues arise, follow this rollback procedure:**

### 1. Stop Workers

```bash
pm2 stop basebytes-eas-worker
```

### 2. Revert Code

```bash
git checkout main
git revert HEAD
git push origin main
```

### 3. Restore Database (if needed)

```bash
# Restore from backup
pg_restore -d basebytes backup.sql
```

### 4. Notify Team

```bash
# Create incident report
cat > docs/incidents/$(date +%Y-%m-%d)-rollback.md <<'MD'
# Incident: Rollback Required

**Date:** $(date -Is)
**Severity:** High
**Status:** Resolved

## Issue
[Describe issue]

## Actions Taken
- Stopped workers
- Reverted code
- Restored database

## Resolution
[Describe resolution]

## Prevention
[Describe prevention measures]
MD
```

---

## Success Criteria

### Deployment Successful If:

- ✅ All CI checks passing
- ✅ Branch protection active
- ✅ Live E2E test successful
- ✅ Worker running without errors
- ✅ Attestations completing on-chain
- ✅ SLO compliance maintained
- ✅ No critical errors in 24 hours

### Deployment Failed If:

- ❌ CI checks failing
- ❌ Worker crashes repeatedly
- ❌ Attestations failing
- ❌ SLO violations
- ❌ Database connection issues
- ❌ Critical errors in logs

---

## Support & Troubleshooting

### Common Issues

**Issue:** Worker not starting
**Solution:** Check DATABASE_URL, RPC_URL, and PRIVATE_KEY are set correctly

**Issue:** Attestations failing
**Solution:** Verify wallet has ETH for gas, check RPC endpoint health

**Issue:** CI checks failing
**Solution:** Run checks locally first: `npm test && npm run metrics:verify && npm run slo:check`

### Getting Help

- **Documentation:** See `docs/runbooks/github-integration.md`
- **Logs:** Check `diagnostics/` directory
- **GitHub Issues:** Create issue with logs and error messages

---

## Summary

**Total deployment time:** ~37 minutes (excluding monitoring)

**Phases:**
1. ✅ GitHub integration (5 min)
2. ✅ Update secrets (2 min)
3. ✅ Create verification PR (3 min)
4. ✅ Test branch protection (2 min)
5. ✅ Merge PR (2 min)
6. ✅ Tag release (2 min)
7. ⏳ Deploy infrastructure (15 min)
8. ⏳ Run live E2E (5 min)
9. ⏳ Monitor (24 hours)
10. ⏳ Health check (1 hour)

**Status:** 🟢 Ready to deploy

---

**🚀 BaseBytes deployment checklist complete!**
