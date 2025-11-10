# `PaymentReceived` Event — v1.1 (adds `policyId`)

This minor revision binds each paid entitlement to a concrete **rights bundle** via `policyId`, enabling provable linkage between payment, license, and usage receipts.

## Solidity Signature
```solidity
event PaymentReceived(
  bytes32 paymentId,
  address payer,
  address payee,
  address asset,
  uint256 amount,
  bytes32 queryId,
  bytes32 contentHash, // optional for bulk
  bytes32 policyId,    // NEW in v1.1
  bool allowed,
  uint32 reasonCode,
  uint64 ts
);
```

> **Compatibility:** Fields prior to `policyId` are unchanged from v1.0. Off‑chain `UsageReceipt` MUST include `policyId`.

## Versioning & Domain Separation
- **Event version:** encoded indirectly via ABI changes; index this file from the main doc where v1.0 is shown.
- **`queryId`:** `keccak256(canonicalQueryJSON | supplierId | version)`.
- **`policyId`:** `keccak256(license_text_pdf_hash | policy_version | rights_scope)`.
- **`contentHash`:** hash of bulk artifact (e.g., BLAKE3/sha256 of Parquet).

## Reason Codes
Same as Trust spec; `0 == ALLOW`. Non‑zero implies a deny decision or post‑facto revocation log.

## EAS Anchoring
- Daily rollup Merkle root over `UsageReceipt{paymentId, queryId, contentHash?, policyId, allowed, reasonCode, ts}`.
- Store EAS UID/tx and emit in the Trust summary API.

## Migration Notes
- Index the event logs under `paymentId` and `(payer, ts)` for fast entitlement checks.
- Backfill `policyId` for v1.0 events with a special sentinel if needed (e.g., `0x0…001`).

## Example (pseudo‑log)
```json
{
  "paymentId": "0xabc…",
  "payer": "0x123…",
  "payee": "0xdef…",
  "asset": "0xa0b8…",           // USDC
  "amount": "0.90",
  "queryId": "0x9f…",
  "contentHash": null,
  "policyId": "0x77…",
  "allowed": true,
  "reasonCode": 0,
  "ts": 1731240000
}
```
