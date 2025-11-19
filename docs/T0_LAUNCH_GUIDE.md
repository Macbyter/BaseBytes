# T+0 Testnet Launch Guide

This guide walks through the complete T+0 testnet launch process for BaseBytes v0.1-testnet.

## Prerequisites

- [ ] Node.js v22+ installed
- [ ] PostgreSQL database provisioned
- [ ] Redis instance available
- [ ] Base Sepolia RPC access
- [ ] Attester wallet with ETH for gas
- [ ] Domain names configured (api.basebytes.org, www.basebytes.org)
- [ ] Vercel account for web deployment

## Phase 1: Environment Setup

### 1.1 Configure Secrets

Create `.env.production` file with the following secrets:

```bash
# API Authentication
MINI_API_KEY=********  # Generate with: openssl rand -hex 32

# CORS Configuration
ALLOWED_ORIGINS=https://www.basebytes.org,https://app.basebytes.org

# Database
DB_PASSWORD=********  # Strong password
DATABASE_URL=postgres://user:${DB_PASSWORD}@host:5432/basebytes?sslmode=verify-full
PGSSLMODE=verify-full

# Redis
REDIS_PASSWORD=********  # Strong password
REDIS_URL=redis://:${REDIS_PASSWORD}@host:6379

# Blockchain
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
ATTESTER_PRIVATE_KEY=0x********  # Wallet private key with ETH for gas

# Smart Contracts
ROUTER_ADDRESS=0xF0a998d1cA93def52e2eA9929a20fEe8a644551c
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
EAS_SCHEMA_UID=0x********  # Register schema first

# Anchor Configuration
ANCHOR_TIME_UTC=10:00

# Security
LOG_REDACT=on
NODE_ENV=production
```

### 1.2 Rotate Secrets (if needed)

If any secrets were previously exposed:

```bash
# Generate new API key
openssl rand -hex 32

# Generate new database password
openssl rand -base64 32

# Generate new Redis password
openssl rand -base64 32

# Update all .env files and restart services
```

### 1.3 Verify Secrets

```bash
# Check that no secrets are in git
git grep -E '(MINI_API_KEY|DB_PASSWORD|PRIVATE_KEY)' || echo "✅ No secrets found"

# Verify .gitignore includes .env files
grep -q '\.env' .gitignore && echo "✅ .env files ignored"
```

## Phase 2: Database Setup

### 2.1 Run Migrations

```bash
# Install dependencies
npm ci

# Run database migrations
DATABASE_URL="postgres://..." npm run migrate

# Verify tables created
psql "$DATABASE_URL" -c "\dt"
```

Expected tables:
- `payments`
- `receipts`
- `anchors`
- `skus`
- `api_logs` (optional)

### 2.2 Seed SKUs

```bash
# Create initial SKU data
psql "$DATABASE_URL" <<EOF
INSERT INTO skus (id, name, description, price_usdc, units, rights, active)
VALUES 
  ('rag-basic', 'RAG Basic', 'Basic RAG-enhanced AI query', 0.10, 1, 'single-use, non-transferable, 24h validity', true),
  ('rag-premium', 'RAG Premium', 'Premium RAG with extended context', 0.25, 1, 'single-use, non-transferable, 48h validity', true),
  ('data-stream', 'Data Stream', 'Real-time data stream access', 1.00, 100, 'streaming, 1-hour session', true);
EOF
```

## Phase 3: Deploy Services

### 3.1 Start Infrastructure

```bash
# Start with secure docker-compose
docker-compose -f docker-compose.secure.yml up -d

# Verify services running
docker-compose -f docker-compose.secure.yml ps
```

### 3.2 Start API Server

```bash
# Start API server
PORT=3000 npm run server:start

# Verify health
curl http://localhost:3000/status
```

Expected response:
```json
{
  "status": "operational",
  "timestamp": "2025-11-19T18:00:00.000Z",
  "metrics": { ... },
  "version": "0.1-testnet"
}
```

### 3.3 Start Workers

```bash
# Terminal 1: Payment Indexer
DATABASE_URL="..." BASE_SEPOLIA_RPC_URL="..." npm run worker:indexer

# Terminal 2: EAS Attester
DATABASE_URL="..." ATTESTER_PRIVATE_KEY="..." npm run worker:eas

# Terminal 3: Anchor Worker (or use cron)
# For cron: 0 10 * * * cd /path/to/BaseBytes && npm run worker:anchor
DATABASE_URL="..." ATTESTER_PRIVATE_KEY="..." npm run worker:anchor
```

## Phase 4: Acceptance Testing

### 4.1 Run x402 Acceptance Test

```bash
export API_URL=http://localhost:3000
export X402_API_KEY="your_mini_api_key"

bash audit/scripts/x402-acceptance.sh
```

Expected output:
```
🧪 x402 Acceptance Test
=======================
Test 1: Unpaid request → 402 Payment Required
✅ Got 402 Payment Required
✅ 402 payload valid (network, asset:USDC-US, payTo, amount, memo)

Test 2: Paid request → 200 NDJSON
✅ Got 200 OK
✅ NDJSON output valid
First line: {"type":"chunk","content":"..."}

✅ x402 Acceptance: PASSED
```

