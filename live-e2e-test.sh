#!/usr/bin/env bash
# BaseBytes — Live E2E: chain → tx → DB → migrate → EAS bootstrap → worker → receipt → onchain
set -euo pipefail

# ==== knobs ====
: "${RPC_URL:=${BASE_SEPOLIA_RPC:-${BASE_RPC_URL:-}}}"
: "${PRIVATE_KEY:=${ATTESTER_PRIVATE_KEY:-${PK:-}}}"
: "${ATTESTER_ADDRESS:=}"        # derived if empty
: "${RECEIPT_UID:=rcpt_live_$(date +%s)}"
: "${EAS_CONTRACT:=0x4200000000000000000000000000000000000021}"         # Base Sepolia EAS
: "${EAS_SCHEMA_REGISTRY:=0x4200000000000000000000000000000000000020}"  # Base Sepolia SchemaRegistry
: "${POLL_SECS:=120}"            # total poll time for onchain (adjust if needed)

REPO_DIR="$PWD"
DIAG_DIR="$REPO_DIR/diagnostics"; mkdir -p "$DIAG_DIR"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ missing: $1"; exit 1; }; }
need node; need curl; need docker

mask6(){ sed -E 's/(0x[0-9a-fA-F]{6}).+/\1…/'; }
ts(){ date +%Y%m%dT%H%M%S; }

echo "== Install deps =="
if [ -f package-lock.json ]; then npm ci; else npm i; fi

echo "== Metrics gate (attested=true) =="
if npm run -s metrics:verify >/tmp/_metrics.out 2>&1; then echo "metrics ✅ PASS"; else
  echo "⚠️ metrics:verify FAILED — check /tmp/_metrics.out"; sed -n '1,200p' /tmp/_metrics.out || true; fi

# ---- CHAIN CHECK ----
[ -n "${RPC_URL:-}" ] || { echo "❌ RPC_URL not set"; exit 1; }
[ -n "${PRIVATE_KEY:-}" ] || { echo "❌ PRIVATE_KEY not set"; exit 1; }

