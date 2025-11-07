#!/usr/bin/env node
/**
 * BaseBytes Payment Indexer
 * Ingests PaymentReceived events from Router contract on Base Sepolia
 * Upserts payments, grants entitlements, increments balances (idempotent)
 */

const { ethers } = require('ethers');
const { Pool } = require('pg');

// Environment configuration
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS || '0xF0a998d1cA93def52e2eA9929a20fEe8a644551c';
const DATABASE_URL = process.env.DATABASE_URL;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '12000'); // 12s (Base block time)
const START_BLOCK = parseInt(process.env.START_BLOCK || '0');

// Router ABI
const ROUTER_ABI = [
  'event PaymentReceived(address indexed buyer, address indexed seller, bytes32 indexed skuId, uint96 amountUsd6, uint32 units, uint8 rights)'
];

// Database connection
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Provider and contract
const provider = new ethers.JsonRpcProvider(RPC_URL);
const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider);

// State tracking
let lastProcessedBlock = START_BLOCK;
let isProcessing = false;

/**
 * Initialize database tables (temporary - will be replaced by migrations in PR #3)
 */
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        block_number INTEGER NOT NULL,
        block_timestamp INTEGER NOT NULL,
        buyer TEXT NOT NULL,
        seller TEXT NOT NULL,
        sku_id TEXT NOT NULL,
        amount_usd6 BIGINT NOT NULL,
        units INTEGER NOT NULL,
        rights INTEGER NOT NULL,
        indexed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tx_hash, log_index)
      )
    `);

    // Entitlements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS entitlements (
        id SERIAL PRIMARY KEY,
        buyer TEXT NOT NULL,
        sku_id TEXT NOT NULL,
        units_remaining INTEGER NOT NULL,
        units_purchased INTEGER NOT NULL,
        first_purchase_at TIMESTAMP DEFAULT NOW(),
        last_purchase_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(buyer, sku_id)
      )
    `);

    // Balances table
    await client.query(`
      CREATE TABLE IF NOT EXISTS balances (
        id SERIAL PRIMARY KEY,
        seller TEXT NOT NULL UNIQUE,
        total_earned_usd6 BIGINT DEFAULT 0,
        total_units_sold INTEGER DEFAULT 0,
        last_sale_at TIMESTAMP
      )
    `);

    // Indexer state table
    await client.query(`
      CREATE TABLE IF NOT EXISTS indexer_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        last_processed_block INTEGER NOT NULL,
        last_processed_at TIMESTAMP DEFAULT NOW(),
        CHECK (id = 1)
      )
    `);

    // Initialize state if not exists
    await client.query(`
      INSERT INTO indexer_state (id, last_processed_block)
      VALUES (1, $1)
      ON CONFLICT (id) DO NOTHING
    `, [START_BLOCK]);

    // Load last processed block
    const result = await client.query('SELECT last_processed_block FROM indexer_state WHERE id = 1');
    if (result.rows.length > 0) {
      lastProcessedBlock = result.rows[0].last_processed_block;
    }

    console.log('✓ Database initialized');
    console.log(`✓ Last processed block: ${lastProcessedBlock}`);
  } finally {
    client.release();
  }
}

/**
 * Process a single PaymentReceived event
 * Idempotent on (tx_hash, log_index)
 */
