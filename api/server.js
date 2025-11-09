#!/usr/bin/env node
/**
 * BaseBytes x402 API Server
 * Implements HTTP 402 Payment Required flow for AI streaming
 */

const fastify = require('fastify')({ logger: true });
const { ethers } = require('ethers');

// Environment configuration
const PORT = process.env.PORT || 3000;
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS || '0xF0a998d1cA93def52e2eA9929a20fEe8a644551c';
const USDC_ADDRESS = process.env.USDC_ADDRESS || '0xf508852621c6981ffd8358212aa885267D4676b1';
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
const CHAIN_ID = 84532; // Base Sepolia

// SKU catalog (will move to DB in PR #2)
const SKUS = {
  'defi:preTradeRisk': {
    title: 'DeFi Pre-Trade Risk',
    price: '0.20',
    unitName: 'unit',
    schema: { type: 'risk-assessment', version: '1.0' }
  },
  'bridge:provenance': {
    title: 'Bridge Provenance',
    price: '0.15',
    unitName: 'unit',
    schema: { type: 'provenance-check', version: '1.0' }
  },
  'market:claimGuard': {
    title: 'Market Claim Guard',
    price: '0.25',
    unitName: 'unit',
    schema: { type: 'claim-validation', version: '1.0' }
  }
};

// Router ABI (PaymentReceived event)
const ROUTER_ABI = [
  'event PaymentReceived(address indexed buyer, address indexed seller, bytes32 indexed skuId, uint96 amountUsd6, uint32 units, uint8 rights)'
];

// Provider for payment verification
const provider = new ethers.JsonRpcProvider(RPC_URL);
const routerContract = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);

/**
 * Verify payment by checking for PaymentReceived event
 */
async function verifyPayment(txHash, sku) {
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { verified: false, reason: 'Transaction not found' };
    }

    if (receipt.status !== 1) {
      return { verified: false, reason: 'Transaction failed' };
    }

    // Check for PaymentReceived event
    const skuId = ethers.id(sku); // keccak256
    const logs = receipt.logs.filter(log => 
      log.address.toLowerCase() === ROUTER_ADDRESS.toLowerCase()
    );

    for (const log of logs) {
      try {
        const parsed = routerContract.interface.parseLog(log);
        if (parsed.name === 'PaymentReceived' && parsed.args.skuId === skuId) {
          return {
            verified: true,
            buyer: parsed.args.buyer,
            seller: parsed.args.seller,
            amount: parsed.args.amountUsd6.toString(),
            units: parsed.args.units.toString(),
            rights: parsed.args.rights.toString()
          };
        }
      } catch (e) {
        // Skip non-matching logs
        continue;
      }
    }

    return { verified: false, reason: 'PaymentReceived event not found for this SKU' };
  } catch (error) {
    fastify.log.error({ error, txHash }, 'Payment verification failed');
    return { verified: false, reason: error.message };
  }
}

/**
 * Generate NDJSON stream for AI response
 */
async function* generateNDJSON(sku) {
  const responses = [
    { type: 'start', sku, timestamp: Date.now() },
    { type: 'data', content: `Analyzing ${sku}...` },
    { type: 'data', content: 'Risk assessment: LOW' },
    { type: 'data', content: 'Confidence: 0.95' },
    { type: 'data', content: 'Recommendation: PROCEED' },
    { type: 'end', sku, timestamp: Date.now() }
  ];

  for (const item of responses) {
    yield JSON.stringify(item) + '\n';
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Routes

/**
 * Health check
 */
fastify.get('/healthz', async (request, reply) => {
  return { status: 'ok', timestamp: Date.now() };
});

/**
 * Metrics endpoint
 */
fastify.get('/metrics', async (request, reply) => {
  return {
    requests_total: 0,
    payments_total: 0,
    streams_total: 0
  };
});

/**
 * SKU catalog
 */
fastify.get('/ai/catalog', async (request, reply) => {
  const skus = Object.entries(SKUS).map(([id, info]) => ({
    sku_id: id,
    title: info.title,
    price: info.price,
    unit_name: info.unitName,
    schema: info.schema
  }));

  return { skus, network: 'base', asset: 'USDC-US' };
});

/**
 * AI stream endpoint with x402 flow
 */
fastify.get('/ai/stream/:sku', async (request, reply) => {
  const { sku } = request.params;
  const paymentTx = request.headers['x-payment-tx'] || request.query.paid;

  // Check if SKU exists
  if (!SKUS[sku]) {
    return reply.code(404).send({ error: 'SKU not found' });
  }

  const skuInfo = SKUS[sku];

  // If no payment proof, return 402
  if (!paymentTx) {
    fastify.log.info({ sku }, 'Unpaid request → 402');
    return reply.code(402).send({
      status: 402,
      payment: {
        scheme: 'exact',
        network: 'base',
        asset: 'USDC-US',
        payTo: ROUTER_ADDRESS,
        amount: skuInfo.price,
        memo: `${sku}:unit`
      }
    });
  }

  // Verify payment
  fastify.log.info({ sku, paymentTx }, 'Verifying payment...');
  const verification = await verifyPayment(paymentTx, sku);

  if (!verification.verified) {
    fastify.log.warn({ sku, paymentTx, reason: verification.reason }, 'Payment verification failed');
    return reply.code(402).send({
      status: 402,
      error: 'Payment verification failed',
      reason: verification.reason,
      payment: {
        scheme: 'exact',
        network: 'base',
        asset: 'USDC-US',
        payTo: ROUTER_ADDRESS,
        amount: skuInfo.price,
        memo: `${sku}:unit`
      }
    });
  }

  // Payment verified → stream NDJSON
  fastify.log.info({ sku, paymentTx, verification }, 'Payment verified → streaming');
  
  reply.header('Content-Type', 'application/x-ndjson');
  reply.header('Transfer-Encoding', 'chunked');

  const stream = generateNDJSON(sku);
  for await (const chunk of stream) {
    reply.raw.write(chunk);
  }
  
  reply.raw.end();
});

/**
 * Entitlements endpoint (stub for PR #3)
 */
fastify.get('/ai/entitlements', async (request, reply) => {
  const { buyer } = request.query;
  
  if (!buyer) {
    return reply.code(400).send({ error: 'buyer parameter required' });
  }

  // Note: This endpoint returns empty entitlements for now.
  // Full implementation requires database integration.
  return { buyer, entitlements: [] };
});

/**
 * Receipt endpoint (stub for PR #4)
 */
fastify.get('/ai/receipt/:id', async (request, reply) => {
  const { id } = request.params;

  // Note: This endpoint is a stub.
  // Full implementation requires database integration.
  return reply.code(404).send({ error: 'Receipt not found' });
});

/**
 * Proofs endpoint (stub for PR #5)
 */
fastify.get('/proofs/:id', async (request, reply) => {
  const { id } = request.params;

  // Note: This endpoint is a stub.
  // Full implementation requires Merkle tree integration.
  return reply.code(404).send({ error: 'Proof not found' });
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`BaseBytes x402 API listening on port ${PORT}`);
    fastify.log.info(`Router: ${ROUTER_ADDRESS}`);
    fastify.log.info(`USDC: ${USDC_ADDRESS}`);
    fastify.log.info(`Network: Base Sepolia (${CHAIN_ID})`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
