# Contributing to BaseBytes

This repository uses a simple, reliable GitOps flow: **feature branches + PRs + CI**, keeping `main` green and protected.

---

## Table of Contents

1. [One-time Setup](#1-one-time-setup)
2. [Daily Workflow](#2-daily-workflow)
3. [Keep Branch Fresh](#3-keep-branch-fresh)
4. [PR Hygiene](#4-pr-hygiene)
5. [Secrets & Ignores](#5-secrets--ignores)
6. [Codespaces Quickstart](#6-codespaces-quickstart)
7. [Common Fixes](#7-common-fixes)
8. [Branch Naming](#8-branch-naming)
9. [Commit Messages](#9-commit-messages)
10. [Code Quality](#10-code-quality)

---

## 1) One-time Setup

Configure your Git identity and preferences:

```bash
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"
git config --global pull.ff only
git config --global init.defaultBranch main
git config --global rerere.enabled true  # remembers conflict resolutions
```

### Authentication Options

**HTTPS + PAT (recommended):**
- Create a GitHub Personal Access Token with `repo` scope at https://github.com/settings/tokens/new
- Use the token when prompted for password during git operations

**SSH:**
- Add your public key to GitHub: https://github.com/settings/keys
- Clone with: `git@github.com:Macbyter/BaseBytes.git`

---

## 2) Daily Workflow

### Pull → Branch → Code → Commit → Push

```bash
# 1. Sync main
git switch main
git pull --ff-only

# 2. Create feature branch
git switch -c feat/self-tx-helper

# 3. Make changes, then stage and commit
git add -A
git commit -m "feat: add EIP-1559 self-tx helper with --dry/--rpc/--key"

# 4. Push and open PR
git push -u origin HEAD

# 5. Create PR (browser or CLI)
# Browser: GitHub will show a banner to create PR
# CLI: gh pr create --base main --head "$(git branch --show-current)" --fill
```

---

## 3) Keep Branch Fresh

When `main` moves ahead while you're working on a feature branch:

```bash
# Fetch latest changes
git fetch origin

# Rebase your branch (preferred for clean history)
git rebase origin/main

# Or merge if you prefer
# git merge origin/main

# Push updated branch
git push --force-with-lease
```

### Handling Conflicts

```bash
# Check which files have conflicts
git status

# Open conflicted files and resolve
# Look for markers: <<<<<<< ======= >>>>>>>
# Choose the correct code and remove markers

# Stage resolved files
git add <file>...

# Continue rebase
git rebase --continue

# Push updated branch
git push --force-with-lease
```

---

## 4) PR Hygiene

### Title Format

```
<type>: <concise description>
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `chore:` - Maintenance tasks
- `refactor:` - Code restructuring
- `test:` - Test additions or updates
- `style:` - Code formatting (no logic changes)

**Examples:**
- `feat: add batch transaction support`
- `fix: correct chain ID validation logic`
- `docs: update installation instructions`

### PR Body Template

```markdown
## What
Brief description of the change.

## Why
Explanation of the problem this solves or feature this adds.

## How
Technical approach taken.

## Testing
Commands run and outputs/links:
- `npm run chain:check` ✅
- `npm run tx:self` → https://sepolia.basescan.org/tx/0x...

## Risk/Rollback
Any potential issues and how to revert if needed.
```

### Merge Strategy

- **Squash merge** when CI passes (keeps history clean)
- Ensure all checks are green before merging
- Delete branch after merge

---

## 5) Secrets & Ignores

### Never Commit Secrets!

The repository `.gitignore` protects:

```
.env
.env.*
node_modules/
dist/
coverage/
diagnostics/
.DS_Store
Thumbs.db
.vscode/
.idea/
```

### Environment Variables

Always use `.env` files for sensitive data:

```bash
# Copy template
cp .env.example .env

# Edit with your values
# NEVER commit .env to Git!
```

### If You Accidentally Commit Secrets

```bash
# Remove from tracking
git rm --cached .env

# Ensure it's in .gitignore
echo ".env" >> .gitignore

# Commit the fix
git commit -m "chore(security): stop tracking .env"

# Push
git push

# IMPORTANT: Rotate the exposed secret immediately!
```

---

## 6) Codespaces Quickstart

### Launch Codespace

1. Go to https://github.com/Macbyter/BaseBytes
2. Click **Code** → **Codespaces** → **Create codespace on main**

### Setup in Codespace

```bash
# Verify Node.js (or install if needed)
node -v || (nvm install --lts && nvm use --lts)

# Install dependencies
npm ci

# Copy environment template
cp .env.example .env
# Edit .env with your values
```

### Add Secrets to Codespaces

For persistent secrets across Codespaces:

1. Go to https://github.com/settings/codespaces
2. Add secrets like `BASE_SEPOLIA_RPC`, `ATTESTER_PRIVATE_KEY`
3. These will be available as environment variables in all Codespaces

---

## 7) Common Fixes

### 403 / Auth Errors

```bash
# Re-authenticate
gh auth login --web --git-protocol https

# Or regenerate PAT and use it
```

### Diverged History on Push

```bash
# Fetch and rebase
git fetch origin
git rebase origin/main

# Push with force-with-lease (safe force push)
git push --force-with-lease
```

### Locked Files in PR

Someone merged to `main` first. Update your branch:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

### Undo Local Mess

```bash
# Discard all local changes
git reset --hard HEAD
git clean -fd
```

### Stash Work in Progress

```bash
# Save current work
git stash -u

# Later, restore it
git stash pop
```

---

## 8) Branch Naming

Use descriptive, lowercase names with hyphens:

**Format:** `<type>/<short-description>`

**Examples:**
- `feat/self-tx-helper`
- `feat/batch-transactions`
- `fix/tx-fee-caps`
- `fix/gas-estimation-error`
- `chore/ci-workflows`
- `chore/update-dependencies`
- `docs/api-reference`
- `refactor/utils-module`
- `test/integration-tests`

---

## 9) Commit Messages

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Examples

**Simple:**
```
feat: add self-transaction script
```

**With scope:**
```
fix(utils): correct chain ID validation
```

**With body:**
```
feat(scripts): add batch transaction support

Implements batch transaction execution with automatic nonce
management and progress tracking. Includes retry logic for
failed transactions.

Closes #42
```

### Best Practices

- Use present tense: "add feature" not "added feature"
- Keep subject line under 50 characters
- Capitalize subject line
- No period at end of subject
- Use body to explain what and why (not how)

---

## 10) Code Quality

### Before Committing

```bash
# Run linter
npm run lint

# Format code
npm run format

# Run tests
npm test
```

### Code Review Checklist

- [ ] Code follows existing style
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No secrets committed
- [ ] No console.logs left in production code
- [ ] Error handling added
- [ ] Edge cases considered

---

## Quick Reference Cheat Sheet

```bash
# Clone and setup
git clone https://github.com/Macbyter/BaseBytes.git
cd BaseBytes
npm ci
cp .env.example .env

# Daily workflow
git switch main && git pull --ff-only
git switch -c feat/<topic>
# ... make changes ...
git add -A
git commit -m "feat: description"
git push -u origin HEAD

# Keep branch fresh
git fetch origin
git rebase origin/main
git push --force-with-lease

# Cleanup
git switch main
git branch -d feat/<topic>  # delete local branch after merge
```

---

## Getting Help

- **Documentation:** Check `QUICK_REFERENCE.md` for command reference
- **Issues:** Search existing issues or create a new one
- **Discussions:** Use GitHub Discussions for questions
- **Code Review:** Tag maintainers in PR for review

---

## Optional Git Aliases

Make your life easier with shortcuts:

```bash
git config --global alias.co "checkout"
git config --global alias.sw "switch"
git config --global alias.rb "rebase"
git config --global alias.st "status -sb"
git config --global alias.lg "log --oneline --graph --decorate -n 20"
```

Now you can use:
- `git sw main` instead of `git switch main`
- `git st` instead of `git status -sb`
- `git lg` for a nice commit graph

---

## Resources

- **Git Documentation:** https://git-scm.com/doc
- **GitHub Flow:** https://guides.github.com/introduction/flow/
- **Conventional Commits:** https://www.conventionalcommits.org/
- **GitHub CLI:** https://cli.github.com/

---

**Last Updated:** November 3, 2025  
**Maintained By:** BaseBytes Team

For questions or suggestions about this guide, please open an issue or PR!
