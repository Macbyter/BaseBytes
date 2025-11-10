# Basebytes Metrics Dictionary

Canonical definitions for KPIs referenced across the 90‑day plan, pilots, and Trust & Controls.

> **Time basis:** All daily rollups use **UTC** day boundaries. Percentiles use nearest‑rank, ties rounded up.

## Platform & Reliability

### GMV (Gross Merchandise Value)
- **Definition:** Sum of `amount` (in asset units, reported in USDC equivalents where applicable) for all `PaymentReceived.allowed == true` during the period.
- **Formula:** `GMV_D = Σ amount_i where event_day(i) == D and allowed_i == true`
- **Source:** On‑chain `PaymentReceived` events (Router/Splitter).
- **Granularity:** Hourly, Daily, Monthly.

### Receipt Coverage %
- **Definition:** Share of allowed payments with a corresponding anchored receipt in the daily Merkle.
- **Formula:** `coverage_D = anchored_receipts_D / allowed_payments_D`
- **Source:** Off‑chain `UsageReceipt` store + EAS anchor index.
- **Target:** **100%**.

### Anchor Freshness %
- **Definition:** Share of periods where the EAS anchor for day D lands by **00:10 UTC** on D+1.
- **Formula:** `freshness_7D = (# of days with anchor_ts <= D+1 00:10 UTC) / 7`
- **Targets:** **≥95% (7D)**, **≥95% (30D)**.

### Time‑to‑Entitlement p95
- **Definition:** 95th percentile of `(entitlement_grant_ts - onchain_payment_ts)` per transaction.
- **Source:** On‑chain event timestamp + entitlement service logs.
- **Target:** **< 1s** p95.

## Commercial

### Trial→Paid Conversion %
- **Definition:** Share of trial accounts that generate at least one allowed payment within 14 days of first entitlement.
- **Formula:** `paid_trials / total_trials_started`
- **Window:** 14‑day cohort.

### Pilot Churn %
- **Definition:** Share of pilots that do not progress to a paid extension or contract within 14 days of pilot end.

## Market‑Maker / RFQ — Performance

### Quote‑to‑Fill (Q2F) %
- **Definition:** `fills / quotes` for a symbol/venue window.
- **Delta:** `ΔQ2F = Q2F_with_Basebytes − Q2F_baseline`
- **Source:** Stream events + buyer‑provided fill confirmations.

### Markout (bps)
- **Definition:** Signed price move against the fill after T seconds (e.g., 5s/30s).
- **Delta:** `ΔMarkout_T = Markout_T_with − Markout_T_without` (lower is better).

### Slippage (bps)
- **Definition:** `((fillPx − quotedPx) / quotedPx) * 10,000`, signed by side.
- **Delta:** change versus baseline window.

## Agent / Tool‑Use — Performance

### Task Success Rate (TSR) %
- **Definition:** Completed tasks / attempted tasks for a fixed task set.

### Retry Rate %
- **Definition:** Tool invocations that require ≥1 retry / total invocations.

### Latency p95 (ms)
- **Definition:** 95th percentile end‑to‑end task latency.

## Compliance & Policy

### Deny‑Rate %
- **Definition:** `denied_payments / total_payments` for a given asset and policy.
- **Breakdown:** By `reasonCode`, `asset` SKU (e.g., `USDC‑US`, `USDC‑EU`).

### Revocation SLA %
- **Definition:** Share of revocations applied within contractually defined SLA (e.g., <24h for bulk).

## Dimension Catalog
- **asset:** stablecoin SKU (e.g., `USDC‑US`, `USDC‑EU`).
- **supplierId:** provider identifier (wallet or EIP‑55 address).
- **buyerId:** wallet address or org id.
- **policyId:** bytes32 identifier of rights bundle.
- **queryId:** deterministic fingerprint of request parameters (see appendices).
- **contentHash:** hash of bulk file (when applicable).

---

### Audit Bundle Contents (Export)
- `receipts_D.ndjson`: all `UsageReceipt` rows for day D.
- `anchor.json`: Merkle root, EAS UID/tx, timestamp.
- `inclusion_proofs/…`: one proof per receipt id.
- `policy_map.json`: `policyId → license hash/version`.
