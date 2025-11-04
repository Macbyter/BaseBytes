# Branch Protection Configuration

This guide explains how to configure branch protection rules for the `main` branch to enforce quality gates and prevent accidental breaking changes.

---

## Quick Setup (GitHub UI)

1. Go to: **Settings** → **Branches** → **Add rule**
2. Branch name pattern: `main`
3. Enable the following settings:

### Required Settings

✅ **Require a pull request before merging**
- Require approvals: 1 (or 0 for solo projects)
- Dismiss stale pull request approvals when new commits are pushed

✅ **Require status checks to pass before merging**
- Require branches to be up to date before merging
- Status checks that are required:
  - `Build and Test` (from CI workflow)
  - `Run EAS worker simulation tests`
  - `Validate metrics thresholds`

✅ **Require conversation resolution before merging**

✅ **Do not allow bypassing the above settings**
- Applies to administrators (recommended for production)

### Optional Settings

⚪ **Require signed commits** (recommended for security)

⚪ **Require linear history** (prevents merge commits)

⚪ **Include administrators** (enforce rules for everyone)

---

## CLI Setup (via GitHub API)

You can also configure branch protection using the GitHub CLI or API:

```bash
# Using GitHub CLI
gh api repos/Macbyter/BaseBytes/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field required_status_checks[contexts][]=Build and Test \
  --field required_pull_request_reviews[required_approving_review_count]=1 \
  --field enforce_admins=true \
  --field required_conversation_resolution=true
```

---

## Required Status Checks

The following CI checks must pass before merging to `main`:

### 1. Build and Test
- **Workflow:** `.github/workflows/ci.yml`
- **Checks:**
  - JavaScript syntax validation
  - EAS worker simulation tests (11 tests)
  - Metrics threshold validation

### 2. Run EAS worker simulation tests
- **Test File:** `tests/eas-worker-sim.test.js`
- **Coverage:**
  - Receipt creation and status transitions
  - Attestation lifecycle (pending → attesting → onchain)
  - Error handling and validation
  - Chain ID enforcement (Base Sepolia 0x14a34)
  - Metrics thresholds (min_confidence: 0.85)
  - Grace period simulation (300 seconds)
  - Batch processing

### 3. Validate metrics thresholds
- **Script:** `scripts/verify-metrics.js`
- **Validates:**
  - `require_attested: true`
  - `min_confidence: 0.85`
  - `chain_id: "0x14a34"`
  - `grace_period_seconds: 300`
  - EAS contract addresses

---

## Testing Branch Protection

After configuring, test the protection rules:

### 1. Create a test branch
```bash
git checkout -b test/branch-protection
echo "# Test" >> TEST.md
git add TEST.md
git commit -m "test: verify branch protection"
git push -u origin test/branch-protection
```

### 2. Create a PR
```bash
gh pr create --base main --head test/branch-protection \
  --title "Test: Branch Protection" \
  --body "Testing branch protection rules"
```

### 3. Verify checks run
- Go to the PR page
- Verify "Build and Test" check appears
- Verify all required checks must pass
- Try merging before checks complete (should be blocked)

### 4. Clean up
```bash
gh pr close <PR_NUMBER>
git checkout main
git branch -D test/branch-protection
git push origin --delete test/branch-protection
```

---

## Troubleshooting

### Status checks not appearing

**Problem:** Required status checks don't show up in PR

**Solution:**
1. Ensure CI workflow has run at least once on `main` branch
2. Check workflow file syntax: `.github/workflows/ci.yml`
3. Verify workflow is enabled: **Settings** → **Actions** → **General**

### Can't merge even though checks passed

**Problem:** Merge button is disabled despite green checks

**Possible causes:**
1. Branch is not up to date with main → Click "Update branch"
2. Required review not provided → Request review from teammate
3. Conversations not resolved → Resolve all review comments
4. Administrator bypass disabled → Temporarily disable if needed

### Tests failing in CI but passing locally

**Problem:** `npm test` passes locally but fails in CI

**Common issues:**
1. Missing dependencies in `package.json`
2. Different Node.js versions (CI uses Node 20)
3. Environment variables not set in CI
4. File paths are case-sensitive in CI (Linux) but not locally (macOS/Windows)

**Solution:**
```bash
# Test with same Node version as CI
nvm use 20
npm ci  # Use clean install
npm test
```

---

## Maintenance

### Updating required checks

When adding new CI checks:

1. Update `.github/workflows/ci.yml` with new job/step
2. Push to `main` and let workflow run once
3. Update branch protection rules to include new check
4. Test with a PR to verify

### Temporarily disabling protection

For emergency hotfixes:

1. Go to **Settings** → **Branches** → `main` rule
2. Click **Edit**
3. Uncheck "Include administrators" (if you're an admin)
4. Make your hotfix
5. **Re-enable protection immediately after**

---

## Best Practices

### For Solo Projects
- Require 0 approvals (you can self-merge)
- Keep all other protections enabled
- Use PRs even when working alone (good habit)

### For Team Projects
- Require 1+ approvals
- Enable "Require conversation resolution"
- Enable "Include administrators"
- Use CODEOWNERS file for automatic reviewers

### For Production
- Require 2+ approvals for critical changes
- Enable signed commits
- Enable linear history
- Use deployment protection rules
- Set up status checks for staging deployment

---

## Example CODEOWNERS File

Create `.github/CODEOWNERS` to auto-assign reviewers:

```
# Default owner for everything
* @Macbyter

# Require review for sensitive files
/scripts/*.js @Macbyter
/workers/*.js @Macbyter
/migrations/*.sql @Macbyter
/.github/workflows/*.yml @Macbyter
/metrics/thresholds.json @Macbyter
```

---

## Verification Checklist

After setup, verify:

- [ ] Branch protection rule exists for `main`
- [ ] Pull requests are required
- [ ] Status checks are required
- [ ] "Build and Test" check is listed
- [ ] "Run EAS worker simulation tests" check is listed
- [ ] "Validate metrics thresholds" check is listed
- [ ] Conversation resolution is required
- [ ] Test PR shows all checks running
- [ ] Merge is blocked until checks pass
- [ ] Can successfully merge after checks pass

---

## Related Documentation

- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Required Status Checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
- [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)

---

## Summary

Branch protection ensures:
- ✅ All changes go through PRs
- ✅ Tests must pass before merging
- ✅ Metrics thresholds are validated
- ✅ Code quality is maintained
- ✅ Accidental breaking changes are prevented

**Next steps:**
1. Configure branch protection via GitHub UI
2. Test with a sample PR
3. Update CODEOWNERS if working with a team
4. Document any custom rules in this file
