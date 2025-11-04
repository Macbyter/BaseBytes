#!/usr/bin/env bash
# BaseBytes — GitHub Bootstrap
# Sets up GitHub repo with CI, branch protection, and secrets

set -euo pipefail
REPO_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_DIR"

# >>> EDIT THESE <<<
GH_OWNER="${GH_OWNER:-Macbyter}"
GH_REPO="${GH_REPO:-BaseBytes}"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
APPLY_BRANCH_PROTECTION="${APPLY_BRANCH_PROTECTION:-true}"
CREATE_NIGHTLY_PERF="${CREATE_NIGHTLY_PERF:-false}"

echo "== BaseBytes GitHub Bootstrap =="
echo "Owner: $GH_OWNER"
echo "Repo: $GH_REPO"
echo "Branch: $DEFAULT_BRANCH"
echo ""

echo "== normalize git repo =="
git init -b "$DEFAULT_BRANCH" 2>/dev/null || true
git add -A
git commit -m "chore: bootstrap repo with monitor, SLO guard, diagnostics & scripts" || echo "nothing to commit"

echo "== ensure remote =="
if ! git remote get-url origin >/dev/null 2>&1; then
  if command -v gh >/dev/null 2>&1; then
    echo "Creating GitHub repo..."
    gh repo create "$GH_OWNER/$GH_REPO" --public --source . --remote=origin --push || true
  else
    echo "No 'gh' CLI. Create repo at https://github.com/new and then run:"
    echo "  git remote add origin https://github.com/${GH_OWNER}/${GH_REPO}.git"
    echo "  git push -u origin ${DEFAULT_BRANCH}"
    exit 0
  fi
fi

echo "== verify CI workflows exist =="
if [ ! -f ".github/workflows/ci.yml" ]; then
  echo "❌ CI workflow not found at .github/workflows/ci.yml"
  echo "Please ensure the CI workflow is committed first"
  exit 1
fi
echo "✅ CI workflow found"

echo "== commit and push =="
git add -A
git commit -m "ci: add CI (tests + metrics + SLO guard)" || true
git push -u origin "$DEFAULT_BRANCH" || git push origin "$DEFAULT_BRANCH"

echo "== (optional) set repo secrets =="
if command -v gh >/dev/null 2>&1; then
  echo "Setting example secrets (press Ctrl+C to skip)..."
  sleep 2
  
  echo "Setting BASE_SEPOLIA_RPC..."
  gh secret set BASE_SEPOLIA_RPC -r "$GH_OWNER/$GH_REPO" -b "https://base-sepolia-rpc.publicnode.com" || true
  
  echo "Setting ATTESTER_PRIVATE_KEY..."
  gh secret set ATTESTER_PRIVATE_KEY -r "$GH_OWNER/$GH_REPO" -b "0xREPLACE_ME_WITH_REAL_KEY" || true
  
  echo "Setting DATABASE_URL..."
  gh secret set DATABASE_URL -r "$GH_OWNER/$GH_REPO" -b "postgres://postgres:postgres@localhost:5432/basebytes" || true
  
  echo ""
  echo "⚠️  Remember to update these secrets with real values!"
  echo "   gh secret set BASE_SEPOLIA_RPC -r $GH_OWNER/$GH_REPO -b 'YOUR_RPC_URL'"
  echo "   gh secret set ATTESTER_PRIVATE_KEY -r $GH_OWNER/$GH_REPO -b '0xYOUR_PRIVATE_KEY'"
else
  echo "Use GitHub UI → Settings → Secrets and variables → Actions to add:"
  echo " - BASE_SEPOLIA_RPC (or RPC_URL)"
  echo " - ATTESTER_PRIVATE_KEY"
  echo " - DATABASE_URL (once staging DB exists)"
fi

if [ "$APPLY_BRANCH_PROTECTION" = "true" ] && command -v gh >/dev/null 2>&1; then
  echo ""
  echo "== apply branch protection =="
  gh api -X PUT "repos/${GH_OWNER}/${GH_REPO}/branches/${DEFAULT_BRANCH}/protection" \
    -H "Accept: application/vnd.github+json" \
    --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Run tests (incl. EAS worker simulation)",
      "Validate metrics thresholds (require_attested=true)",
      "SLO guard (p95 <= 60000ms, attested >= 0.995)"
    ]
  },
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "enforce_admins": true,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "restrictions": null
}
JSON
  echo "Branch protection ✅ applied (requires admin permissions)."
else
  echo ""
  echo "Remember to enable Branch protection in Settings → Branches → Rules for '${DEFAULT_BRANCH}'."
  echo "Required checks:"
  echo "  - Run tests (incl. EAS worker simulation)"
  echo "  - Validate metrics thresholds (require_attested=true)"
  echo "  - SLO guard (p95 <= 60000ms, attested >= 0.995)"
fi

echo ""
echo "== kick CI =="
if command -v gh >/dev/null 2>&1; then
  gh workflow run ci.yml || true
fi

echo ""
echo "✅ GitHub wiring done!"
echo ""
echo "Review:"
echo "  Repo: https://github.com/${GH_OWNER}/${GH_REPO}"
echo "  Actions: https://github.com/${GH_OWNER}/${GH_REPO}/actions"
echo "  Settings: https://github.com/${GH_OWNER}/${GH_REPO}/settings"
echo ""
echo "Next steps:"
echo "  1. Update secrets with real values"
echo "  2. Verify CI runs successfully"
echo "  3. Create a test PR to verify branch protection"
echo "  4. Tag release: git tag -a v0.1.0 -m 'BaseBytes v0.1.0'"
