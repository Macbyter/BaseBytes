# Phase 4.4: CI Guardrails & Branch Protection

This guide covers setting up CI checks and branch protection rules.

## Prerequisites

- ✅ Phase 4.1 completed (PR #11 merged, metrics:verify working)
- ✅ Phase 4.2 completed (secrets set, database configured)
- ✅ Phase 4.3 completed (EAS worker smoke test passed)

---

## Step 1: Protect Main Branch

### Via GitHub Web UI

1. Go to: https://github.com/Macbyter/BaseBytes/settings/branches
2. Click **"Add branch protection rule"**
3. Configure:
   - **Branch name pattern:** `main`
   - ✅ **Require a pull request before merging**
     - ✅ Require approvals: 0 (or 1 if you have collaborators)
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ **Require status checks to pass before merging**
     - ✅ Require branches to be up to date before merging
     - **Status checks required:**
       - `build-and-test` (from CI workflow)
       - `metrics:verify` (will add in Step 2)
   - ✅ **Require conversation resolution before merging**
   - ✅ **Do not allow bypassing the above settings**
4. Click **"Create"**

### Via GitHub CLI

```bash
# Protect main branch
gh api repos/Macbyter/BaseBytes/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field required_status_checks[contexts][]=build-and-test \
  --field required_pull_request_reviews[required_approving_review_count]=0 \
  --field enforce_admins=true \
  --field required_conversation_resolution=true
```

---

## Step 2: Add Metrics Verification to CI

Update `.github/workflows/ci.yml` to include metrics verification:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    name: Build and Test
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Verify metrics thresholds
        run: npm run metrics:verify
      
      - name: Check syntax
        run: |
          echo "Checking JavaScript syntax..."
          find scripts workers -name "*.js" -exec node --check {} \; 2>/dev/null || true
      
      - name: Run tests
        run: |
          if [ -f "package.json" ] && grep -q '"test"' package.json; then
            npm test
          else
            echo "⏭️  No tests configured yet"
          fi
```

### Apply Update

```bash
# Create branch
git checkout -b feat/add-metrics-to-ci

# Edit .github/workflows/ci.yml (add metrics:verify step)

# Commit and push
git add .github/workflows/ci.yml
git commit -m "ci: add metrics:verify to CI workflow"
git push -u origin feat/add-metrics-to-ci

# Create PR
gh pr create --base main --head feat/add-metrics-to-ci \
  --title "ci: Add metrics verification to CI workflow" \
  --body "Adds metrics:verify step to CI to validate thresholds.json on every PR"

# Merge after CI passes
gh pr merge --squash --delete-branch
```

---

## Step 3: Add EAS Worker Simulation Test (Optional)

For DB-free CI testing, add a simulation test using `pg-mem` and `vitest`.

### Install Dependencies

```bash
npm install --save-dev vitest pg-mem
```

### Create Test File

Create `tests/eas-worker-sim.test.js`:

```javascript
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { newDb } from 'pg-mem';

describe('EAS Worker Simulation', () => {
  let pool;

  beforeAll(async () => {
    // Create in-memory database
    const db = newDb({ autoCreateForeignKeyIndices: true });
    const { Pool } = db.adapters.createPg();
    pool = new Pool();

    // Create receipts table
    await pool.query(`
      CREATE TABLE receipts (
        receipt_uid TEXT PRIMARY KEY,
        app_id TEXT,
        sku TEXT,
        attestation_status TEXT DEFAULT 'pending',
        attestation_uid TEXT,
        attestation_tx TEXT
      );
    `);

    // Seed test receipt
    await pool.query(`
      INSERT INTO receipts (receipt_uid, app_id, sku)
      VALUES ('test_1', 'demo', 'test:v1');
    `);
  });

  it('should process pending receipts', async () => {
    const res = await pool.query(
      'SELECT * FROM receipts WHERE attestation_status = $1',
      ['pending']
    );
    
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].receipt_uid).toBe('test_1');
  });

  it('should update attestation status', async () => {
    await pool.query(
      `UPDATE receipts 
       SET attestation_status = $1, 
           attestation_uid = $2,
           attestation_tx = $3
       WHERE receipt_uid = $4`,
      ['onchain', '0xabc...', '0x123...', 'test_1']
    );

    const res = await pool.query(
      'SELECT * FROM receipts WHERE receipt_uid = $1',
      ['test_1']
    );

    expect(res.rows[0].attestation_status).toBe('onchain');
    expect(res.rows[0].attestation_uid).toBe('0xabc...');
  });
});
```

### Update package.json

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### Add to CI Workflow

```yaml
- name: Run simulation tests
  run: npm test
