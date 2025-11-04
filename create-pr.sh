#!/usr/bin/env bash
# BaseBytes — Create PR for E2E Verification Report
# Usage: bash create-pr.sh

set -euo pipefail

BRANCH_NAME="chore/report/2025-11-04-e2e-live"
PR_TITLE="chore(report): 2025-11-04 E2E live verification (Sepolia) + diagnostics"

echo "== BaseBytes PR Creation Script =="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Not in BaseBytes repository root"
  echo "Please cd to the repository root and try again"
  exit 1
fi

# Check if gh CLI is available
if ! command -v gh >/dev/null 2>&1; then
  echo "❌ Error: GitHub CLI (gh) not found"
  echo "Install with: brew install gh (macOS) or see https://cli.github.com"
  exit 1
fi

# Check if authenticated
if ! gh auth status >/dev/null 2>&1; then
  echo "❌ Error: Not authenticated with GitHub"
  echo "Run: gh auth login"
  exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Create and switch to branch
echo "== Creating branch: $BRANCH_NAME =="
git checkout -b "$BRANCH_NAME" 2>/dev/null || git checkout "$BRANCH_NAME"

# Stage files
echo "== Staging files =="
git add docs/reports/2025-11-04-e2e-live-sepolia.md
git add docs/runbooks/github-integration.md
git add diagnostics/
git add README.md
git add .github/workflows/ci.yml
git add ops/
git add package.json

# Show what will be committed
echo ""
echo "== Files to be committed =="
git status --short

# Commit
echo ""
echo "== Committing changes =="
git commit -F PR_COMMIT_MESSAGE.txt || {
  echo "⚠️  Nothing to commit or commit failed"
  echo "This might mean the changes are already committed"
}

# Push
echo ""
echo "== Pushing to origin =="
git push -u origin "$BRANCH_NAME" || {
  echo "⚠️  Push failed or branch already exists"
  echo "Continuing anyway..."
}

# Create PR
echo ""
echo "== Creating pull request =="
gh pr create \
  --title "$PR_TITLE" \
  --body-file PR_COMMIT_MESSAGE.txt \
  --base main \
  --head "$BRANCH_NAME" || {
  echo "⚠️  PR creation failed"
  echo "PR might already exist. Check: gh pr list"
  exit 1
}

echo ""
echo "✅ Pull request created successfully!"
echo ""
echo "Next steps:"
echo "  1. Wait for CI checks to complete (~40 seconds)"
echo "  2. Review the PR and request approval"
echo "  3. Merge with 'Squash and merge'"
echo "  4. Tag release: git tag -a v0.1.0 -m 'BaseBytes v0.1.0'"
echo ""
echo "View PR: gh pr view --web"