### 4.2 Run Indexer Acceptance Test

```bash
export DATABASE_URL="postgres://..."
export BASE_SEPOLIA_RPC="https://sepolia.base.org"

bash audit/scripts/indexer-acceptance.sh
```

### 4.3 Run EAS Acceptance Test

```bash
export DATABASE_URL="postgres://..."
export BASE_SEPOLIA_RPC="https://sepolia.base.org"
export ATTESTER_PRIVATE_KEY="0x..."

bash audit/scripts/eas-acceptance.sh
```

### 4.4 Run Anchor Acceptance Test

```bash
export DATABASE_URL="postgres://..."
export BASE_SEPOLIA_RPC="https://sepolia.base.org"

bash audit/scripts/anchor-acceptance.sh
```

### 4.5 Verify On-Chain

Check that payments are visible on BaseScan:

```bash
# Get recent payment
psql "$DATABASE_URL" -c "SELECT tx_hash FROM payments ORDER BY created_at DESC LIMIT 1;"

# Open in browser
open "https://sepolia.basescan.org/tx/{tx_hash}"
```

Verify:
- ✅ Transaction confirmed
- ✅ USDC transfer to router address
- ✅ Correct amount and memo

Check EAS attestation:

```bash
# Get recent attestation
psql "$DATABASE_URL" -c "SELECT attestation_tx, attestation_uid FROM receipts WHERE attestation_status='onchain' ORDER BY attestation_confirmed_at DESC LIMIT 1;"

# Open in browser
open "https://sepolia.basescan.org/tx/{attestation_tx}"
```

Verify:
- ✅ EAS attestation created
- ✅ Schema matches expected UID
- ✅ Data includes SKU, amount, units, rights

## Phase 5: Web Deployment

### 5.1 Configure Vercel Project

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
cd apps/web
vercel link
```

### 5.2 Set Environment Variables

```bash
vercel env add NEXT_PUBLIC_API_BASE
# Value: https://api.basebytes.org

vercel env add NEXT_PUBLIC_WC_PROJECT_ID
# Value: your_walletconnect_project_id

vercel env add NEXT_PUBLIC_RPC_BASE
# Value: https://base.llamarpc.com

vercel env add NEXT_PUBLIC_RPC_BASE_SEPOLIA
# Value: https://sepolia.base.org
```

### 5.3 Deploy

```bash
# Deploy to production
vercel --prod

# Verify deployment
curl https://www.basebytes.org
```

### 5.4 Smoke Test Web App

Open https://www.basebytes.org and verify:

- ✅ Wallets menu shows Coinbase/MetaMask/Rabby/WalletConnect
- ✅ ChainGuard allows Base/Base-Sepolia selection
- ✅ Live Demo works in DRY RUN mode
- ✅ Live Demo works in REAL mode (with wallet connected)
- ✅ Receipt shows on BaseScan after purchase

## Phase 6: Partner Onboarding

### 6.1 Prepare Materials

Share with design partners:
- [ ] https://www.basebytes.org (live demo)
- [ ] [INTEGRATION.md](../INTEGRATION.md) (integration guide)
- [ ] [PARTNER_KICKOFF_PACK.md](../PARTNER_KICKOFF_PACK.md) (kickoff materials)
- [ ] Release notes (GitHub release)
- [ ] Testnet router address: `0xF0a998d1cA93def52e2eA9929a20fEe8a644551c`
- [ ] 3-step curl examples (from kickoff pack)

### 6.2 Create Partner API Keys

For each partner:

```bash
# Generate unique API key
PARTNER_KEY=$(openssl rand -hex 32)
echo "Partner API Key: $PARTNER_KEY"

# Store securely and share via secure channel
```

### 6.3 Whitelist Partner Domains

Add partner domains to `ALLOWED_ORIGINS`:

```bash
# Update .env.production
ALLOWED_ORIGINS=https://www.basebytes.org,https://app.basebytes.org,https://partner1.com,https://partner2.com

# Restart API server
pm2 restart api-server
```

### 6.4 Verify Partner Integration

For each partner:

```bash
# Test from partner domain
curl https://api.basebytes.org/ai/query \
  -H "Origin: https://partner1.com" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${PARTNER_KEY}" \
  -d '{"query":"test","sku":"rag-basic"}'
```

Verify:
- ✅ CORS headers allow partner domain
- ✅ API key authenticates successfully
- ✅ Response includes receipt with EAS UID

### 6.5 Set Up Support Channel

Create dedicated Slack/Telegram channel for each partner:

- Pin important links (docs, status page, BaseScan)
- Define SLA: p95 entitlement <1s; anchor @10:00 UTC; support <4h
- Assign support contact

## Phase 7: Monitoring & Alerts

### 7.1 Set Up Status Monitoring

```bash
# Add status endpoint to monitoring
curl https://api.basebytes.org/status