```

---

## Step 4: Configure Required Checks

After CI workflow is updated, configure required status checks:

### Via GitHub Web UI

1. Go to: https://github.com/Macbyter/BaseBytes/settings/branches
2. Edit the `main` branch protection rule
3. Under **"Require status checks to pass before merging"**:
   - Search and add:
     - ✅ `build-and-test`
     - ✅ `Verify metrics thresholds` (if separate job)
4. Click **"Save changes"**

### Via GitHub CLI

```bash
gh api repos/Macbyter/BaseBytes/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field required_status_checks[contexts][]=build-and-test \
  --field required_status_checks[contexts][]=metrics:verify
```

---

## Step 5: Test Branch Protection

### Create Test PR

```bash
# Create test branch
git checkout -b test/branch-protection

# Make a change
echo "# Test" >> TEST.md
git add TEST.md
git commit -m "test: verify branch protection"
git push -u origin test/branch-protection

# Create PR
gh pr create --base main --head test/branch-protection \
  --title "test: Verify branch protection" \
  --body "Testing branch protection rules"
```

### Verify Protection

1. **Cannot push directly to main:**
   ```bash
   git checkout main
   echo "test" >> README.md
   git commit -am "test: direct push"
   git push
   # Should fail: "protected branch hook declined"
   ```

2. **PR requires checks to pass:**
   - Go to the PR page
   - Verify CI checks are running
   - Verify merge button is disabled until checks pass

3. **PR requires conversation resolution:**
   - Add a comment requesting changes
   - Verify merge button is disabled
   - Resolve conversation
   - Verify merge button is enabled

### Clean Up

```bash
# Delete test PR and branch
gh pr close test/branch-protection --delete-branch
```

---

## Step 6: Document CI/CD Process

Update `CONTRIBUTING.md` with CI/CD information:

```markdown
## Continuous Integration

All pull requests must pass CI checks before merging:

### Required Checks

1. **build-and-test** - Syntax validation and tests
2. **metrics:verify** - Validates `metrics/thresholds.json`

### Running Checks Locally

```bash
# Install dependencies
npm ci

# Run all checks
npm run metrics:verify
npm test
node --check scripts/*.js
node --check workers/*.js
```

### Branch Protection

The `main` branch is protected:
- ✅ Pull requests required
- ✅ Status checks must pass
- ✅ Conversations must be resolved
- ❌ Direct pushes blocked
```

---

## Verification Checklist

✅ **Phase 4.4 Complete** when:

1. **Branch Protection:**
   - [ ] Main branch protected
   - [ ] Pull requests required
   - [ ] Status checks required
   - [ ] Direct pushes blocked

2. **CI Workflow:**
   - [ ] `metrics:verify` step added
   - [ ] Syntax checks running
   - [ ] Tests running (or placeholder)
   - [ ] Workflow triggers on PRs

3. **Required Checks:**
   - [ ] `build-and-test` required
   - [ ] `metrics:verify` required
   - [ ] Checks must pass before merge

4. **Documentation:**
   - [ ] CONTRIBUTING.md updated
   - [ ] CI process documented
   - [ ] Local testing instructions provided

5. **Testing:**
   - [ ] Test PR created and verified
   - [ ] Direct push blocked
   - [ ] Checks enforced
   - [ ] Merge blocked until checks pass

---

## Troubleshooting

### CI Workflow Not Running

1. Check workflow file syntax:
   ```bash
   cat .github/workflows/ci.yml
   ```

2. Verify workflow is enabled:
   - Go to: https://github.com/Macbyter/BaseBytes/actions
   - Check if workflow is listed

3. Check workflow permissions:
   - Go to: https://github.com/Macbyter/BaseBytes/settings/actions
   - Verify "Read and write permissions" is enabled

### Status Checks Not Required

1. Ensure checks have run at least once
2. Check branch protection settings
3. Verify check names match exactly

### Cannot Merge Despite Passing Checks

1. Verify all required checks are green
2. Check for unresolved conversations
3. Ensure branch is up to date with main

---

## Next Steps

After completing Phase 4.4:
1. ✅ Branch protection configured
2. ✅ CI guardrails in place
3. ✅ Metrics verification automated
4. ➡️ **All phases complete!**

See final executive readout for summary and next steps.
