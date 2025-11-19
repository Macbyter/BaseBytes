# Partner Kickoff Pack

Welcome to BaseBytes! This guide will help you integrate ethical data rental into your application.

## Problem & Solution (200 words)

**The Problem**: Traditional data monetization forces users to surrender ownership and control of their personal information. Companies collect, aggregate, and sell user data without transparency or fair compensation. Users have no visibility into how their data is used, who accesses it, or what value it generates. This creates a fundamental trust deficit and raises serious ethical concerns.

**The Solution**: BaseBytes enables ethical data rental through transparent, time-limited access with cryptographic proof. Instead of selling data permanently, users rent access to their data streams for specific purposes and durations. Every transaction is recorded on-chain via Ethereum Attestation Service (EAS), creating an immutable audit trail. Users maintain ownership and control, while data consumers get legitimate access with clear terms.

**Key Benefits**:
- **Transparency**: Every data access is recorded on-chain with full provenance
- **Fair Compensation**: Users are paid directly in USDC for each data rental
- **Non-Custodial**: No intermediaries hold funds or data
- **Verifiable**: Cryptographic receipts prove every transaction
- **Compliant**: Built-in KYT (Know Your Transaction) for regulatory compliance

BaseBytes transforms data from a commodity to be exploited into a resource to be respected.

## 90-Second Demo Script

### Setup (10 seconds)
"Let me show you how BaseBytes works. I'm going to request access to a data stream."

### Step 1: Unpaid Request (20 seconds)
```bash
curl https://api.basebytes.org/ai/query \
  -H "Content-Type: application/json" \
  -d '{"query":"latest market trends","sku":"rag-basic"}'
```

"Notice we get a 402 Payment Required response with payment details: USDC amount, recipient address, and a unique memo."

### Step 2: Payment (20 seconds)
"Now I'll pay using my wallet. The payment includes the memo to link it to my request."

*[Show wallet transaction or use pre-paid API key]*

### Step 3: Paid Request (20 seconds)
```bash
curl https://api.basebytes.org/ai/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"query":"latest market trends","sku":"rag-basic"}'
```

"Now we get the data stream! And here's the receipt on BaseScan showing the on-chain attestation."

### Wrap-up (10 seconds)
"That's it: request, pay, receive. Every transaction is transparent, verifiable, and fair."

## 3 Curl Commands & Sample 402 JSON

### Command 1: Check Status
```bash
curl https://api.basebytes.org/status
```

**Response:**
```json
{
  "status": "operational",
  "timestamp": "2025-11-19T18:00:00.000Z",
  "metrics": {
    "entitlement_p95_ms": 850,
    "last_anchor_at": "2025-11-19T10:00:00.000Z",
    "receipt_coverage_24h": 0.998,
    "api_uptime_7d": 99.9
  },
  "version": "0.1-testnet"
}
```

### Command 2: Unpaid Request (Get Payment Details)
```bash
curl https://api.basebytes.org/ai/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the latest AI trends?",
    "sku": "rag-basic"
  }'
```

**Response (402 Payment Required):**
```json
{
  "network": "base-sepolia",
  "asset": "USDC-US",
  "payTo": "0xF0a998d1cA93def52e2eA9929a20fEe8a644551c",
  "amount": "0.10",
  "memo": "BB-RAG-20251119-A7F3E2",
  "sku": "rag-basic",
  "description": "RAG-enhanced AI query (basic tier)",
  "units": 1,
  "rights": "single-use, non-transferable, 24h validity"
}
```

### Command 3: Paid Request (With API Key)
```bash
curl https://api.basebytes.org/ai/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "query": "What are the latest AI trends?",
    "sku": "rag-basic"
  }'
```

**Response (200 OK - NDJSON Stream):**
```json
{"type":"chunk","content":"Based on recent data, key AI trends include:","timestamp":"2025-11-19T18:00:01.234Z"}
{"type":"chunk","content":" 1. Multimodal AI systems combining vision and language","timestamp":"2025-11-19T18:00:01.456Z"}
{"type":"chunk","content":" 2. Edge AI deployment for privacy-preserving applications","timestamp":"2025-11-19T18:00:01.678Z"}
{"type":"receipt","receipt_id":"rcpt_A7F3E2","attestation_uid":"0x1234...","basescan":"https://sepolia.basescan.org/tx/0x5678..."}
```

