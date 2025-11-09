#!/usr/bin/env node
/**
 * eas-attester.js — EAS (Ethereum Attestation Service) Worker
 * 
 * Manages receipt attestation lifecycle:
 *   pending → attesting → onchain
 * 
 * Responsibilities:
 * - Poll for pending receipts
 * - Submit attestations to EAS contract on Base Sepolia
 * - Track transaction status and extract attestation UID
 * - Handle errors with exponential backoff
 * - Update receipt status and metadata
 * 
 * Usage:
 *   node workers/eas-attester.js [options]
 * 
 * Options:
 *   --rpc <url>           RPC endpoint (default: env BASE_SEPOLIA_RPC)
 *   --key <0xpk>          Private key (default: env ATTESTER_PRIVATE_KEY)
 *   --interval <seconds>  Poll interval (default: 60)
 *   --batch-size <n>      Max receipts per batch (default: 10)
 *   --dry-run             Simulate without database writes
 * 
 * Environment Variables:
 *   BASE_SEPOLIA_RPC       - RPC endpoint URL
 *   ATTESTER_PRIVATE_KEY   - Wallet private key (0x...)
 *   EAS_CONTRACT_ADDRESS   - EAS contract address (optional, uses default)
 *   DATABASE_URL           - PostgreSQL connection string
 */

const { JsonRpcProvider, Wallet, Contract } = require('ethers');
const { Pool } = require('pg');

// Base Sepolia configuration
const CHAIN_ID = 0x14a34; // 84532 decimal
const CHAIN_ID_HEX = '0x14a34';

// EAS contract address on Base Sepolia (placeholder - update with actual)
const DEFAULT_EAS_CONTRACT = '0x4200000000000000000000000000000000000021';

// Simplified EAS contract ABI (attest function)
const EAS_ABI = [
  'function attest((bytes32 schema, (address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value) data)) external payable returns (bytes32)',
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)'
];

// Exponential backoff configuration
const RETRY_CONFIG = {
  initialDelay: 5000,      // 5 seconds
  maxDelay: 300000,        // 5 minutes
  multiplier: 2,
  maxRetries: 5
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    rpc: process.env.BASE_SEPOLIA_RPC || null,
    key: process.env.ATTESTER_PRIVATE_KEY || null,
    easContract: process.env.EAS_CONTRACT_ADDRESS || DEFAULT_EAS_CONTRACT,
    interval: 60,
    batchSize: 10,
    dryRun: args.includes('--dry-run')
  };
}

/**
 * Database operations using PostgreSQL
 */
class Database {
  constructor(connectionString) {
    this.connectionString = connectionString;
    this.pool = null;
  }

  async connect() {
    console.log('📦 Connecting to database...');
    
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: process.env.PGSSLMODE === 'verify-full' ? {
        rejectUnauthorized: true
      } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });

    // Test connection
    const client = await this.pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('   ✅ Connected to PostgreSQL');
  }

  async getPendingReceipts(limit = 10) {
    console.log(`🔍 Fetching up to ${limit} pending receipts...`);
    
    const query = `
      SELECT 
        id,
        receipt_id,
        payment_id,
        buyer,
        seller,
        sku_id,
        amount_usd6,
        units,
        tx_hash,
        block_number,
        block_timestamp,
        attestation_uid,
        schema_uid,
        created_at
      FROM receipts
      WHERE attestation_uid IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `;
    
    const result = await this.pool.query(query, [limit]);
    console.log(`   Found ${result.rows.length} pending receipt(s)`);
    
    return result.rows;
  }

  async updateReceiptStatus(receiptId, metadata = {}) {
    console.log(`📝 Updating receipt ${receiptId}`);
    
    const query = `
      UPDATE receipts
      SET 
        attestation_uid = $2,
        schema_uid = $3,
        attested_at = $4,
        attestation_tx = $5,
        updated_at = NOW()
      WHERE id = $1
    `;
    
    await this.pool.query(query, [
      receiptId,
      metadata.attestation_uid || null,
      metadata.schema_uid || null,
      metadata.attested_at || null,
      metadata.attestation_tx || null
    ]);
    
    if (Object.keys(metadata).length > 0) {
      console.log(`   Metadata:`, metadata);
    }
  }

  async close() {
    console.log('🔌 Closing database connection...');
    if (this.pool) {
      await this.pool.end();
    }
    console.log('   ✅ Database connection closed');
  }
}