# Set up alerts for:
# - entitlement_p95_ms > 1000
# - receipt_coverage_24h < 0.995
# - api_uptime_7d < 99.0
# - last_anchor_at > 25 hours ago
```

### 7.2 Configure Log Aggregation

```bash
# Ship logs to aggregation service (e.g., Datadog, LogDNA)
# Ensure LOG_REDACT=on to avoid logging secrets
```

### 7.3 Set Up Prometheus (Optional)

```bash
# Install Prometheus exporter
npm install prom-client

# Instrument metrics:
# - api_p95_latency
# - x402_conversion_rate (402→200)
# - indexer_lag_seconds
# - anchor_success_rate
```

## Phase 8: GitHub Configuration

### 8.1 Enable Security Features

1. Go to **Settings** → **Code security and analysis**
2. Enable:
   - [ ] Secret scanning
   - [ ] Push protection
   - [ ] Dependabot alerts
   - [ ] Dependabot security updates
   - [ ] Code scanning (CodeQL)

### 8.2 Configure Branch Protection

```bash
# Run branch protection setup script
bash scripts/setup-branch-protection.sh
```

Verify in GitHub UI:
- [ ] Required status checks enabled
- [ ] Code owner review required
- [ ] Conversation resolution required
- [ ] Force push disabled

### 8.3 Add Repository Secrets

Go to **Settings** → **Secrets and variables** → **Actions**

Add secrets:
- [ ] `API_BASE` - https://api.basebytes.org
- [ ] `MINI_API_KEY` - Production API key
- [ ] `DATABASE_URL` - Production database URL
- [ ] `BASE_SEPOLIA_RPC_URL` - RPC endpoint
- [ ] `ATTESTER_PRIVATE_KEY` - Attester wallet key

### 8.4 Test Workflows

```bash
# Trigger nightly E2E manually
gh workflow run nightly-e2e.yml

# Check run status
gh run list --workflow=nightly-e2e.yml

# View logs
gh run view <run-id> --log
```

## Phase 9: Create Release

### 9.1 Tag Release

```bash
# Create and push tag
git tag -a v0.1-testnet -m "T+0 Testnet Launch"
git push origin v0.1-testnet
```

### 9.2 Verify Release Workflow

The release workflow will automatically:
- Run all acceptance tests
- Collect test results
- Extract anchor information
- Create GitHub release with artifacts

Check release at: https://github.com/Macbyter/BaseBytes/releases/tag/v0.1-testnet

### 9.3 Announce Release

Share release notes with:
- [ ] Design partners
- [ ] Community channels
- [ ] Social media
- [ ] Documentation sites

## Phase 10: Post-Launch Checklist

### Immediate (T+0)

- [ ] All acceptance tests passing
- [ ] Web app accessible and functional
- [ ] Partners notified and onboarded
- [ ] Support channels active
- [ ] Monitoring and alerts configured

### Day 1 (T+1)

- [ ] Review first 24h metrics
- [ ] Check for any errors or alerts
- [ ] Verify first anchor executed at 10:00 UTC
- [ ] Confirm partner integrations working
- [ ] Address any support requests

### Week 1 (T+7)

- [ ] Review weekly metrics
- [ ] Analyze p95 latency trends
- [ ] Check receipt coverage rate
- [ ] Gather partner feedback
- [ ] Plan improvements for next sprint

### 14-Day Review (T+14)

- [ ] Complete "Prove It" plan metrics
- [ ] Publish status widget on homepage
- [ ] Review Prometheus dashboards
- [ ] Conduct partner success review
- [ ] Plan next phase features

## Troubleshooting

### API Server Won't Start

```bash
# Check logs
pm2 logs api-server

# Common issues:
# - DATABASE_URL not set or invalid
# - Port 3000 already in use
# - Missing environment variables
```

### Workers Not Processing

```bash
# Check worker logs
pm2 logs worker-indexer
pm2 logs worker-eas
pm2 logs worker-anchor

# Common issues:
# - RPC connection failed
# - Database connection failed
# - Insufficient gas for transactions
# - Private key not set or invalid
```

### Acceptance Tests Failing

```bash
# Run with verbose output
bash -x audit/scripts/x402-acceptance.sh

# Check:
# - API server running and accessible
# - Database contains test data
# - Environment variables set correctly
# - Network connectivity to RPC
```

### EAS Attestations Not Appearing

```bash
# Check attester wallet balance
cast balance $ATTESTER_ADDRESS --rpc-url $BASE_SEPOLIA_RPC

# Check pending receipts
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM receipts WHERE attestation_status='pending';"

# Manually trigger attester
npm run worker:eas -- --batch-size 1

# Check for errors in logs
```

### Anchor Not Running

```bash
# Check cron job
crontab -l | grep anchor

# Manually trigger anchor
npm run worker:anchor

# Check anchors table
psql "$DATABASE_URL" -c "SELECT * FROM anchors ORDER BY created_at DESC LIMIT 5;"
```

## Support

For launch support:
- **GitHub Issues**: https://github.com/Macbyter/BaseBytes/issues
- **Documentation**: https://github.com/Macbyter/BaseBytes/tree/main/docs
- **Status Page**: https://api.basebytes.org/status

---

**Launch Date**: November 19, 2025  
**Version**: v0.1-testnet  
**Network**: Base Sepolia  
**Status**: 🚀 Ready to Launch
