# Trust & Controls — Metrics and API Spec (v0.1)

Operational transparency primitives exposed to buyers, providers, and auditors.

## Data Model

### UsageReceipt (off‑chain, anchored daily)
```json
{
  "receiptId": "r_2025-11-10_000001",
  "paymentId": "0x…",
  "payer": "0x…",
  "payee": "0x…",
  "asset": "USDC-US",
  "amount": "0.42",
  "queryId": "0x…",
  "contentHash": "0x…",
  "policyId": "0x…",
  "allowed": true,
  "reasonCode": 0,
  "ts": 1731240000
}
```

### Daily Anchor Record
```json
{
  "day": "2025-11-10",
  "merkleRoot": "0x…",
  "count": 1234567,
  "easUid": "0x…",
  "anchorTx": "0x…",
  "anchoredAt": "2025-11-11T00:06:31Z",
  "schema": "basebytes.receipt.v1"
}
```

### Reason Codes (draft)
```
0: ALLOW
1: KYT_FAIL_SANCTIONS
2: KYT_FAIL_HIGH_RISK
3: POLICY_DENY_ASSET
4: POLICY_DENY_GEOGRAPHY
5: PROVIDER_REVOKED
6: FRAUD_SUSPECTED
7: OTHER
```

## SLOs
- **Receipt Coverage:** 100% of allowed payments.
- **Anchor Freshness:** ≥95% of daily anchors by **00:10 UTC** next day.
- **Revocation SLA:** Bulk: <24h; Streams: immediate gate at next entitlement.
- **Availability:** Trust APIs 99.9% monthly.

## Public APIs (read‑only)

### `GET /trust/summary`
- **Returns:** Coverage %, freshness %, last anchor details, deny‑rate breakdown.
- **Cache:** 60s.

### `GET /trust/days/:day/anchor`
- **Returns:** Anchor record for `:day` (UTC).

### `GET /trust/days/:day/receipts.ndjson`
- **Returns:** Line‑delimited `UsageReceipt` for `:day`.
- **Note:** PII‑free by design; wallet addresses only.

### `GET /trust/days/:day/proofs/:receiptId`
- **Returns:** Merkle inclusion proof for a receipt id under the day’s root.

### `GET /trust/denylist/hash`
- **Returns:** Current deny list digest and version.

### `GET /export/audit-bundle?day=:day`
- **Returns:** Tarball containing receipts, anchor, and proofs for day `:day`.

## Frontend Widgets
- **Coverage Tile:** `value: %`, `trend: 7D`.
- **Freshness Tile:** on‑time anchors 7D/30D.
- **Revocations Tile:** revocations applied (count), SLA met %.
- **Receipts Tile:** count, policy breakdown, asset breakdown.

## Security & Privacy
- No PII; wallet addresses only.
- Policy text is referenced by `policyId` and a public license hash; the license PDF is downloadable.
- All endpoints rate‑limited; audit bundle links expire in 24h and are hash‑locked per requester.
