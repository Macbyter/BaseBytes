#!/usr/bin/env node
/**
 * BaseBytes EAS Schema Registration
 * Registers receipt schema on EAS and updates database
 */

const { ethers } = require('ethers');
const { Pool } = require('pg');

// Configuration
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com';
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020';

// Schema Registry ABI
const SCHEMA_REGISTRY_ABI = [
  'function register(string schema, address resolver, bool revocable) external returns (bytes32)',
  'event Registered(bytes32 indexed uid, address indexed registerer, string schema)'
];

// Receipt schema definition
const RECEIPT_SCHEMA = 'string receiptId,address buyer,address seller,string skuId,uint256 amountUsd6,uint32 units,bytes32 txHash';

async function registerSchema() {
  console.log('=== BaseBytes EAS Schema Registration ===\n');

  if (!PRIVATE_KEY) {
    console.error('❌ TEST_PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable required');
    process.exit(1);
  }

  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const schemaRegistry = new ethers.Contract(SCHEMA_REGISTRY_ADDRESS, SCHEMA_REGISTRY_ABI, wallet);

  console.log(`Registerer: ${wallet.address}`);
  console.log(`Schema Registry: ${SCHEMA_REGISTRY_ADDRESS}`);
  console.log(`Network: Base Sepolia\n`);

  console.log(`Schema: ${RECEIPT_SCHEMA}\n`);

  // Register schema
  console.log('📝 Registering schema on EAS...');
  
  try {
    const tx = await schemaRegistry.register(
      RECEIPT_SCHEMA,
      ethers.ZeroAddress, // No resolver
      true // Revocable
    );

    console.log(`TX submitted: ${tx.hash}`);
    console.log('⏳ Waiting for confirmation...\n');

    const receipt = await tx.wait();

    // Extract schema UID from event
    const event = receipt.logs
      .map(log => {
        try {
          return schemaRegistry.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .find(e => e && e.name === 'Registered');

    if (!event) {
      throw new Error('Registered event not found in transaction receipt');
    }

    const schemaUID = event.args.uid;

    console.log(`✓ Schema registered successfully`);
    console.log(`Schema UID: ${schemaUID}`);
    console.log(`TX: ${tx.hash}`);
    console.log(`Block: ${receipt.blockNumber}\n`);

    // Update database
    console.log('💾 Updating database...');
    const pool = new Pool({ connectionString: DATABASE_URL });

    await pool.query(`
      UPDATE eas_schemas
      SET schema_uid = $1, updated_at = NOW()
      WHERE schema_name = 'basebytes-receipt-v1'
    `, [schemaUID]);

    await pool.end();

    console.log('✓ Database updated\n');
    console.log('=== Registration Complete ===');
    console.log(`\nSchema UID: ${schemaUID}`);
    console.log(`BaseScan: https://sepolia.basescan.org/tx/${tx.hash}`);

  } catch (error) {
    console.error('❌ Registration failed:', error.message);
    if (error.transaction) {
      console.error('TX Hash:', error.transaction.hash);
    }
    process.exit(1);
  }
}

registerSchema();
