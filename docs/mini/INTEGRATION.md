# BaseBytes Mini-App Connector (USDC payouts) — Partner Quickstart

This connector lets any **Base Mini App** request a risk/guard decision and (optionally) request a **USDC payout** when users opt into data rental. It's a single JSON POST — no framework changes required on your side.

---

## 1) Client: call the decision endpoint

### Install SDK

```bash
npm i @farcaster/miniapp-sdk
```

### Request Decision

```js
import { sdk } from '@farcaster/miniapp-sdk';

export async function requestDecision() {
  await sdk.actions.ready();
  const ctx = await sdk.context; // { user: { fid, ... } }
  const res = await fetch(process.env.NEXT_PUBLIC_BB_ENDPOINT + '/mini/decision', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.NEXT_PUBLIC_BB_API_KEY ? {'x-api-key': process.env.NEXT_PUBLIC_BB_API_KEY} : {})
    },
    body: JSON.stringify({
      sku: 'defi:preTradeRisk:v1',
      appId: 'your-app-id',
      subject: `fid:${ctx?.user?.fid ?? 'anon'}`,
      features: { walletAgeDays: 30, notionalUsd: 100, slippageBps: 12, pathEntropy: 0.6 },
      privacy: { mode: 'public' }
    })
  }).then(r => r.json());

  console.log('BaseBytes decision', res);
}
```

### Response

```json
{
  "ok": true,
  "receiptUid": "rcpt_…",
  "decision": "allow",
  "confidence": 0.93,
  "reasons": [],
  "policyVersion": "v1",
  "payout": { "status": "not_requested" }
}
```

---

## 2) Optional — request payout in USDC

```js
await fetch(process.env.NEXT_PUBLIC_BB_ENDPOINT + '/mini/payout', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': process.env.NEXT_PUBLIC_BB_API_KEY
  },
  body: JSON.stringify({
    appId: 'your-app-id',
    receiptUid: '<rcpt from decision>',
    to: '0xUserWalletOnBase',
    amountUsd: 0.50
    // or: amountUSDC: 500000
  })
}).then(r => r.json());
```

### Live response

```json
{ 
  "ok": true, 
  "idempotencyKey":"idem_…", 
  "payout": { 
    "status":"sent", 
    "txHash":"0x…", 
    "amountUSDC":"500000", 
    "chainId":"8453" 
  } 
}
```

---

## 3) Configuration (env)

```env
MINI_PORT=8787
MINI_API_KEY=partner-key
POLICY=Standard
POLICY_VERSION=v1
POLICY_CAPS={"feeBpsMax":500}

# Optional Postgres for receipts (else we write diagnostics/*.json)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/basebytes

# USDC payout (live mode)
PAYOUTS_MODE=live           # or 'simulate'
RPC_URL=https://base-mainnet.infura.io/v3/<key>   # or Base Sepolia RPC for test
PAYOUT_SIGNER_PK=0x<private key that holds USDC>
USDC_ADDRESS=0x833589fcd6edb6e08f4fc7a76b4f53d8204e55cf  # Base mainnet USDC
USDC_DECIMALS=6
```

---

## 4) Health & metrics

* `GET /healthz` — liveness
* `GET /readyz` — DB status + backlog + payout mode/config flags
* `GET /metrics` — Prometheus (`bb_mini_requests_total`, `bb_mini_latency_ms`, `bb_payout_requests_total`, `bb_payout_usdc_amount`)

---

## 5) Local run

```bash
npm run mini:start
curl -s http://localhost:8787/healthz
curl -s http://localhost:8787/readyz | jq .
curl -s http://localhost:8787/metrics | head
```

---

## 6) Available SKUs

### defi:preTradeRisk:v1

Pre-trade risk assessment for DeFi transactions.

**Features:**
- `walletAgeDays` (number) — Age of wallet in days
- `notionalUsd` (number) — Transaction size in USD
- `slippageBps` (number) — Slippage in basis points
- `pathEntropy` (number, 0-1) — Path entropy score

**Decisions:**
- `allow` — Transaction approved
- `warn` — Proceed with caution
- `block` — Transaction blocked (strict mode only)

---

### bridge:provenance:v1

Provenance check for bridge transactions.

**Features:**
- `mixerAdjacency` (boolean) — Adjacent to mixer
- `exploitAdjacency` (boolean) — Adjacent to exploit
- `sanctionedCluster` (boolean) — In sanctioned cluster
- `freshBridgeRisk` (number, 0-1) — Fresh bridge risk score