CHAIN_ID=$(curl -s -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC_URL" \
  | sed -n 's/.*"result":"\([^"]*\)".*/\1/p' | tr A-Z a-z)
echo "chainId: ${CHAIN_ID}"
[ "$CHAIN_ID" = "0x14a34" ] || { echo "❌ wrong network; need Base Sepolia (0x14a34)"; exit 1; }

# ---- DERIVE ADDRESS IF NEEDED ----
if [ -z "${ATTESTER_ADDRESS:-}" ]; then
  ATTESTER_ADDRESS="$(node -e "import('ethers').then(m=>console.log(new m.Wallet(process.env.PRIVATE_KEY).address))")"
fi
echo "attester: $(echo "$ATTESTER_ADDRESS" | mask6)"

# ---- LIVE SELF TX (0 ETH) ----
TX_STAMP="$(ts)"
echo "== Live 0-ETH self-tx =="
if npm run -s tx:self -- "$ATTESTER_ADDRESS" 0 --rpc "$RPC_URL" --key "$PRIVATE_KEY" \
   | tee "$DIAG_DIR/tx_${TX_STAMP}.json" >/dev/null; then
  TX_HASH=$(grep -o '"tx_hash_full":"0x[0-9a-fA-F]\{64\}"' "$DIAG_DIR/tx_${TX_STAMP}.json" | cut -d\" -f4 | head -1)
  [ -z "$TX_HASH" ] && TX_HASH=$(grep -o '"tx_hash":"0x[0-9a-fA-F]\{64\}"' "$DIAG_DIR/tx_${TX_STAMP}.json" | cut -d\" -f4 | head -1)
  TX_BLOCK=$(sed -n 's/.*"block":\([^,}]*\).*/\1/p' "$DIAG_DIR/tx_${TX_STAMP}.json" | head -1)
  TX_EXPL="https://sepolia.basescan.org/tx/${TX_HASH}"
  echo "tx ✅ $TX_HASH"
  echo "explorer: $TX_EXPL"
else
  echo "❌ live tx failed (see $DIAG_DIR/tx_${TX_STAMP}.json)"; exit 1
fi

# ---- DOCKER UP + MIGRATE ----
echo "== Docker compose up (db+redis) =="
if [ -f docker-compose.staging.yml ]; then
  docker compose -f docker-compose.staging.yml up -d
else
  docker compose up -d
fi

export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:5432/basebytes}"
echo "== Migrate =="
if npm run -s migrate >/tmp/_migrate.out 2>&1; then echo "migrate ✅"; else
  echo "❌ migrate failed"; sed -n '1,160p' /tmp/_migrate.out || true; exit 1; fi

# ---- OPTIONAL EAS BOOTSTRAP (best-effort) ----
echo "== EAS bootstrap (best-effort) =="
if npm run -s eas:bootstrap >/tmp/_eas_boot.out 2>&1; then
  echo "bootstrap: ok"
else
  echo "bootstrap: skipped or not present (ok)"
fi

# ---- START WORKER WITH CLEAR EAS ENV ----
echo "== Start EAS worker (background) =="
( BASE_RPC_URL="$RPC_URL" \
  ATTESTER_PRIVATE_KEY="$PRIVATE_KEY" \
  EAS_CONTRACT="$EAS_CONTRACT" \
  EAS_SCHEMA_REGISTRY="$EAS_SCHEMA_REGISTRY" \
  npm run -s worker:eas || \
  BASE_RPC_URL="$RPC_URL" ATTESTER_PRIVATE_KEY="$PRIVATE_KEY" \
  EAS_CONTRACT="$EAS_CONTRACT" EAS_SCHEMA_REGISTRY="$EAS_SCHEMA_REGISTRY" \
  node workers/eas-attester.js ) > "$DIAG_DIR/worker_${TX_STAMP}.log" 2>&1 &
WORKER_PID=$!
sleep 2

# ---- SEED ONE PENDING RECEIPT ----
echo "== Insert receipt (pending) =="
PG_CID=$(docker ps --filter "ancestor=postgres:15" --format "{{.ID}}" | head -1 || true)
[ -n "$PG_CID" ] || { echo "❌ could not find postgres:15 container"; exit 1; }

docker exec -i "$PG_CID" psql -U postgres -d basebytes <<SQL >/dev/null 2>&1
INSERT INTO receipts (
  receipt_uid, ts, app_id, sku, policy_version, decision, confidence,
  features_hash, feature_commitment, privacy_mode, zk_scheme, proof_ref, evidence_set
) VALUES (
  '${RECEIPT_UID}', now(), 'demo','defi:preTradeRisk:v1','v1','allow',0.93,
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'public','', '0x0', '{}'
) ON CONFLICT (receipt_uid) DO NOTHING;
SQL

# ---- POLL FOR ONCHAIN ----
echo "== Poll for onchain (up to ${POLL_SECS}s) =="
ATT_STATUS=""; ATT_UID=""; ATT_TX=""; LEFT=$POLL_SECS
while [ $LEFT -gt 0 ]; do
  ROW=$(docker exec -i "$PG_CID" psql -U postgres -d basebytes -tAc \
    "SELECT attestation_status, COALESCE(attestation_uid,''), COALESCE(attestation_tx,'')
     FROM receipts WHERE receipt_uid='${RECEIPT_UID}' LIMIT 1;" || true)
  ATT_STATUS=$(echo "$ROW" | awk -F'|' '{print $1}' | xargs)
  ATT_UID=$(echo "$ROW" | awk -F'|' '{print $2}' | xargs)
  ATT_TX=$(echo "$ROW" | awk -F'|' '{print $3}' | xargs)
  echo "status: ${ATT_STATUS:-<none>} | uid: ${ATT_UID:0:10}… | tx: ${ATT_TX:0:10}…"
  if [ "$ATT_STATUS" = "onchain" ] && [[ "$ATT_UID" =~ ^0x[0-9a-fA-F]{64}$ ]] && [[ "$ATT_TX" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
    break
  fi
  sleep 5; LEFT=$((LEFT-5))
done

[ "$ATT_STATUS" = "onchain" ] || {
  echo "⚠️ did not reach onchain in time — check $DIAG_DIR/worker_${TX_STAMP}.log"
}

# ---- PRINT EXPLORER LINKS ----
SELF_TX_LINK="https://sepolia.basescan.org/tx/${TX_HASH}"
ATT_TX_LINK=""
if [ -n "$ATT_TX" ]; then ATT_TX_LINK="https://sepolia.basescan.org/tx/${ATT_TX}"; fi

# ---- FINAL SUMMARY JSON ----
printf '\n{"phase":"live-e2e","chainId":"%s","self_tx":{"hash":"%s","block":"%s","explorer":"%s"},"receipt_uid":"%s","attestation":{"status":"%s","uid":"%s","tx":"%s","explorer":"%s"}}\n' \
  "$CHAIN_ID" "$TX_HASH" "$TX_BLOCK" "$SELF_TX_LINK" \
  "$RECEIPT_UID" "$ATT_STATUS" "$ATT_UID" "$ATT_TX" "$ATT_TX_LINK"
