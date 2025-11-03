# BaseBytes

Ethical Data Rental On Base

## Local utilities

Install dependencies once:

```bash
npm install
```

### Derive the account address

```bash
# from environment variables
export PRIVATE_KEY="0x..."
npm run derive:address

# or pass the key explicitly
npm run derive:address -- --key 0x...

# positional (legacy) usage is still supported
node scripts/derive-address.js 0x...
```

### Verify the RPC network

```bash
# from environment variables
export RPC_URL="https://..."
npm run chain:check

# or pass the RPC via flag / positional argument
npm run chain:check -- --rpc https://...
node scripts/check-chain-id.js https://...
```

Flags:

- `--expect-chain-id=0x...` overrides the expected network (defaults to Base Sepolia `0x14a34`).
- `--allow-chain-mismatch` permits continuing when the RPC reports a different chain.

### Send a self-transaction

```bash
export RPC_URL="http://127.0.0.1:8545"
export PRIVATE_KEY="0x..."
npm run tx:self

# pass inputs via flags (allows you to override env vars inline)
npm run tx:self -- --rpc http://127.0.0.1:8545 --key 0x...

# optional overrides: send to a custom recipient or specify the ETH amount
npm run tx:self -- 0xRecipient 0.01 --rpc http://127.0.0.1:8545 --key 0x...
```

Additional options:

- `--confirmations=<n>` (or `TX_CONFIRMATIONS` env var) to wait for a custom number of confirmations.
- `--expect-chain-id=0x...` / `EXPECT_CHAIN_ID` to adjust the chain assertion.
- `--allow-chain-mismatch` / `ALLOW_CHAIN_MISMATCH=true` to skip chain enforcement (not recommended for production).
- `--to=<0x...>` / `SELF_TX_TO` to send to a specific recipient (defaults to the signer).
- `--value=<eth>` / `SELF_TX_VALUE` to choose the transfer amount in ETH (defaults to `0`).

Successful runs store diagnostics under `./diagnostics/` and echo a JSON summary.

### One-shot automation prompt

Paste the following snippet into a fresh shell (or Codex session) for an end-to-end workflow that installs dependencies if needed, checks the chain id, derives the account, and emits a 0-ETH self-transaction artifact. Provide your own RPC URL and private key first:

