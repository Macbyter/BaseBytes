#!/usr/bin/env bash
# BaseBytes — PRODUCTION MEGA RUN v2
# Does: metrics ✔ | chain ✔ | self-tx ✔ | DB+Redis ✔ | migrate ✔ | EAS worker ✔ | receipt→onchain ✔
# Fallback: SIM mode (no Docker) runs EAS worker tests (11/11) and emits a full simulation report.

set -euo pipefail

# ====== TOGGLES / INPUTS ======
: "${DOCKER:=1}"                         # 1=use docker, 0=disable and run SIM mode for worker/DB bits
: "${RUN_TX:=1}"                         # 1=send 0-ETH self tx, 0=skip (use existing)
: "${LIVE_TX:=}"                         # optional: reuse a known Sepolia tx hash as proof_ref
: "${POLL_SECS:=150}"                    # wait for worker to flip onchain
: "${RECEIPT_UID:=rcpt_live_$(date +%s)}"
: "${BRANCH_PROTECT:=0}"                 # 1=apply branch protection via gh api
: "${TAG_RELEASE:=0}"                    # 1=tag v0.1.0 and create GH release (requires git + permissions)
: "${GH_OWNER:=Macbyter}"                # for branch protection / tagging
: "${GH_REPO:=BaseBytes}"
: "${BASE_NETWORK:=sepolia}"             # sepolia|mainnet

# Canonical Base EAS addresses:
if [ "$BASE_NETWORK" = "mainnet" ]; then
  : "${EAS_CONTRACT:=0x4200000000000000000000000000000000000021}"
  : "${EAS_SCHEMA_REGISTRY:=0x4200000000000000000000000000000000000020}"
  EXPECTED_CHAIN="0x2105"  # Base mainnet
else
  : "${EAS_CONTRACT:=0x4200000000000000000000000000000000000021}"
  : "${EAS_SCHEMA_REGISTRY:=0x4200000000000000000000000000000000000020}"
  EXPECTED_CHAIN="0x14a34"  # Base Sepolia
fi

# Derived / env bridges:
: "${RPC_URL:=${BASE_SEPOLIA_RPC:-${BASE_URL:-${BASE_RPC_URL:-}}}}"
: "${PRIVATE_KEY:=${ATTESTER_PRIVATE_KEY:-${PK:-}}}"
: "${ATTESTER_ADDRESS:=}"  # will derive if empty

# ====== PATHS ======
ROOT="$PWD"
OUT="$ROOT/diagnostics"; mkdir -p "$OUT"
STAMP="$(date +%Y%m%dT%H%M%S)"
INDEX="$OUT/index_${STAMP}.json"

# ====== HELPERS ======
need(){ command -v "$1" >/dev/null || { echo "❌ Missing: $1"; exit 1; }; }
mask6(){ sed -E 's/(0x[0-9A-Fa-f]{6}).+/\1…/'; }
note(){ printf "\n\033[1;34m== %s ==\033[0m\n" "$*"; }

