# BaseBytes Quick Reference Guide

## 🚀 Quick Start

### Installation
```bash
cd BaseBytes
npm install
```

### Environment Setup
```bash
export RPC_URL="https://sepolia.base.org"
export PRIVATE_KEY="0x..."
```

---

## 📋 Command Reference

### Check Network Connection
```bash
# Using environment variable
export RPC_URL="https://sepolia.base.org"
npm run chain:check

# Using flag
npm run chain:check -- --rpc https://sepolia.base.org

# Allow chain mismatch (for local testing)
npm run chain:check -- --allow-chain-mismatch
```

**Output:**
```json
{
  "chainId": "0x14a34",
  "expectedChainId": "0x14a34"
}
```

---

### Derive Wallet Address
```bash
# Using environment variable
export PRIVATE_KEY="0x..."
npm run derive:address

# Using flag
npm run derive:address -- --key 0x...

# Direct execution
node scripts/derive-address.js 0x...
```

**Output:**
```
0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

---

### Send Self-Transaction
```bash
# Basic usage (0 ETH to self)
export RPC_URL="https://sepolia.base.org"
export PRIVATE_KEY="0x..."
npm run tx:self

# With flags
npm run tx:self -- --rpc https://sepolia.base.org --key 0x...

# Send to specific address
npm run tx:self -- --to 0xRecipient

# Send specific amount
npm run tx:self -- --value 0.01

# Full custom transaction
npm run tx:self -- 0xRecipient 0.01 --rpc https://sepolia.base.org --key 0x...

# Wait for multiple confirmations
npm run tx:self -- --confirmations 3
```

**Output:**
```json
{
  "status": "OK",
  "explorer": "https://sepolia.basescan.org/tx/0x...",
  "saved": "diagnostics/tx_20251103T160830.json"
}
```

---

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `RPC_URL` | Ethereum RPC endpoint | `https://sepolia.base.org` |
| `PRIVATE_KEY` | Wallet private key (0x + 64 hex) | `0x1234...` |
| `EXPECT_CHAIN_ID` | Expected chain ID (hex) | `0x14a34` |
| `ALLOW_CHAIN_MISMATCH` | Allow chain mismatch | `true` or `1` |
| `SELF_TX_TO` | Transaction recipient | `0x742d...` |
| `SELF_TX_VALUE` | ETH amount to send | `0.01` |
| `TX_CONFIRMATIONS` | Confirmations to wait | `3` |

### Command-Line Flags

#### Common Flags (All Scripts)
- `--rpc <url>` / `--rpc-url <url>` - RPC endpoint
- `--key <hex>` / `--private-key <hex>` - Private key
- `--expect-chain-id <hex>` - Expected chain ID
- `--allow-chain-mismatch` - Skip chain validation

#### Transaction-Specific Flags
- `--to <address>` / `--to-address <address>` - Recipient
- `--value <eth>` / `--amount <eth>` - ETH amount
- `--confirmations <n>` - Confirmation count

---

## 🌐 Network Information

### Base Sepolia (Default)
- **Chain ID:** `0x14a34` (84532 decimal)
- **RPC URL:** `https://sepolia.base.org`
- **Explorer:** https://sepolia.basescan.org
- **Faucet:** https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

### Local Development (Anvil/Hardhat)
```bash
# Start local node
anvil

# Use with scripts
npm run tx:self -- --rpc http://127.0.0.1:8545 --allow-chain-mismatch
```

---

## 📁 Output Files

### Diagnostic Files
Location: `./diagnostics/tx_<timestamp>.json`

**Example:**
```json
{
  "phase": "self-tx",
  "network": "0x14a34",
  "from": "0x742d…",
  "to": "0x742d…",
  "value_wei": "0",
  "value_eth": "0.0",
  "gas_limit": "21000",
  "max_fee_gwei": "4.00",
  "max_priority_gwei": "1.50",
  "tx_hash": "0xabcd…",
  "tx_hash_full": "0xabcd1234...",
  "block": 12345678,
  "status": "OK"
}
```

---

## 🔐 Security Best Practices

### ✅ DO
- Store private keys in environment variables
- Use `.env` files (add to `.gitignore`)
- Test on testnet before mainnet
- Verify chain ID before transactions
- Review transaction details before sending

### ❌ DON'T
- Commit private keys to Git
- Share private keys in logs or screenshots
- Use production keys for testing
- Disable chain mismatch protection on mainnet
- Run scripts with untrusted RPC endpoints

---

## 🐛 Troubleshooting

### "Missing RPC_URL environment variable"
**Solution:** Set the RPC URL
```bash
export RPC_URL="https://sepolia.base.org"
```

### "Unexpected chain id: 0x1 (expected 0x14a34)"
**Solution:** Either use correct network or allow mismatch for local testing
```bash
npm run tx:self -- --allow-chain-mismatch
```

### "Gas estimation failed"
**Solution:** Check account balance and RPC connectivity
```bash
# Verify RPC
npm run chain:check

# Check address
npm run derive:address
```

### "Network error" / "ECONNREFUSED"
**Solution:** Verify RPC URL is accessible
```bash
curl -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  $RPC_URL
```

---

## 📊 Branch Overview

| Branch | Status | Description |
|--------|--------|-------------|
| `main` | ⚠️ Minimal | Only LICENSE + README |
| `codex/add-self-transaction-script-for-base-sepolia` | ✅ Complete | Full implementation |
| `codex/push-basebytes-to-new-github-repo` | 🔄 Partial | Basic .gitignore |
| `codex/export-basebytes-to-github` | 🔄 Partial | Enhanced .gitignore |

**Recommendation:** Merge `codex/add-self-transaction-script-for-base-sepolia` to `main`

---

## 🔄 Git Operations

### Switch to Feature Branch
```bash
git checkout codex/add-self-transaction-script-for-base-sepolia
```

### View All Branches
```bash
git branch -a
```

### View Commit History
```bash
git log --oneline --graph --all
```

### Merge Feature to Main
```bash
git checkout main
git merge codex/add-self-transaction-script-for-base-sepolia
git push origin main
```

---

## 📦 Dependencies

### Production
- **ethers.js** v6.15.0 - Ethereum library

### Installation
```bash
npm install          # Install all dependencies
npm ci               # Clean install (CI/CD)
npm update           # Update dependencies
npm audit            # Security audit
```

---

## 🧪 Testing Commands

### Manual Testing Workflow
```bash
# 1. Install dependencies
npm install

# 2. Verify RPC connection
npm run chain:check -- --rpc https://sepolia.base.org

# 3. Derive address
npm run derive:address -- --key 0x...

# 4. Send test transaction (0 ETH)
npm run tx:self -- --rpc https://sepolia.base.org --key 0x...

# 5. Check diagnostic output
cat diagnostics/tx_*.json | tail -1
```

---

## 📚 Additional Resources

### Documentation
- [Ethers.js Docs](https://docs.ethers.org/)
- [Base Network Docs](https://docs.base.org/)
- [EIP-1559 Specification](https://eips.ethereum.org/EIPS/eip-1559)

### Tools
- [Base Sepolia Explorer](https://sepolia.basescan.org)
- [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
- [Anvil Local Node](https://book.getfoundry.sh/anvil/)

---

**Last Updated:** November 3, 2025  
**Version:** 1.0
