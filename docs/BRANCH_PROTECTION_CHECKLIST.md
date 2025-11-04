# Branch Protection Checklist

**Purpose:** Turn policy into guardrails for the `main` branch  
**Timeline:** ~5 minutes  
**Last Updated:** 2025-11-04

---

## Quick Setup (GitHub UI)

1. Go to: **Settings → Branches → Add rule**
2. Branch name pattern: `main`
3. Configure settings below ↓

---

## Required Settings

### ✅ Pull Request Requirements

- [x] **Require a pull request before merging**
  - Required approvals: `1` (or `0` for solo projects)
  - Dismiss stale pull request approvals when new commits are pushed: ✅

### ✅ Status Check Requirements

- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - **Required status checks:**
    - `Build, Test, and Gate` (from CI workflow)
    - `Run tests (incl. EAS worker simulation)`
    - `Validate metrics thresholds (require_attested=true)`

### ✅ Conversation Requirements

- [x] **Require conversation resolution before merging**

### ⚙️ Optional (Recommended)

- [ ] **Require linear history** (prevents merge commits)
- [ ] **Require deployments to succeed** (if you add deployment workflows)
- [ ] **Lock branch** (only for emergencies)

---

## CLI Alternative

```bash
# Create branch protection rule via GitHub API
gh api repos/Macbyter/BaseBytes/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field 'required_status_checks[contexts][]=Build, Test, and Gate' \
  --field 'required_status_checks[contexts][]=Run tests (incl. EAS worker simulation)' \
  --field 'required_status_checks[contexts][]=Validate metrics thresholds (require_attested=true)' \
  --field required_pull_request_reviews[required_approving_review_count]=1 \
  --field required_pull_request_reviews[dismiss_stale_reviews]=true \
  --field required_conversation_resolution=true \
  --field enforce_admins=false \
  --field required_linear_history=false
```

---

## Verification Test

### 1. Create test branch

```bash
git checkout -b chore/protection-smoke
echo "# branch protection ok" >> .github/PROTECTION_SMOKE.md
git add .
git commit -m "chore: verify branch protection hooks"
git push -u origin chore/protection-smoke
```

### 2. Create PR

```bash
gh pr create \
  --base main \
  --head chore/protection-smoke \
  --title "Test: Branch Protection" \
  --body "Testing branch protection rules and required status checks"
```

### 3. Verify behavior

**Expected:**
- ✅ PR shows required status checks
- ✅ Merge button disabled until checks pass
- ✅ CI workflow runs automatically
- ✅ All checks pass (syntax, tests, metrics)
- ✅ Merge button becomes enabled
- ✅ Squash merge succeeds

**If checks fail:**
- ❌ Merge button stays disabled
- ❌ PR shows failing check details
- ❌ Must fix issues before merging

### 4. Clean up

```bash
# After verification
gh pr close <PR_NUMBER>
git checkout main
git branch -D chore/protection-smoke
git push origin --delete chore/protection-smoke
```

---

## Status Check Names

Ensure these match your CI workflow job/step names:

| Check Name | Source | Purpose |
|------------|--------|---------|
| `Build, Test, and Gate` | CI workflow job name | Overall job status |
| `Run tests (incl. EAS worker simulation)` | CI workflow step | vitest tests (11 tests) |
| `Validate metrics thresholds (require_attested=true)` | CI workflow step | Metrics validation |

**Note:** GitHub uses the **step name** for status checks, not the `run` command.

---

## Troubleshooting

### Problem: Status checks don't appear in PR

**Solutions:**
1. Ensure CI workflow has run at least once on `main` branch
2. Check workflow syntax: `.github/workflows/ci.yml`
3. Verify workflow is enabled: **Settings → Actions → General**
4. Wait a few minutes for GitHub to index the workflow
5. Push a new commit to trigger the workflow

### Problem: Wrong status check names

**Solutions:**
1. Check actual check names in a recent PR
2. Update branch protection rule with correct names
3. Ensure step names in CI workflow match exactly

### Problem: Checks pass but merge still blocked

**Solutions:**
1. Verify all required checks are passing (not just some)
2. Check if "Require branches to be up to date" is enabled
3. Rebase/merge main into your branch if needed
4. Check for unresolved conversations

### Problem: Can't push directly to main

**Expected behavior!** Branch protection is working.

**Solutions:**
1. Create a feature branch
2. Push changes to feature branch
3. Create PR to main
4. Wait for checks to pass
5. Merge via PR

---

## Rollback/Emergency Access

### Temporarily disable protection

1. Go to: **Settings → Branches**
2. Find `main` rule
3. Click **Edit**
4. Uncheck **Include administrators** (if you're an admin)
5. Make emergency changes
6. Re-enable protection immediately after

### Permanent removal (not recommended)

1. Go to: **Settings → Branches**
2. Find `main` rule
3. Click **Delete**

**Warning:** Only do this if you're certain. Branch protection prevents accidental force-pushes and breaking changes.

---

## Best Practices

### ✅ Do

- Keep required checks minimal (3-5 max)
- Test protection rules with a sample PR
- Document any exceptions or overrides
- Review protection settings quarterly
- Enable "Require conversation resolution"

### ❌ Don't

- Add too many required checks (slows development)
- Disable protection for convenience
- Allow force-pushes to main
- Skip testing the protection rules
- Forget to re-enable after emergency changes

---

## Success Criteria

Branch protection is correctly configured when:

- [x] Direct pushes to `main` are blocked
- [x] PRs require status checks to pass
- [x] All 3 required checks appear in PRs
- [x] Checks run automatically on PR creation/update
- [x] Merge button disabled until checks pass
- [x] Test PR successfully demonstrates protection
- [x] Team members understand the workflow

---

## Next Steps After Setup

1. **Communicate to team**
   - Share this checklist
   - Explain new PR workflow
   - Provide example PR

2. **Monitor for issues**
   - Watch first few PRs
   - Help team members if checks fail
   - Adjust required checks if needed

3. **Iterate and improve**
   - Add more checks as needed (lint, build, etc.)
   - Consider adding deployment checks
   - Review and update quarterly

---

## Related Documentation

- **FINISH_LINE_GUIDE.md** - Complete operational guide for Phases 4.2-4.4
- **MAINTAINER.md** - Maintainer setup and procedures
- **CONTRIBUTING.md** - GitOps SOP and workflow guide
- **DEV_TODO.md** - Development roadmap and priorities

---

## Quick Reference

```bash
# View current protection rules
gh api repos/Macbyter/BaseBytes/branches/main/protection

# Test with sample PR
git checkout -b test/protection
echo "test" >> test.md
git add . && git commit -m "test: protection"
git push -u origin test/protection
gh pr create --base main --head test/protection --title "Test"

# Clean up
gh pr close <N>
git checkout main
git branch -D test/protection
git push origin --delete test/protection
```

---

**Status:** Ready to configure  
**Timeline:** ~5 minutes  
**Impact:** Prevents breaking changes, enforces quality gates

🛡️ **Turn policy into guardrails!**