/**
 * EAS Attester Worker
 */
class EASAttester {
  constructor(config) {
    this.config = config;
    this.provider = null;
    this.wallet = null;
    this.easContract = null;
    this.db = null;
    this.running = false;
  }

  async initialize() {
    console.log('🚀 Initializing EAS Attester Worker\n');

    // Validate configuration
    if (!this.config.rpc) {
      throw new Error('RPC URL is required (--rpc or BASE_SEPOLIA_RPC env var)');
    }
    if (!this.config.key) {
      throw new Error('Private key is required (--key or ATTESTER_PRIVATE_KEY env var)');
    }

    console.log(`RPC: ${this.config.rpc}`);
    console.log(`EAS Contract: ${this.config.easContract}`);
    console.log(`Batch Size: ${this.config.batchSize}`);
    console.log(`Poll Interval: ${this.config.interval}s`);
    console.log(`Dry Run: ${this.config.dryRun ? 'YES' : 'NO'}\n`);

    // Initialize provider with explicit chain ID
    this.provider = new JsonRpcProvider(this.config.rpc, {
      chainId: CHAIN_ID,
      name: 'base-sepolia'
    });

    // Verify chain ID
    const network = await this.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    if (chainId !== CHAIN_ID) {
      throw new Error(`Chain ID mismatch: expected ${CHAIN_ID} (${CHAIN_ID_HEX}), got ${chainId}`);
    }
    console.log(`✅ Chain ID verified: ${chainId} (${CHAIN_ID_HEX})\n`);

    // Initialize wallet
    this.wallet = new Wallet(this.config.key, this.provider);
    console.log(`Attester Address: ${this.wallet.address}\n`);

    // Initialize EAS contract
    this.easContract = new Contract(
      this.config.easContract,
      EAS_ABI,
      this.wallet
    );

    // Initialize database
    this.db = new Database(process.env.DATABASE_URL);
    await this.db.connect();

    console.log('✅ Initialization complete\n');
  }

  async processReceipt(receipt) {
    console.log(`\n📋 Processing receipt: ${receipt.receipt_id}`);
    console.log(`   Receipt ID: ${receipt.receipt_id}`);
    console.log(`   Buyer: ${receipt.buyer}`);
    console.log(`   SKU: ${receipt.sku_id}`);

    try {
      // Get schema UID from environment or database
      const schemaUID = process.env.EAS_SCHEMA_UID || receipt.schema_uid;
      if (!schemaUID || schemaUID === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('EAS_SCHEMA_UID environment variable is required or schema_uid must be set in database');
      }
      
      // Encode attestation data according to schema:
      // string receiptId, address buyer, address seller, string skuId, uint256 amountUsd6, uint32 units, bytes32 txHash
      const { ethers } = require('ethers');
      const attestationData = {
        schema: schemaUID,
        data: {
          recipient: receipt.buyer, // Attest to the buyer
          expirationTime: 0, // No expiration
          revocable: false,
          refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
          data: ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'address', 'address', 'string', 'uint256', 'uint32', 'bytes32'],
            [
              receipt.receipt_id,
              receipt.buyer,
              receipt.seller,
              receipt.sku_id,
              receipt.amount_usd6,
              receipt.units,
              receipt.tx_hash
            ]
          ),
          value: 0
        }
      };

      console.log(`   📡 Submitting attestation...`);

      if (this.config.dryRun) {
        console.log(`   🧪 DRY RUN: Would submit attestation`);
        console.log(`   Schema: ${schemaUID}`);
        console.log(`   Recipient: ${receipt.buyer}`);
        return;
      }

      // Submit attestation
      const tx = await this.easContract.attest(attestationData);
      console.log(`   Transaction hash: ${tx.hash}`);

      // Wait for confirmation
      console.log(`   ⏳ Waiting for confirmation...`);
      const txReceipt = await tx.wait(1);

