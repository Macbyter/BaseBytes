# Phase 4.2: Secrets + Staging Rail Setup

This guide covers setting up secrets and the staging database for BaseBytes.

## Prerequisites

- Docker and Docker Compose installed
- GitHub repository access
- Base Sepolia RPC URL (from Alchemy, Infura, or public endpoint)
- Test private key with Base Sepolia ETH

---

## Step 1: Set Repository Secrets

### Option A: Via GitHub CLI

```bash
# Set BASE_SEPOLIA_RPC
gh secret set BASE_SEPOLIA_RPC --repo Macbyter/BaseBytes
# Paste your RPC URL when prompted

# Set ATTESTER_PRIVATE_KEY
gh secret set ATTESTER_PRIVATE_KEY --repo Macbyter/BaseBytes
# Paste your private key (0x...) when prompted

# Optional: Set ATTESTER_ADDRESS
gh secret set ATTESTER_ADDRESS --repo Macbyter/BaseBytes
# Paste the derived address when prompted
```

### Option B: Via GitHub Web UI

1. Go to: https://github.com/Macbyter/BaseBytes/settings/secrets/actions
2. Click **"New repository secret"**
3. Add each secret:
   - **Name:** `BASE_SEPOLIA_RPC`  
     **Value:** Your RPC URL (e.g., `https://base-sepolia.g.alchemy.com/v2/YOUR_API_KEY`)
   
   - **Name:** `ATTESTER_PRIVATE_KEY`  
     **Value:** Your private key (e.g., `0xda94cb336e062cde8931c5eed8e48be4faafabbd54df02ee35ed879877f267f1`)
   
   - **Name:** `ATTESTER_ADDRESS` (optional)  
     **Value:** Derived address (e.g., `0x8e2449eb4208E5AEa5572dEdf89Ba00B39f94cc8`)

### For Codespaces

If using GitHub Codespaces, also add secrets there:

1. Go to: https://github.com/settings/codespaces
2. Click **"New secret"**
3. Add the same secrets as above

---

## Step 2: Start Staging Database

### Using Docker Compose

```bash
# Start PostgreSQL and Redis
docker compose -f docker-compose.staging.yml up -d

# Check status
docker compose -f docker-compose.staging.yml ps

# View logs
docker compose -f docker-compose.staging.yml logs -f
```

Expected output:
```
✅ Container basebytes-staging-db      Running
✅ Container basebytes-staging-redis   Running
```

### Set DATABASE_URL

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/basebytes"
```

Or add to `.env` (never commit this file!):
```bash
echo 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/basebytes"' >> .env
```

---

## Step 3: Run Migrations

```bash
# Apply all migrations
npm run migrate
```

Expected output:
```
🔍 Checking database connection...
✅ Database connection successful

📦 Applying migrations...
  ▶ Applying 001_add_eas_receipt_fields.sql...
    ✅ 001_add_eas_receipt_fields.sql applied successfully

✅ All migrations applied successfully!

🔍 Verifying database schema...
✅ EAS columns verified in receipts table

🎉 Migration complete!
```

### Verify Migration

```bash
# Connect to database
psql "$DATABASE_URL"

# Check receipts table schema
\d receipts

# Should show columns:
# - attestation_status
# - attestation_tx
# - attestation_uid
# - attestation_confirmed_at
# - attestation_chain_id
# - attestation_error
```

---

## Step 4: Verify Setup

### Check Database Connection

```bash
psql "$DATABASE_URL" -c "SELECT version();"
```

### Check Redis Connection

```bash
redis-cli ping
# Should return: PONG
```

### Verify Secrets (GitHub Actions)

```bash
# List secrets (won't show values)
gh secret list --repo Macbyter/BaseBytes
```

Expected output:
```
ATTESTER_ADDRESS      Updated YYYY-MM-DD
ATTESTER_PRIVATE_KEY  Updated YYYY-MM-DD
BASE_SEPOLIA_RPC      Updated YYYY-MM-DD
```

---

## Troubleshooting

### Database Connection Failed

```bash
# Check if PostgreSQL is running
docker compose -f docker-compose.staging.yml ps

# Restart database
docker compose -f docker-compose.staging.yml restart db

# Check logs
docker compose -f docker-compose.staging.yml logs db
```

### Migration Failed

```bash
# Check DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:password@host:port/database

# Test connection manually
psql "$DATABASE_URL" -c "SELECT 1"

# Re-run migration (idempotent)
npm run migrate
```

### Secrets Not Available in Actions

1. Verify secrets are set in repository settings
2. Check workflow has correct secret names
3. Ensure workflow has `secrets: inherit` if using reusable workflows

---

## Cleanup

### Stop Staging Database

```bash
# Stop containers
docker compose -f docker-compose.staging.yml down

# Stop and remove volumes (WARNING: deletes all data!)
docker compose -f docker-compose.staging.yml down -v
```

---

## Next Steps

After completing Phase 4.2:
1. ✅ Secrets configured
2. ✅ Staging database running
3. ✅ Migrations applied
4. ➡️ Proceed to **Phase 4.3: EAS Worker Smoke Test**

See `PHASE_4_3_SMOKE_TEST.md` for next steps.
