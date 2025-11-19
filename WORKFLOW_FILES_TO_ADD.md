# GitHub Workflow Files to Add Manually

Due to GitHub App permissions restrictions, the following workflow files need to be added manually or via a separate commit with appropriate permissions.

## Files to Create

### 1. `.github/workflows/no-token.yml`

```yaml
name: No Token Terms
on: [pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Scan for prohibited token terms
        run: |
          ! git grep -nE '\b(XPR|XPT|tokenomics|governance token|utility token)\b' -- \
            ':!:**/node_modules/**' || (echo "❌ Token terms found"; exit 1)
```

### 2. `.github/workflows/nightly-e2e.yml`

```yaml
name: Nightly E2E
on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:
jobs:
  e2e:
    runs-on: ubuntu-latest
    env:
      API_URL: ${{ secrets.API_BASE }}
      X402_API_KEY: ${{ secrets.MINI_API_KEY }}
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      BASE_SEPOLIA_RPC: ${{ secrets.BASE_SEPOLIA_RPC_URL }}
      ATTESTER_PRIVATE_KEY: ${{ secrets.ATTESTER_PRIVATE_KEY }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
      - name: Install dependencies
        run: npm ci
      - name: x402 Acceptance Test
        run: bash audit/scripts/x402-acceptance.sh
      - name: Indexer Acceptance Test
        run: bash audit/scripts/indexer-acceptance.sh
      - name: EAS Acceptance Test
        run: bash audit/scripts/eas-acceptance.sh
      - name: Anchor Acceptance Test
        run: bash audit/scripts/anchor-acceptance.sh
```

### 3. `.github/workflows/release.yml`

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    env:
      API_URL: ${{ secrets.API_BASE }}
      X402_API_KEY: ${{ secrets.MINI_API_KEY }}
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      BASE_SEPOLIA_RPC: ${{ secrets.BASE_SEPOLIA_RPC_URL }}
      ATTESTER_PRIVATE_KEY: ${{ secrets.ATTESTER_PRIVATE_KEY }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
      - name: Install dependencies
        run: npm ci
      
      - name: Run acceptance tests
        id: acceptance
        run: |
          echo "## Acceptance Test Results" > acceptance-results.md
          echo "" >> acceptance-results.md
          
          echo "### x402 Payment Flow" >> acceptance-results.md
          bash audit/scripts/x402-acceptance.sh 2>&1 | tee x402.log
          echo '```' >> acceptance-results.md
          cat x402.log >> acceptance-results.md
          echo '```' >> acceptance-results.md
          echo "" >> acceptance-results.md
          
          echo "### Payment Indexer" >> acceptance-results.md
          bash audit/scripts/indexer-acceptance.sh 2>&1 | tee indexer.log
          echo '```' >> acceptance-results.md
          cat indexer.log >> acceptance-results.md
          echo '```' >> acceptance-results.md
          echo "" >> acceptance-results.md
          
          echo "### EAS Attestations" >> acceptance-results.md
          bash audit/scripts/eas-acceptance.sh 2>&1 | tee eas.log
          echo '```' >> acceptance-results.md
          cat eas.log >> acceptance-results.md
          echo '```' >> acceptance-results.md
          echo "" >> acceptance-results.md
          
          echo "### Daily Anchors" >> acceptance-results.md
          bash audit/scripts/anchor-acceptance.sh 2>&1 | tee anchor.log
          echo '```' >> acceptance-results.md
          cat anchor.log >> acceptance-results.md
          echo '```' >> acceptance-results.md
      
      - name: Get latest anchor info
        id: anchor
        run: |
          ANCHOR_INFO=$(node -e "
            const { Pool } = require('pg');
            const pool = new Pool({ connectionString: process.env.DATABASE_URL });
            pool.query('SELECT attestation_tx, attestation_uid, merkle_root FROM anchors ORDER BY created_at DESC LIMIT 1')
              .then(res => {
                if (res.rows.length > 0) {
                  const a = res.rows[0];
                  console.log(\`TX: \${a.attestation_tx || 'N/A'}\`);
                  console.log(\`UID: \${a.attestation_uid || 'N/A'}\`);
                  console.log(\`Root: \${a.merkle_root || 'N/A'}\`);
                }
                process.exit(0);
              })
              .catch(() => process.exit(0));
          " 2>/dev/null || echo "N/A")
          echo "$ANCHOR_INFO" > anchor-info.txt
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          body_path: acceptance-results.md
          files: |
            acceptance-results.md
            anchor-info.txt
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## How to Add These Files

### Option 1: Via GitHub Web UI

1. Go to your repository on GitHub
2. Navigate to `.github/workflows/`
3. Click "Add file" → "Create new file"
4. Name the file (e.g., `no-token.yml`)
5. Paste the content from above
6. Commit directly to `main` or create a new branch

### Option 2: Via Git Command Line (with appropriate permissions)

```bash
# Create the files locally
cat > .github/workflows/no-token.yml << 'EOF'
[paste content from above]
EOF

cat > .github/workflows/nightly-e2e.yml << 'EOF'
[paste content from above]
EOF

cat > .github/workflows/release.yml << 'EOF'
[paste content from above]
EOF

# Commit and push
git add .github/workflows/*.yml
git commit -m "Add GitHub workflow automation"
git push origin main
```

### Option 3: Grant Workflow Permissions to GitHub App

If you're using a GitHub App for automation:

1. Go to GitHub Settings → Developer settings → GitHub Apps
2. Select your app
3. Under "Permissions", grant "Read and write" access to "Workflows"
4. Save and reinstall the app on your repository

## After Adding Workflows

1. **Configure Required Secrets** in Settings → Secrets and variables → Actions:
   - `API_BASE`
   - `MINI_API_KEY`
   - `DATABASE_URL`
   - `BASE_SEPOLIA_RPC_URL`
   - `ATTESTER_PRIVATE_KEY`

2. **Update Branch Protection** to require the new checks:
   ```bash
   bash scripts/setup-branch-protection.sh
   ```

3. **Test Workflows**:
   ```bash
   # Trigger nightly E2E manually
   gh workflow run nightly-e2e.yml
   
   # Check status
   gh run list --workflow=nightly-e2e.yml
   ```

## Notes

- The `no-token.yml` workflow will run on every pull request
- The `nightly-e2e.yml` workflow runs daily at 3:00 AM UTC (can also be triggered manually)
- The `release.yml` workflow runs automatically when you push a tag starting with `v`

All workflows are configured to use the acceptance test scripts from `audit/scripts/`.