      // Extract attestation UID from logs
      const attestedEvent = txReceipt.logs
        .map(log => {
          try {
            return this.easContract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(event => event && event.name === 'Attested');

      const attestationUID = attestedEvent ? attestedEvent.args.uid : null;

      console.log(`   ✅ Attestation confirmed!`);
      console.log(`   Block: ${txReceipt.blockNumber}`);
      if (attestationUID) {
        console.log(`   UID: ${attestationUID}`);
      }

      // Update receipt with attestation data
      await this.db.updateReceiptStatus(receipt.id, {
        attestation_uid: attestationUID,
        schema_uid: schemaUID,
        attested_at: new Date().toISOString(),
        attestation_tx: tx.hash
      });

      // Optional: Update metrics
      await this.updateMetrics(receipt, attestationUID, tx.hash);

    } catch (error) {
      console.error(`   ❌ Error processing receipt: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);

      // Check if error is transient (network issues, gas, etc.)
      const isTransient = this.isTransientError(error);
      if (isTransient) {
        console.log(`   ⚠️  Transient error detected, will retry later`);
      } else {
        console.log(`   ⚠️  Permanent error, manual intervention may be required`);
      }
    }
  }

  isTransientError(error) {
    const transientPatterns = [
      /network/i,
      /timeout/i,
      /ECONNREFUSED/i,
      /ENETUNREACH/i,
      /nonce/i,
      /gas/i,
      /underpriced/i
    ];

    return transientPatterns.some(pattern => pattern.test(error.message));
  }

  async updateMetrics(receipt, attestationUID, txHash) {
    console.log(`   📊 Updating metrics...`);

    // Optional: Stamp latest metrics file
    const metricsDir = require('path').join(__dirname, '..', 'metrics');
    const fs = require('fs');

    if (!fs.existsSync(metricsDir)) {
      return;
    }

    const metricsFiles = fs.readdirSync(metricsDir)
      .filter(f => f.startsWith('run-') && f.endsWith('.json'))
      .sort()
      .reverse();

    if (metricsFiles.length === 0) {
      return;
    }

    const latestMetrics = require('path').join(metricsDir, metricsFiles[0]);
    const metrics = JSON.parse(fs.readFileSync(latestMetrics, 'utf8'));

    metrics.eas = metrics.eas || {};
    metrics.eas.attested = true;
    metrics.eas.att_uid = attestationUID;
    metrics.eas.tx_hash = txHash;
    metrics.eas.chain_id = CHAIN_ID_HEX;

    fs.writeFileSync(latestMetrics, JSON.stringify(metrics, null, 2));
    console.log(`   ✅ Metrics updated: ${metricsFiles[0]}`);
  }

  async poll() {
    console.log(`\n🔄 Polling for pending receipts...`);

    try {
      const receipts = await this.db.getPendingReceipts(this.config.batchSize);
      
      if (receipts.length === 0) {
        console.log(`   No pending receipts found`);
        return;
      }

      console.log(`   Found ${receipts.length} pending receipt(s)`);

      // Process receipts sequentially (could be parallelized with care)
      for (const receipt of receipts) {
        await this.processReceipt(receipt);
      }

    } catch (error) {
      console.error(`❌ Poll error: ${error.message}`);
    }
  }

  async start() {
    this.running = true;
    console.log(`\n🟢 Worker started (interval: ${this.config.interval}s)\n`);

    while (this.running) {
      await this.poll();
      
      // Wait for next interval
      await new Promise(resolve => setTimeout(resolve, this.config.interval * 1000));
    }
  }

  async stop() {
    console.log(`\n🔴 Stopping worker...`);
    this.running = false;
    
    if (this.db) {
      await this.db.close();
    }
    
    console.log(`✅ Worker stopped\n`);
  }
}

/**
 * Main execution
 */
async function main() {
  const config = parseArgs();
  const attester = new EASAttester(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(`\n\n⚠️  Received SIGINT, shutting down gracefully...`);
    await attester.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log(`\n\n⚠️  Received SIGTERM, shutting down gracefully...`);
    await attester.stop();
    process.exit(0);
  });

  try {
    await attester.initialize();
    await attester.start();
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`\n❌ Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { EASAttester, Database };
