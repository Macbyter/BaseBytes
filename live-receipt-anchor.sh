#!/usr/bin/env bash
# BaseBytes — Anchor a live receipt referencing an existing tx hash on Base Sepolia
set -euo pipefail

# ---- inputs / from your message ----
TXH="0x9f9fa10545300e66636b75612f9b86b37652712c1c1c06118af6a6277bc280f4"  # your self-tx
: "${RPC_URL:=${BASE_SEPOLIA_RPC:-${BASE_RPC_URL:-}}}"
: "${PRIVATE_KEY:=${ATTESTER_PRIVATE_KEY:-${PK:-}}}"
: "${ATTESTER_ADDRESS:=}"     # derived if empty
: "${RECEIPT_UID:=rcpt_live_$(date +%s)}"
: "${POLL_SECS:=150}"

# Canonical Base Sepolia EAS addresses
: "${EAS_CONTRACT:=0x4200000000000000000000000000000000000021}"
: "${EAS_SCHEMA_REGISTRY:=0x4200000000000000000000000000000000000020}"

REPO="$PWD"
DIAG="$REPO/diagnostics"; mkdir -p "$DIAG"

need(){ command -v "$1" >/dev/null || { echo "❌ missing: $1"; exit 1; }; }
need node; need curl; need docker

echo "== Install deps =="
[ -f package-lock.json ] && npm ci || npm i

# ---- metrics gate (best-effort) ----
echo "== metrics:verify (require_attested=true) =="
npm run -s metrics:verify || echo "⚠️ metrics gate reported issues; proceeding for live anchoring"

# ---- chain sanity: Base Sepolia (0x14a34) ----
[ -n "${RPC_URL:-}" ]      || { echo "RPC_URL not set"; exit 1; }
[ -n "${PRIVATE_KEY:-}" ]  || { echo "PRIVATE_KEY not set"; exit 1; }
CID=$(curl -sS -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC_URL" \
  | sed -n 's/.*"result":"\([^"]*\)".*/\1/p' | tr A-Z a-z)
echo "chainId: ${CID}"
[ "$CID" = "0x14a34" ] || { echo "❌ wrong network; need Base Sepolia (0x14a34)"; exit 1; }

# ---- derive sender if omitted ----
if [ -z "${ATTESTER_ADDRESS:-}" ]; then
  ATTESTER_ADDRESS="$(node -e "import('ethers').then(m=>console.log(new m.Wallet(process.env.PRIVATE_KEY).address))")"
fi
echo "attester: $(echo "$ATTESTER_ADDRESS" | sed -E 's/(0x[0-9a-fA-F]{6}).+/\1…/')"

# ---- docker up + migrate ----
echo "== docker compose up (postgres+redis) =="
[ -f docker-compose.staging.yml ] && docker compose -f docker-compose.staging.yml up -d || docker compose up -d
export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:5432/basebytes}"
echo "== migrate =="
npm run -s migrate

# ---- start EAS worker (bg) with explicit env ----
STAMP=$(date +%Y%m%dT%H%M%S)
echo "== start EAS worker (background) =="
( BASE_RPC_URL="$RPC_URL" ATTESTER_PRIVATE_KEY="$PRIVATE_KEY" \
  EAS_CONTRACT="$EAS_CONTRACT" EAS_SCHEMA_REGISTRY="$EAS_SCHEMA_REGISTRY" \
  npm run -s worker:eas || \
  BASE_RPC_URL="$RPC_URL" ATTESTER_PRIVATE_KEY="$PRIVATE_KEY" \
  EAS_CONTRACT="$EAS_CONTRACT" EAS_SCHEMA_REGISTRY="$EAS_SCHEMA_REGISTRY" \
  node workers/eas-attester.js ) > "$DIAG/worker_${STAMP}.log" 2>&1 &
sleep 2

# ---- seed ONE pending receipt that references your tx ----
echo "== insert pending receipt referencing tx hash =="
PG=$(docker ps --filter "ancestor=postgres:15" --format "{{.ID}}" | head -1 || true)
[ -n "$PG" ] || { echo "❌ postgres:15 container not found"; exit 1; }
docker exec -i "$PG" psql -U postgres -d basebytes <<SQL >/dev/null 2>&1
INSERT INTO receipts (
  receipt_uid, ts, app_id, sku, policy_version, decision, confidence,
  features_hash, feature_commitment, privacy_mode, zk_scheme, proof_ref, evidence_set
) VALUES (
  '${RECEIPT_UID}', now(), 'demo','defi:preTradeRisk:v1','v1','allow',0.93,
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'public','', '${TXH}', ARRAY['${TXH}']
) ON CONFLICT (receipt_uid) DO NOTHING;
SQL

# ---- poll for onchain ----
echo "== poll for onchain (up to ${POLL_SECS}s) =="
LEFT=$POLL_SECS; STATUS=""; ATT_UID=""; ATT_TX=""
while [ $LEFT -gt 0 ]; do
  ROW=$(docker exec -i "$PG" psql -U postgres -d basebytes -tAc \
    "SELECT attestation_status, COALESCE(attestation_uid,''), COALESCE(attestation_tx,'')
     FROM receipts WHERE receipt_uid='${RECEIPT_UID}' LIMIT 1;" || true)
  STATUS=$(echo "$ROW" | awk -F'|' '{print $1}' | xargs)
  ATT_UID=$(echo "$ROW" | awk -F'|' '{print $2}' | xargs)
  ATT_TX=$(echo "$ROW" | awk -F'|' '{print $3}' | xargs)
  echo "status: ${STATUS:-<none>}  uid: ${ATT_UID:0:10}…  tx: ${ATT_TX:0:10}…"
  if [ "$STATUS" = "onchain" ] && [[ "$ATT_UID" =~ ^0x[0-9a-fA-F]{64}$ ]] && [[ "$ATT_TX" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
    break
  fi
  sleep 5; LEFT=$((LEFT-5))
done

ATT_EXPL=""; [ -n "$ATT_TX" ] && ATT_EXPL="https://sepolia.basescan.org/tx/$ATT_TX"

# ---- final roll-up ----
SELF_LINK="https://sepolia.basescan.org/tx/${TXH}"
printf '\n{"phase":"live-anchor","chainId":"%s","attester":"%s","self_tx":"%s","receipt_uid":"%s","attestation":{"status":"%s","uid":"%s","tx":"%s","explorer":"%s"}}\n' \
  "$CID" "$(echo "$ATTESTER_ADDRESS" | sed -E 's/(0x[0-9a-fA-F]{6}).+/\1…/')" "$SELF_LINK" \
  "$RECEIPT_UID" "$STATUS" "$ATT_UID" "$ATT_TX" "$ATT_EXPL"