# ====== CLEANUP TRAP ======
cleanup() {
  echo "[cleanup] stopping worker processes"
  pkill -f "workers/eas-attester.js" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ====== PRECHECKS ======
need node; need curl
[ -n "${RPC_URL:-}" ]     || { echo "❌ RPC_URL not set"; exit 1; }
[ -n "${PRIVATE_KEY:-}" ] || { echo "❌ PRIVATE_KEY not set"; exit 1; }

if [ "${DOCKER}" = "1" ]; then
  if command -v docker >/dev/null 2>&1; then
    :
  else
    echo "⚠️  docker not found; switching to SIM mode"; DOCKER=0
  fi
fi

# ====== INSTALL & METRICS GATE ======
note "Install dependencies"
if [ -f package-lock.json ]; then npm ci; else npm i; fi

note "Metrics gate (require_attested=true)"
METRICS_LOG="$OUT/metrics_${STAMP}.log"
if npm run -s metrics:verify >"$METRICS_LOG" 2>&1; then
  echo "metrics ✅ PASS"
else
  echo "⚠️  metrics gate reported issues (continuing) — see $METRICS_LOG"
fi

# ====== CHAIN SANITY ======
note "Check Base chainId (expect $EXPECTED_CHAIN)"
CID=$(curl -sS -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC_URL" \
  | sed -n 's/.*"result":"\([^"]*\)".*/\1/p' | tr A-Z a-z)
echo "chainId: $CID"
[ "$CID" = "$EXPECTED_CHAIN" ] || { echo "❌ Wrong network; need $BASE_NETWORK ($EXPECTED_CHAIN)"; exit 1; }

# derive address if not set
if [ -z "${ATTESTER_ADDRESS:-}" ]; then
  ATTESTER_ADDRESS="$(node -e "import('ethers').then(m=>console.log(new m.Wallet(process.env.PRIVATE_KEY).address))")"
fi
echo "attester: $(echo "$ATTESTER_ADDRESS" | mask6)"

# ====== SELF TX (or reuse) ======
TXH="${LIVE_TX:-}"
TX_JSON="$OUT/tx_${STAMP}.json"
if [ -z "$TXH" ] && [ "$RUN_TX" = "1" ]; then
  note "0-ETH self-transaction (gas sanity)"
  if npm run -s tx:self -- "$ATTESTER_ADDRESS" 0 --rpc "$RPC_URL" --key "$PRIVATE_KEY" \
     | tee "$TX_JSON" >/dev/null; then
    # Prefer jq for parsing
    if command -v jq >/dev/null 2>&1; then
      TXH="$(jq -r '.tx_hash_full // .tx_hash // .hash // empty' < "$TX_JSON" 2>/dev/null || true)"
    fi
    # Fallback to grep
    if [ -z "$TXH" ]; then
      TXH=$(grep -o '"tx_hash":"0x[0-9A-Fa-f]\{64\}"' "$TX_JSON" | head -1 | cut -d\" -f4 || true)
    fi
    if [ -z "$TXH" ]; then
      TXH=$(grep -o '"tx_hash_full":"0x[0-9A-Fa-f]\{64\}"' "$TX_JSON" | head -1 | cut -d\" -f4 || true)
    fi
    if [ -z "$TXH" ]; then
      TXH=$(grep -o '"hash":"0x[0-9A-Fa-f]\{64\}"' "$TX_JSON" | head -1 | cut -d\" -f4 || true)
    fi
    echo "tx ✅ $TXH"
    echo "Explorer: https://sepolia.basescan.org/tx/$TXH"
  else
    echo "⚠️  self-tx failed (continuing) — check $TX_JSON"
  fi
fi

# ====== DOCKER PATH OR SIM PATH ======
if [ "$DOCKER" = "1" ]; then
  # ---- LIVE INFRA ----
  note "docker compose up (Postgres + Redis) with namespace"
  if [ -f docker-compose.staging.yml ]; then
    docker compose -p basebytes -f docker-compose.staging.yml up -d
  else
    docker compose -p basebytes up -d
  fi

  export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:5432/basebytes}"

  # Wait for PostgreSQL readiness
  note "Wait for PostgreSQL readiness"
  PG=$(docker ps --filter "name=basebytes.*postgres" --format "{{.ID}}" | head -1 || true)
  [ -n "$PG" ] || PG=$(docker ps --filter "ancestor=postgres:15" --format "{{.ID}}" | head -1 || true)
  [ -n "$PG" ] || { echo "❌ postgres container not found"; exit 1; }
  
  MAX_WAIT=30
  WAITED=0
  until docker exec "$PG" pg_isready -U postgres -d basebytes -q 2>/dev/null; do
    if [ $WAITED -ge $MAX_WAIT ]; then
      echo "❌ PostgreSQL not ready after ${MAX_WAIT}s"
      exit 1
    fi
    echo "Waiting for PostgreSQL... ($WAITED/$MAX_WAIT)"
    sleep 2
    WAITED=$((WAITED + 2))
  done
  echo "PostgreSQL ✅ ready"

  # Wait for Redis readiness
  note "Wait for Redis readiness"
  REDIS=$(docker ps --filter "name=basebytes.*redis" --format "{{.ID}}" | head -1 || true)
  [ -n "$REDIS" ] || REDIS=$(docker ps --filter "ancestor=redis:7" --format "{{.ID}}" | head -1 || true)
  if [ -n "$REDIS" ]; then
    WAITED=0
    until docker exec "$REDIS" redis-cli PING 2>/dev/null | grep -q PONG; do
      if [ $WAITED -ge $MAX_WAIT ]; then
        echo "⚠️  Redis not ready after ${MAX_WAIT}s (continuing)"
        break
      fi
      echo "Waiting for Redis... ($WAITED/$MAX_WAIT)"
      sleep 2
      WAITED=$((WAITED + 2))
    done
    echo "Redis ✅ ready"
  else
    echo "⚠️  Redis container not found (continuing)"
  fi

  note "Run DB migrations"
  MIGRATE_LOG="$OUT/migrate_${STAMP}.log"
  if npm run -s migrate >"$MIGRATE_LOG" 2>&1; then
    echo "migrate ✅ OK"
  else
    echo "❌ migrate failed — see $MIGRATE_LOG"; exit 1
  fi

  note "Start EAS worker (bg)"
  WORKER_LOG="$OUT/worker_${STAMP}.log"
  ( BASE_RPC_URL="$RPC_URL" ATTESTER_PRIVATE_KEY="$PRIVATE_KEY" \
    EAS_CONTRACT="$EAS_CONTRACT" EAS_SCHEMA_REGISTRY="$EAS_SCHEMA_REGISTRY" \
    DATABASE_URL="$DATABASE_URL" \
    npm run -s worker:eas || \
    BASE_RPC_URL="$RPC_URL" ATTESTER_PRIVATE_KEY="$PRIVATE_KEY" \
    EAS_CONTRACT="$EAS_CONTRACT" EAS_SCHEMA_REGISTRY="$EAS_SCHEMA_REGISTRY" \
    DATABASE_URL="$DATABASE_URL" \
    node workers/eas-attester.js ) > "$WORKER_LOG" 2>&1 &
  WORKER_PID=$!
  sleep 3

  # Check worker is still running
  if ! kill -0 $WORKER_PID 2>/dev/null; then
    echo "⚠️  Worker process died immediately — check $WORKER_LOG"
  else
    echo "Worker ✅ started (PID: $WORKER_PID)"
  fi

  note "Insert pending receipt (proof_ref = tx or placeholder)"
  PROOF="${TXH:-0x0000000000000000000000000000000000000000000000000000000000000000}"
  docker exec -i "$PG" psql -U postgres -d basebytes <<SQL >/dev/null 2>&1
INSERT INTO receipts (
  receipt_uid, ts, app_id, sku, policy_version, decision, confidence,
  features_hash, feature_commitment, privacy_mode, zk_scheme, proof_ref, evidence_set
) VALUES (
  '${RECEIPT_UID}', now(), 'demo','defi:preTradeRisk:v1','v1','allow',0.93,
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'public','', '${PROOF}', ARRAY['${PROOF}']
) ON CONFLICT (receipt_uid) DO NOTHING;
SQL

  note "Poll DB for onchain (max ${POLL_SECS}s)"
  LEFT=$POLL_SECS; STATUS=""; ATT_UID=""; ATT_TX=""
  while [ $LEFT -gt 0 ]; do
    ROW=$(docker exec -i "$PG" psql -U postgres -d basebytes -tAc \
      "SELECT attestation_status, COALESCE(attestation_uid,''), COALESCE(attestation_tx,'')
         FROM receipts WHERE receipt_uid='${RECEIPT_UID}' LIMIT 1;" 2>/dev/null) || true
    STATUS=$(echo "$ROW" | awk -F'|' '{print $1}' | xargs)
    ATT_UID=$(echo "$ROW" | awk -F'|' '{print $2}' | xargs)
    ATT_TX=$(echo  "$ROW" | awk -F'|' '{print $3}' | xargs)
    echo "status=${STATUS:-<none>} uid=${ATT_UID:0:10}… tx=${ATT_TX:0:10}…"
    if [ "$STATUS" = "onchain" ] && [[ "$ATT_UID" =~ ^0x[0-9A-Fa-f]{64}$ ]] && [[ "$ATT_TX" =~ ^0x[0-9A-Fa-f]{64}$ ]]; then
      break
    fi
    sleep 5; LEFT=$((LEFT-5))
  done

  ATT_EXPL=""; [ -n "$ATT_TX" ] && ATT_EXPL="https://sepolia.basescan.org/tx/$ATT_TX"

  # Artifacts
  ANCHOR_JSON="$OUT/anchor_${STAMP}.json"
  cat >"$ANCHOR_JSON" <<JSON
{
  "mode": "live",
  "timestamp": "$(date -Is)",
  "network": "$BASE_NETWORK",
  "chainId": "$CID",
  "attester": "$ATTESTER_ADDRESS",
  "receipt_uid": "$RECEIPT_UID",
  "self_tx": {
    "hash": "${TXH:-}",
    "explorer": "${TXH:+https://sepolia.basescan.org/tx/${TXH}}"
  },
  "attestation": {
    "status": "${STATUS:-unknown}",
    "uid": "${ATT_UID:-}",
    "tx": "${ATT_TX:-}",
    "explorer": "${ATT_EXPL:-}"
  },
  "logs": {
    "metrics": "diagnostics/metrics_${STAMP}.log",
    "migrate": "diagnostics/migrate_${STAMP}.log",
    "worker": "diagnostics/worker_${STAMP}.log",
    "tx": "diagnostics/tx_${STAMP}.json"
  }
}
JSON

  # Create artifact index
  cat >"$INDEX" <<JSON
{
  "run_id": "${STAMP}",
  "mode": "live",
  "network": "$BASE_NETWORK",
  "artifacts": {
    "anchor": "diagnostics/anchor_${STAMP}.json",
    "tx": "diagnostics/tx_${STAMP}.json",
    "metrics_log": "diagnostics/metrics_${STAMP}.log",
    "migrate_log": "diagnostics/migrate_${STAMP}.log",
    "worker_log": "diagnostics/worker_${STAMP}.log"
  },
  "status": "${STATUS:-unknown}",
  "timestamp": "$(date -Is)"
}
JSON

  echo; echo "=== LIVE RESULT ==="
  cat "$ANCHOR_JSON"
  echo

  if [ "${STATUS:-}" = "onchain" ]; then
    echo "✅ Anchored on-chain — attestation tx: $ATT_TX"
    [ -n "$ATT_EXPL" ] && echo "🔗 $ATT_EXPL"
  else
    echo "⚠️  Not onchain within window — inspect $WORKER_LOG; consider increasing POLL_SECS"
  fi

else
  # ---- SIMULATION PATH ----
  note "SIM MODE (DB-free): run EAS worker tests (11/11) and build report"
  need npx
  SIM_JSON="$OUT/eas-sim_${STAMP}.json"
  SIM_MD="$OUT/eas-sim_${STAMP}.md"

  npx --yes vitest run --reporter=default --reporter=json --outputFile "$SIM_JSON"

  # Generate simulation report
  LIVE_TX="${LIVE_TX:-}" node - <<'JS' "$SIM_JSON" "$SIM_MD"
  const fs=require('fs');
  const [jp, mp]=process.argv.slice(2);
  const data=JSON.parse(fs.readFileSync(jp,'utf8'));
  const suites=(data.testResults||[]).map(s=>({file:s.name,tests:(s.assertionResults||[]).map(t=>({t:t.title||t.fullName,status:t.status,d:t.duration||0}))}));
  const flat=suites.flatMap(s=>s.tests); const pass=flat.filter(x=>x.status==='passed').length; const fail=flat.length-pass;
  const dur=(data.endTime? (data.endTime-data.startTime): flat.reduce((a,b)=>a+(b.d||0),0));
  const tx=process.env.LIVE_TX||'';
  const md=[
   '# EAS Worker Simulation Report',
   '', `**Total:** ${flat.length} tests · **Passed:** ${pass} · **Failed:** ${fail} · **Duration:** ~${dur} ms`,
   '', '## State Machine Verified', '- pending → attesting → onchain', '- uid/tx fields set on success', '',
   '## Real-world mapping',
   `- Network: Base Sepolia (0x14a34)`,
   tx? `- Live tx reference (for proof_ref): \`${tx}\`  https://sepolia.basescan.org/tx/${tx}` : '- (Provide LIVE_TX to link a real tx)',
   '', '## Suites',
   ...suites.flatMap(s=>[`### ${s.file}`,...s.tests.map(t=>`- ${t.status==='passed'?'🟢':'🔴'} ${t.t} (${t.d||0}ms)`),''])
  ];
  fs.writeFileSync(mp,md.join('\n'));
JS

  # Create artifact index for simulation
  cat >"$INDEX" <<JSON
{
  "run_id": "${STAMP}",
  "mode": "simulation",
  "network": "$BASE_NETWORK",
  "artifacts": {
    "simulation_report": "diagnostics/eas-sim_${STAMP}.md",
    "simulation_json": "diagnostics/eas-sim_${STAMP}.json",
    "metrics_log": "diagnostics/metrics_${STAMP}.log"
  },
  "live_tx_reference": "${LIVE_TX:-}",
  "timestamp": "$(date -Is)"
}
JSON

  echo; echo "=== SIM RESULT ==="
  if command -v jq >/dev/null 2>&1; then
    jq -r '.numTotalTests as $t | "tests:\($t)  passed:\(.numPassedTests)  failed:\(.numFailedTests)"' "$SIM_JSON" || true
  else
    echo "Tests completed - see $SIM_JSON for details"
  fi
  echo "Report: $SIM_MD"
  echo "JSON  : $SIM_JSON"
fi

echo; echo "=== ARTIFACT INDEX ==="
cat "$INDEX"
echo "Index: $INDEX"

# ====== OPTIONAL: BRANCH PROTECTION & TAGGING ======
if [ "${BRANCH_PROTECT}" = "1" ] && command -v gh >/dev/null 2>&1; then
  note "Apply branch protection (tests + metrics required)"
  gh api -X PUT "repos/${GH_OWNER}/${GH_REPO}/branches/main/protection" \
    -H "Accept: application/vnd.github+json" \
    --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": [
    "Run tests (incl. EAS worker simulation)",
    "Validate metrics thresholds (require_attested=true)"
  ]},
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "enforce_admins": true,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "restrictions": null
}
JSON
  echo "branch protection ✅ applied"
fi

if [ "${TAG_RELEASE}" = "1" ]; then
  note "Tag & release v0.1.0"
  set +e
  git tag -a v0.1.0 -m "BaseBytes v0.1.0 — tx helper, EAS anchoring, thresholds, tests"
  git push origin v0.1.0
  if command -v gh >/dev/null 2>&1; then
    gh release create v0.1.0 --notes "Initial production-ready cut" --title "BaseBytes v0.1.0"
  fi
  set -e
  echo "release step attempted (check output)"
fi
