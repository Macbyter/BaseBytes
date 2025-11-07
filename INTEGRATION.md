# BaseBytes Integration Guide

This guide provides examples for integrating with the BaseBytes network, including EVM interactions and x402 payment flows.

## 1. EVM Integration

### Router Contract

- **Address:** `0xF0a998d1cA93def52e2eA9929a20fEe8a644551c`
- **Network:** Base Sepolia (84532)
- **Explorer:** [BaseScan](https://sepolia.basescan.org/address/0xF0a998d1cA93def52e2eA9929a20fEe8a644551c)

### ABI

```json
[
  {
    "type": "function",
    "name": "pay",
    "inputs": [
      {
        "name": "skuId",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "units",
        "type": "uint32",
        "internalType": "uint32"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "event",
    "name": "PaymentReceived",
    "inputs": [
      {
        "name": "buyer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "seller",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "skuId",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "amountUsd6",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "units",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "rights",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  }
]
```

### Example: Making a Payment (Ethers.js)

```javascript
const { ethers } = require("ethers");

const ROUTER_ADDRESS = "0xF0a998d1cA93def52e2eA9929a20fEe8a644551c";
const ROUTER_ABI = [/* ABI from above */];

async function makePayment(skuId, units, priceUsd6) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer);

  const tx = await router.pay(skuId, units, {
    value: priceUsd6 * units // Assuming price is in wei
  });

  console.log(`TX submitted: ${tx.hash}`);
  await tx.wait();
  console.log("Payment confirmed!");
}

// Example usage
const skuId = "defi:preTradeRisk";
const units = 1;
const priceUsd6 = 200000; // 0.20 USDC

makePayment(skuId, units, priceUsd6);
```

## 2. x402 Payment Flow

The x402 flow allows services to request payment before returning data. This is useful for API access, data streaming, and other metered services.

### Step 1: Initial Request (Unpaid)

Make a request to the target endpoint. If payment is required, you will receive an HTTP 402 response.

```bash
curl -i "http://localhost:3000/ai/stream/defi:preTradeRisk"
```

**Response:**

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": "Payment required",
  "payment_terms": {
    "scheme": "evm",
    "network": "base-sepolia",
    "asset": "usdc",
    "payTo": "0xF0a998d1cA93def52e2eA9929a20fEe8a644551c",
    "amount": "200000",
    "memo": "defi:preTradeRisk"
  }
}
```

### Step 2: Make Payment

Use the `payment_terms` to make a payment on-chain. The `memo` field should be used as the `skuId` in the `pay` function.

### Step 3: Retry Request with Payment Proof

After the payment transaction is confirmed, retry the request with the transaction hash in the `Authorization` header.

```bash
TX_HASH="0xadd3791025dd5decf54873b6f2b01f8c48ebd7447375038aaeacd0e598f85ff6"

curl -i \
  -H "Authorization: evm-tx ${TX_HASH}" \
  "http://localhost:3000/ai/stream/defi:preTradeRisk"
```

**Response:**

```http
HTTP/1.1 200 OK
Content-Type: application/x-ndjson

{"chunk": 1, "data": "..."}
{"chunk": 2, "data": "..."}
...
```

## 3. API Endpoints

### GET /ai/catalog

Returns the list of available SKUs.

### GET /ai/receipt/:id

Returns a specific receipt, including EAS attestation details.

### GET /proofs/:id

Returns the Merkle inclusion proof for a receipt.