## TypeScript payX402 Helper (viem)

```typescript
// payX402.ts
// Helper function to handle x402 payment flow with viem

import { createWalletClient, createPublicClient, http, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

interface X402Response {
  network: string;
  asset: string;
  payTo: `0x${string}`;
  amount: string;
  memo: string;
  sku: string;
  description: string;
  units: number;
  rights: string;
}

interface PaymentResult {
  txHash: `0x${string}`;
  memo: string;
  amount: string;
}

/**
 * Pay for x402 request using USDC on Base Sepolia
 * @param x402Response - The 402 payment details from API
 * @param privateKey - Wallet private key (0x...)
 * @param rpcUrl - Base Sepolia RPC URL
 * @returns Payment transaction hash and details
 */
export async function payX402(
  x402Response: X402Response,
  privateKey: `0x${string}`,
  rpcUrl: string = 'https://sepolia.base.org'
): Promise<PaymentResult> {
  // Validate USDC-only policy
  if (!x402Response.asset.includes('USDC')) {
    throw new Error('Only USDC payments are supported');
  }

  // Setup wallet and client
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl)
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl)
  });

  // USDC contract address on Base Sepolia
  const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

  // Convert amount to USDC units (6 decimals)
  const amountInUnits = parseUnits(x402Response.amount, 6);

  // Encode memo in transaction data
  const memoHex = `0x${Buffer.from(x402Response.memo).toString('hex')}` as `0x${string}`;

  // ERC20 transfer function signature
  const transferData = encodeFunctionData({
    abi: [{
      name: 'transfer',
      type: 'function',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'to', type: 'address' },
        { name: 'amount', type: 'uint256' }
      ],
      outputs: [{ name: '', type: 'bool' }]
    }],
    functionName: 'transfer',
    args: [x402Response.payTo, amountInUnits]
  });

  // Send transaction
  const txHash = await walletClient.sendTransaction({
    to: USDC_ADDRESS,
    data: transferData,
    // Include memo in transaction input data (optional, for tracking)
  });

  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    memo: x402Response.memo,
    amount: x402Response.amount
  };
}

/**
 * Complete x402 flow: request → pay → retry with proof
 * @param apiUrl - BaseBytes API URL
 * @param query - Query payload
 * @param privateKey - Wallet private key
 * @param rpcUrl - Base Sepolia RPC URL
 * @returns API response data
 */
export async function completeX402Flow(
  apiUrl: string,
  query: { query: string; sku: string },
  privateKey: `0x${string}`,
  rpcUrl: string = 'https://sepolia.base.org'
): Promise<any> {
  // Step 1: Make unpaid request to get payment details
  const unpaidResponse = await fetch(`${apiUrl}/ai/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });

  if (unpaidResponse.status !== 402) {
    throw new Error(`Expected 402, got ${unpaidResponse.status}`);
  }

  const x402Data: X402Response = await unpaidResponse.json();

  // Step 2: Pay
  const payment = await payX402(x402Data, privateKey, rpcUrl);
  console.log('Payment sent:', payment.txHash);

  // Step 3: Retry request with payment proof
  // In production, you'd include the tx hash or use an API key
  const paidResponse = await fetch(`${apiUrl}/ai/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Tx': payment.txHash,
      'X-Payment-Memo': payment.memo
    },
    body: JSON.stringify(query)
  });

  if (!paidResponse.ok) {
    throw new Error(`Request failed: ${paidResponse.status}`);
  }

  return paidResponse.body; // Return NDJSON stream
}

// Helper to encode function data (simplified, use viem's encodeFunctionData in production)
function encodeFunctionData(params: any): `0x${string}` {
  // This is a placeholder - use viem's actual encodeFunctionData
  return '0x' as `0x${string}`;
}
```

## Trust & Controls One-Pager

### Non-Custodial Architecture

**No Intermediaries**: BaseBytes never holds user funds or data. Payments flow directly from data consumers to data providers via smart contracts on Base.

**Self-Custody**: Users maintain full control of their wallets and private keys. No account creation or KYC required to participate.

**Transparent Contracts**: All smart contracts are open source and verified on BaseScan. No hidden logic or backdoors.

### USDC-Only Policy

**Why USDC?**
- **Stability**: No price volatility disrupts business operations
- **Compliance**: Regulated stablecoin with built-in KYT/AML
- **Liquidity**: Widely supported across exchanges and wallets
- **Simplicity**: No token economics, governance, or speculation

**What We Don't Do**:
- ❌ No project token (XPR, XPT, etc.)
- ❌ No tokenomics or governance tokens
- ❌ No utility tokens or rewards programs
- ❌ No speculative assets

### Receipts & EAS

**Every Transaction On-Chain**: Each data rental generates an EAS attestation containing:
- Payment amount and timestamp
- SKU and access rights
- Data provider and consumer addresses
- Merkle proof for batch verification

**Verifiable Provenance**: Anyone can verify receipts on BaseScan:
```
https://sepolia.basescan.org/tx/{attestation_tx}
```

**Daily Anchors**: At 10:00 UTC daily, all receipts are batched into a Merkle tree and anchored on-chain. This enables:
- Efficient bulk verification
- Historical audit trails
- Tamper-proof records

### Know Your Transaction (KYT)

**Transaction Monitoring**: All USDC payments are monitored for:
- Sanctioned addresses (OFAC, EU, UN lists)
- High-risk jurisdictions
- Suspicious patterns or amounts

**Automatic Blocking**: Payments from flagged addresses are rejected before processing.

**Compliance Reporting**: Transaction logs are retained for regulatory compliance and can be provided to authorities upon legal request.

### Data Privacy

**Minimal Collection**: BaseBytes only collects data necessary for transaction processing:
- Wallet addresses (public blockchain data)
- Payment amounts and timestamps
- SKU and access rights

**No PII**: No names, emails, phone numbers, or personal identifiers are collected or stored.

**Encryption**: All API communications use TLS 1.3. Database connections require SSL verification.

**Access Controls**: Production systems use principle of least privilege. Secrets are rotated regularly and never committed to code.

### Security Measures

**Audit Scripts**: Automated acceptance tests run on every deployment and nightly:
- x402 payment flow validation
- Payment indexer verification
- EAS attestation checks
- Daily anchor validation

**Branch Protection**: All code changes require:
- Passing CI tests
- Security lint checks
- Code owner review
- No prohibited token terms

**Secret Scanning**: GitHub push protection blocks accidental secret commits.

**Dependabot**: Automated dependency updates for security patches.

### Support & SLA

**Response Time**: <4 hours for critical issues, <24 hours for general support

**Performance SLO**:
- p95 entitlement latency: <1 second
- Daily anchor: 10:00 UTC ±5 minutes
- Receipt coverage: ≥99.5% attested within 24h

**Status Page**: Real-time metrics at `https://api.basebytes.org/status`

**Contact**: Support via Slack/Telegram channel (provided to partners)

---

## Getting Started

1. **Review Integration Guide**: See [INTEGRATION.md](../INTEGRATION.md)
2. **Get API Key**: Contact us to provision your `MINI_API_KEY`
3. **Whitelist Domain**: Provide your domain for CORS configuration
4. **Test on Sepolia**: Use Base Sepolia testnet for initial integration
5. **Go Live**: Deploy to production with mainnet configuration

## Resources

- **API Documentation**: [OPENAPI.md](../OPENAPI.md)
- **GitHub Repository**: https://github.com/Macbyter/BaseBytes
- **BaseScan (Sepolia)**: https://sepolia.basescan.org
- **Base Documentation**: https://docs.base.org

## Questions?

Reach out via your dedicated partner support channel or email support@basebytes.org.