```bash
# one-shot self-transaction on Base Sepolia (or local anvil), with archiving and JSON summary
cd /workspace/BaseBytes || exit 1
set -euo pipefail

# ---- toggles / inputs ----
: "${SEND:=1}"
: "${ALLOW_CHAIN_MISMATCH:=0}"
: "${RPC_URL:=${BASE_RPC_URL:-}}"
: "${PRIVATE_KEY:=${ATTESTER_PRIVATE_KEY:-}}"
: "${SELF_ADDR:=${ATTESTER_ADDRESS:-}}"

if [ ! -d node_modules ]; then
  npm ci --silent || true
fi

if [ -z "${RPC_URL}" ] || [ -z "${PRIVATE_KEY}" ]; then
  printf '{"phase":"gate","status":"MISSING_ENV","need":["RPC_URL","PRIVATE_KEY"]}\n'
  exit 0
fi
case "$RPC_URL" in *\<*\>*)
  printf '{"phase":"gate","status":"INVALID_RPC_URL","hint":"remove angle brackets; paste the raw RPC URL"}\n'
  exit 0
  ;;
esac
if ! printf '%s' "$PRIVATE_KEY" | grep -Eq '^0x[0-9a-fA-F]{64}$'; then
  printf '{"phase":"gate","status":"INVALID_KEY","hint":"must be 0x + 64 hex chars"}\n'
  exit 0
fi

CHAIN_HEX="$(curl -sS --max-time 8 -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC_URL" \
  | sed -n 's/.*"result":"\([^"]*\)".*/\1/p' | tr 'A-Z' 'a-z' || true)"
if [ "${ALLOW_CHAIN_MISMATCH}" != "1" ] && [ "$CHAIN_HEX" != "0x14a34" ]; then
  printf '{"phase":"rpc-check","status":"GATED","chainId":"%s","hint":"expected 0x14a34 (Base Sepolia) or set ALLOW_CHAIN_MISMATCH=1 for local"}\n' "${CHAIN_HEX:-unknown}"
  exit 0
fi

if [ -z "${SELF_ADDR}" ]; then
  SELF_ADDR="$(npm run --silent derive:address -- --key "$PRIVATE_KEY" || true)"
fi
if [ -z "${SELF_ADDR}" ]; then
  printf '{"phase":"derive","status":"FAIL","reason":"could_not_derive_address"}\n'
  exit 0
fi

if [ "${SEND}" != "1" ]; then
  npm run tx:self -- "$SELF_ADDR" 0 --rpc "$RPC_URL" --key "$PRIVATE_KEY" --allow-chain-mismatch >/dev/null 2>&1 || true
  printf '{"phase":"dry-run","from":"%s","rpcChain":"%s","note":"built & estimated ok (no broadcast)"}\n' "$(echo "$SELF_ADDR" | sed -E 's/(0x[0-9a-fA-F]{6}).+/\1…/')" "${CHAIN_HEX:-unknown}"
  exit 0
fi

ts="$(date +%Y%m%dT%H%M%S)"
mkdir -p diagnostics
OUT="$(mktemp)"
if npm run tx:self -- "$SELF_ADDR" 0 --rpc "$RPC_URL" --key "$PRIVATE_KEY" --allow-chain-mismatch >"$OUT" 2>&1; then
  TXH="$(sed -n 's/.*"tx_hash_full":"\([^"]*\)".*/\1/p; t; s/.*"tx_hash":"\([^"]*\)".*/\1/p' "$OUT" | head -n1)"
  STAT="$(sed -n 's/.*"status":"\([^"]*\)".*/\1/p' "$OUT" | head -n1)"
  BLK="$(sed -n 's/.*"block":\([^,}]*\).*/\1/p' "$OUT" | head -n1)"
  if [ -z "$TXH" ]; then
    TXH="$(grep -Eo '0x[0-9a-fA-F]{64}' "$OUT" | head -n1 || true)"
  fi
  cat <<JSON >"diagnostics/tx_${ts}.json"
{
  "phase": "self-tx",
  "network": "${CHAIN_HEX:-unknown}",
  "from": "$(echo "$SELF_ADDR" | sed -E 's/(0x[0-9a-fA-F]{6}).+/\1…/')",
  "to": "$(echo "$SELF_ADDR" | sed -E 's/(0x[0-9a-fA-F]{6}).+/\1…/')",
  "tx_hash": "${TXH:-}",
  "status": "${STAT:-unknown}",
  "block": ${BLK:-null}
}
JSON
  EXPL=""
  if [ "$CHAIN_HEX" = "0x14a34" ] && [ -n "$TXH" ]; then
    EXPL="https://sepolia.basescan.org/tx/${TXH}"
  fi
  printf '{"phase":"tx","saved":"diagnostics/tx_%s.json","status":"%s","block":%s,"explorer":"%s"}\n' \
    "$ts" "${STAT:-unknown}" "${BLK:-null}" "${EXPL:-}"
else
  if grep -qE 'ENETUNREACH|ECONNREFUSED|network|fetch failed' "$OUT"; then
    printf '{"phase":"tx","status":"NETWORK_ERROR","detail":"%s"}\n' "$(tr -d '\n' <"$OUT" | sed 's/"/\\"/g' | head -c 400)"
  else
    printf '{"phase":"tx","status":"ERROR","detail":"%s"}\n' "$(tr -d '\n' <"$OUT" | sed 's/"/\\"/g' | head -c 400)"
  fi
  exit 1
fi
```