**Decisions:**
- `allow` — Bridge approved
- `warn` — Proceed with caution
- `block` — Bridge blocked (strict mode only)

---

### market:claimGuard:v1

Claim guard for marketplace transactions.

**Features:**
- `claimBurst` (number) — Number of recent claims
- `disputeFlag` (boolean) — Dispute flag set
- `freshFundsMins` (number) — Minutes since funds received

**Policy Caps:**
- `claimBurstMax` (number, default: 20) — Maximum allowed burst

**Decisions:**
- `allow` — Claim approved
- `warn` — Proceed with caution
- `block` — Claim blocked (strict mode only)

---

## 7) Policy Modes

### Standard (default)

- Denies become `warn` instead of `block`
- Suitable for most applications

### Strict (or Storm)

- Denies become `block`
- Stricter enforcement
- Set via `POLICY=strict` or `POLICY=storm`

---

## 8) Idempotency

Payout requests support idempotency via `idempotencyKey`:

```js
{
  "appId": "your-app-id",
  "receiptUid": "rcpt_...",
  "to": "0x...",
  "amountUsd": 0.50,
  "idempotencyKey": "custom-key-123"
}
```

If the same `idempotencyKey` is used, the connector returns the previous result without executing a new payout.

---

## 9) Error Handling

### Decision Endpoint

**400 Bad Request:**
```json
{ "error": "invalid_payload", "details": "require sku, appId, subject, features" }
```

**401 Unauthorized:**
```json
{ "error": "unauthorized" }
```

**500 Internal Error:**
```json
{ "error": "internal_error", "message": "..." }
```

### Payout Endpoint

**400 Bad Request:**
```json
{ "error": "invalid_payload", "details": "require appId,to and amountUsd|amountUSDC" }
{ "error": "invalid_address" }
```

**Insufficient Funds:**
```json
{
  "ok": false,
  "payout": {
    "status": "insufficient_funds",
    "note": "have 1000000 need 5000000"
  }
}
```

---

## 10) Testing

### Simulate Mode (default)

```bash
PAYOUTS_MODE=simulate npm run mini:start
```

Payouts return `status: "queued"` and write JSON to `diagnostics/payout_*.json` without executing on-chain transactions.

### Live Mode

```bash
PAYOUTS_MODE=live \
RPC_URL=https://base-sepolia-rpc.publicnode.com \
PAYOUT_SIGNER_PK=0x... \
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
npm run mini:start
```

Payouts execute real USDC transfers on Base Sepolia (or mainnet).

---

## 11) Security Best Practices

1. **Always use MINI_API_KEY** in production
2. **Never commit private keys** — use environment variables
3. **Use simulate mode** for testing
4. **Validate addresses** before payouts
5. **Monitor metrics** for anomalies
6. **Set rate limits** via `MINI_RPS` (default: 20/min)
7. **Enable HTTPS** in production (use reverse proxy)

---

## 12) Monitoring

### Prometheus Metrics

- `bb_mini_requests_total{route,result}` — Total requests by route and result
- `bb_mini_latency_ms` — Request latency histogram
- `bb_payout_requests_total{result}` — Total payout requests by result
- `bb_payout_usdc_amount` — Payout amount summary (USDC base units)

### Health Checks

```bash
# Liveness
curl http://localhost:8787/healthz

# Readiness (includes DB status, backlog, payout config)
curl http://localhost:8787/readyz | jq .
```

---

## 13) Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 8787
CMD ["npm", "run", "mini:start"]
```

### Environment Variables

```bash
docker run -d \
  -p 8787:8787 \
  -e MINI_PORT=8787 \
  -e MINI_API_KEY=your-key \
  -e DATABASE_URL=postgres://... \
  -e PAYOUTS_MODE=live \
  -e RPC_URL=https://... \
  -e PAYOUT_SIGNER_PK=0x... \
  -e USDC_ADDRESS=0x833589fcd6edb6e08f4fc7a76b4f53d8204e55cf \
  basebytes-mini-connector
```

---

## 14) Support

For questions or issues:
- GitHub: https://github.com/Macbyter/BaseBytes
- Documentation: https://github.com/Macbyter/BaseBytes/tree/main/docs

---

**🎉 Ready to integrate! Start with simulate mode and test the decision endpoint.**
