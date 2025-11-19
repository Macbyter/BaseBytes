#!/usr/bin/env bash
set -euo pipefail

# setup-branch-protection.sh
# Configure branch protection rules for main branch

echo "🔒 Setting up branch protection for main"
echo "========================================"

REPO="Macbyter/BaseBytes"
BRANCH="main"

# Enable branch protection with required checks
gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "build-test-gate",
      "Run tests (incl. EAS worker simulation)",
      "Validate metrics thresholds (require_attested=true)",
      "SLO guard (p95 <= 60000ms, attested >= 0.995)",
      "Scan for prohibited token terms"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismissal_restrictions": {},
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
EOF

echo ""
echo "✅ Branch protection configured"
echo ""
echo "Required checks:"
echo "  - build-test-gate"
echo "  - Run tests (incl. EAS worker simulation)"
echo "  - Validate metrics thresholds (require_attested=true)"
echo "  - SLO guard (p95 <= 60000ms, attested >= 0.995)"
echo "  - Scan for prohibited token terms"
echo ""
echo "Required reviews: 1 from code owner"
echo "Conversation resolution: Required"
