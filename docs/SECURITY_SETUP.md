# Security Setup Guide

This document outlines the security features and configurations for the BaseBytes repository.

## Automated Security Features

### 1. Secret Scanning

Enable secret scanning to detect accidentally committed secrets:

1. Go to **Settings** → **Code security and analysis**
2. Enable **Secret scanning**
3. Enable **Push protection** to block commits containing secrets

### 2. Dependabot

Enable Dependabot for automated dependency updates:

1. Go to **Settings** → **Code security and analysis**
2. Enable **Dependabot alerts**
3. Enable **Dependabot security updates**
4. Enable **Dependabot version updates**

### 3. Code Scanning

Enable code scanning for automated security analysis:

1. Go to **Security** → **Code scanning**
2. Set up **CodeQL analysis**
3. Configure to run on push and pull requests

## Branch Protection

Branch protection rules are configured via the `scripts/setup-branch-protection.sh` script.

### Required Status Checks

The following checks must pass before merging to `main`:

- **build-test-gate** - Full test suite including EAS worker simulation
- **Run tests (incl. EAS worker simulation)** - Core functionality tests
- **Validate metrics thresholds (require_attested=true)** - Metrics validation
- **SLO guard (p95 <= 60000ms, attested >= 0.995)** - Performance SLO enforcement
- **Scan for prohibited token terms** - USDC-only policy enforcement

### Code Review Requirements

- **1 approving review** required from code owner
- **Dismiss stale reviews** when new commits are pushed
- **Require code owner review** for critical paths (see `.github/CODEOWNERS`)
- **Require conversation resolution** before merging

### Protection Rules

- ❌ Force pushes disabled
- ❌ Branch deletion disabled
- ✅ Conversation resolution required
- ✅ Fork syncing allowed

## CODEOWNERS

The following paths require review from security team members:

- `/contracts/` - Smart contracts
- `/workers/` - Background workers (indexer, EAS, anchor)
- `/jobs/` - Scheduled jobs
- `/apps/api/` - API server
- `/apps/web/` - Web application
- `/lib/` - Core libraries
- `/scripts/` - Utility scripts
- `/audit/` - Audit and acceptance tests
- `docker-compose*.yml` - Infrastructure configuration
- `.github/workflows/` - CI/CD workflows

## Workflow Security

### Secrets Management

The following secrets must be configured in **Settings** → **Secrets and variables** → **Actions**:

- `API_BASE` - Production API URL
- `MINI_API_KEY` - x402 API key for testing
- `DATABASE_URL` - PostgreSQL connection string
- `BASE_SEPOLIA_RPC_URL` - Base Sepolia RPC endpoint
- `ATTESTER_PRIVATE_KEY` - Private key for EAS attestations

### Workflow Permissions

Workflows use minimal permissions:

- `contents: read` for most workflows
- `contents: write` only for release workflow

## Token Policy Enforcement

The **No Token Terms** workflow (`no-token.yml`) enforces the USDC-only policy by scanning for prohibited terms:

- `XPR` - Project token ticker
- `XPT` - Alternative token ticker
- `tokenomics` - Token economics
- `governance token` - Governance token references
- `utility token` - Utility token references

Any pull request containing these terms will be blocked.

## Nightly E2E Testing

The **Nightly E2E** workflow (`nightly-e2e.yml`) runs comprehensive acceptance tests daily at 3:00 AM UTC:

- x402 payment flow validation
- Payment indexer verification
- EAS attestation checks
- Daily anchor validation

## Release Automation

The **Release** workflow (`release.yml`) automatically:

1. Runs all acceptance tests
2. Collects test results and logs
3. Extracts latest anchor information
4. Creates GitHub release with artifacts
5. Includes BaseScan links for on-chain verification

## Manual Security Checks

### Before Each Release

1. Review all open Dependabot alerts
2. Verify all acceptance tests pass
3. Check for any security scanning findings
4. Review recent code changes for security implications
5. Validate EAS attestations on BaseScan
6. Verify anchor Merkle roots on-chain

### Monthly Security Review

1. Audit access permissions
2. Rotate API keys and secrets
3. Review CODEOWNERS assignments
4. Update security documentation
5. Conduct security training for contributors

## Incident Response

In case of security incident:

1. **Immediately** rotate all secrets and API keys
2. Review audit logs for unauthorized access
3. Check on-chain transactions for anomalies
4. Document incident in `/docs/incidents/`
5. Update security measures to prevent recurrence

## Contact

For security concerns, contact: @Macbyter