async function processPayment(event, block) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      buyer,
      seller,
      skuId,
      amountUsd6,
      units,
      rights
    } = event.args;

    const txHash = event.transactionHash;
    const logIndex = event.index;
    const blockNumber = event.blockNumber;
    const blockTimestamp = block.timestamp;

    // Convert skuId (bytes32) to string
    // Handle non-UTF8 bytes32 by using hex representation
    let skuIdString;
    try {
      skuIdString = ethers.toUtf8String(skuId).replace(/\0/g, '');
    } catch (e) {
      // If not valid UTF-8, use hex representation
      skuIdString = skuId;
    }

    // 1. Insert payment (idempotent via UNIQUE constraint)
    const paymentResult = await client.query(`
      INSERT INTO payments (
        tx_hash, log_index, block_number, block_timestamp,
        buyer, seller, sku_id, amount_usd6, units, rights
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (tx_hash, log_index) DO NOTHING
      RETURNING id
    `, [
      txHash,
      logIndex,
      blockNumber,
      blockTimestamp,
      buyer.toLowerCase(),
      seller.toLowerCase(),
      skuIdString,
      amountUsd6.toString(),
      units,
      rights
    ]);

    // If payment already processed, skip entitlement/balance updates
    if (paymentResult.rows.length === 0) {
      await client.query('COMMIT');
      return { status: 'duplicate', txHash, logIndex };
    }

    // 2. Grant entitlement (upsert)
    await client.query(`
      INSERT INTO entitlements (buyer, sku_id, units_remaining, units_purchased, first_purchase_at, last_purchase_at)
      VALUES ($1, $2, $3, $3, NOW(), NOW())
      ON CONFLICT (buyer, sku_id) DO UPDATE SET
        units_remaining = entitlements.units_remaining + $3,
        units_purchased = entitlements.units_purchased + $3,
        last_purchase_at = NOW()
    `, [buyer.toLowerCase(), skuIdString, units]);

    // 3. Increment seller balance (upsert)
    await client.query(`
      INSERT INTO balances (seller, total_earned_usd6, total_units_sold, last_sale_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (seller) DO UPDATE SET
        total_earned_usd6 = balances.total_earned_usd6 + $2,
        total_units_sold = balances.total_units_sold + $3,
        last_sale_at = NOW()
    `, [seller.toLowerCase(), amountUsd6.toString(), units]);

    await client.query('COMMIT');

    return {
      status: 'processed',
      txHash,
      logIndex,
      buyer,
      seller,
      skuId: skuIdString,
      amount: amountUsd6.toString(),
      units
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update last processed block in database
 */
async function updateLastProcessedBlock(blockNumber) {
  await pool.query(`
    UPDATE indexer_state
    SET last_processed_block = $1, last_processed_at = NOW()
    WHERE id = 1
  `, [blockNumber]);
  lastProcessedBlock = blockNumber;
}

/**
 * Poll for new events
 */
async function pollEvents() {
  if (isProcessing) {
    console.log('⏭️  Skipping poll (already processing)');
    return;
  }

  isProcessing = true;

  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = lastProcessedBlock + 1;
    const toBlock = Math.min(fromBlock + 999, currentBlock); // Max 1000 blocks per query

    if (fromBlock > currentBlock) {
      console.log(`⏸️  No new blocks (current: ${currentBlock})`);
      isProcessing = false;
      return;
    }

    console.log(`🔍 Scanning blocks ${fromBlock} → ${toBlock} (current: ${currentBlock})`);

    // Query events
    const filter = router.filters.PaymentReceived();
    const events = await router.queryFilter(filter, fromBlock, toBlock);

    if (events.length === 0) {
      console.log(`✓ No events found`);
      await updateLastProcessedBlock(toBlock);
      isProcessing = false;
      return;
    }

    console.log(`📥 Found ${events.length} payment(s)`);

    // Process each event
    for (const event of events) {
      const block = await provider.getBlock(event.blockNumber);
      const result = await processPayment(event, block);

      if (result.status === 'processed') {
        console.log(`✓ Processed: ${result.buyer} → ${result.skuId} (${result.units} units, ${result.amount} USDC)`);
      } else {
        console.log(`⏭️  Duplicate: ${result.txHash}:${result.logIndex}`);
      }
    }

    await updateLastProcessedBlock(toBlock);
    console.log(`✓ Updated last processed block: ${toBlock}`);
  } catch (error) {
    console.error('❌ Error polling events:', error.message);
  } finally {
    isProcessing = false;
  }
}

/**
 * Main loop
 */
async function main() {
  console.log('=== BaseBytes Payment Indexer ===');
  console.log(`Router: ${ROUTER_ADDRESS}`);
  console.log(`Network: Base Sepolia`);
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Poll interval: ${POLL_INTERVAL}ms`);
  console.log('');

  // Initialize database
  await initDatabase();

  // Start polling
  console.log('🚀 Starting event polling...\n');
  setInterval(pollEvents, POLL_INTERVAL);

  // Initial poll
  await pollEvents();
}

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...');
  await pool.end();
  process.exit(0);
});

// Start
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
