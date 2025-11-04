#!/usr/bin/env node
/**
 * send-eth.js — EIP-1559 self-transaction helper for Base Sepolia
 * 
 * Usage:
 *   node scripts/send-eth.js --rpc <url> --key <0xprivatekey> [options]
 * 
 * Options:
 *   --rpc <url>        RPC endpoint URL (required)
 *   --key <0xpk>       Private key with 0x prefix (required)
 *   --to <address>     Recipient address (default: self)
 *   --amount <eth>     Amount in ETH to send (default: 0)
 *   --dry              Dry-run mode (simulate without broadcasting)
 * 
 * Examples:
 *   # Dry run (no broadcast)
 *   node scripts/send-eth.js --rpc $RPC_URL --key $PRIVATE_KEY --dry
 * 
 *   # Send 0 ETH to self (actual transaction)
 *   node scripts/send-eth.js --rpc $RPC_URL --key $PRIVATE_KEY
 * 
 *   # Send 0.001 ETH to specific address
 *   node scripts/send-eth.js --rpc $RPC_URL --key $PRIVATE_KEY --to 0x... --amount 0.001
 */

const { JsonRpcProvider, Wallet, parseEther, formatEther } = require('ethers');
const fs = require('fs');
const path = require('path');

// Base Sepolia chain ID
const EXPECTED_CHAIN_ID = 0x14a34; // 84532 decimal
const EXPECTED_CHAIN_ID_HEX = '0x14a34';

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    rpc: null,
    key: null,
    to: null,
    amount: '0',
    dry: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--rpc':
        parsed.rpc = args[++i];
        break;
      case '--key':
        parsed.key = args[++i];
        break;
      case '--to':
        parsed.to = args[++i];
        break;
      case '--amount':
        parsed.amount = args[++i];
        break;
      case '--dry':
        parsed.dry = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }

  // Validate required args
  if (!parsed.rpc) {
    console.error('Error: --rpc is required');
    printUsage();
    process.exit(1);
  }

  if (!parsed.key) {
    console.error('Error: --key is required');
    printUsage();
    process.exit(1);
  }

  // Validate private key format
  if (!parsed.key.startsWith('0x') || parsed.key.length !== 66) {
    console.error('Error: --key must be a 0x-prefixed 64-character hex string');
    process.exit(1);
  }

  return parsed;
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Usage: node scripts/send-eth.js --rpc <url> --key <0xprivatekey> [options]

Options:
  --rpc <url>        RPC endpoint URL (required)
  --key <0xpk>       Private key with 0x prefix (required)
  --to <address>     Recipient address (default: self)
  --amount <eth>     Amount in ETH to send (default: 0)
  --dry              Dry-run mode (simulate without broadcasting)

Examples:
  node scripts/send-eth.js --rpc $RPC_URL --key $PRIVATE_KEY --dry
  node scripts/send-eth.js --rpc $RPC_URL --key $PRIVATE_KEY --amount 0.001
`);
}

/**
 * Mask sensitive data for logging
 */
function maskAddress(addr) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function maskHash(hash) {
  if (!hash || hash.length < 10) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

/**
 * Main execution
 */
async function main() {
  const args = parseArgs();

  console.log('🚀 BaseBytes EIP-1559 Transaction Helper\n');
  console.log(`Mode: ${args.dry ? '🧪 DRY RUN (simulation only)' : '⚡ LIVE (will broadcast)'}`);
  console.log(`RPC: ${args.rpc}`);
  console.log(`Amount: ${args.amount} ETH\n`);

  // Initialize provider with explicit chain ID
  const provider = new JsonRpcProvider(args.rpc, {
    chainId: EXPECTED_CHAIN_ID,
    name: 'base-sepolia'
  });

  // Verify chain ID
  console.log('🔍 Verifying chain ID...');
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const chainIdHex = `0x${chainId.toString(16)}`;

  console.log(`   Chain ID: ${chainId} (${chainIdHex})`);

  if (chainId !== EXPECTED_CHAIN_ID) {
    console.error(`\n❌ Chain ID mismatch!`);
    console.error(`   Expected: ${EXPECTED_CHAIN_ID} (${EXPECTED_CHAIN_ID_HEX})`);
    console.error(`   Got: ${chainId} (${chainIdHex})`);
    console.error(`\n⚠️  This script is configured for Base Sepolia only.`);
    process.exit(1);
  }

  console.log('   ✅ Chain ID verified: Base Sepolia\n');

  // Initialize wallet
  const wallet = new Wallet(args.key, provider);
  const fromAddress = wallet.address;
  const toAddress = args.to || fromAddress;

  console.log(`From: ${maskAddress(fromAddress)}`);
  console.log(`To: ${maskAddress(toAddress)}`);

  // Check balance
  const balance = await provider.getBalance(fromAddress);
  console.log(`Balance: ${formatEther(balance)} ETH\n`);

  // Parse amount
  const amountWei = parseEther(args.amount);

  if (balance < amountWei) {
    console.error(`❌ Insufficient balance!`);
    console.error(`   Required: ${args.amount} ETH`);
    console.error(`   Available: ${formatEther(balance)} ETH`);
    process.exit(1);
  }

  // Build EIP-1559 transaction (type 2)
  console.log('📝 Building EIP-1559 transaction...');

  const feeData = await provider.getFeeData();
  
  const tx = {
    type: 2, // EIP-1559
    to: toAddress,
    value: amountWei,
    chainId: EXPECTED_CHAIN_ID,
    maxFeePerGas: feeData.maxFeePerGas,
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
  };

  // Estimate gas
  console.log('⛽ Estimating gas...');
  try {
    const gasEstimate = await provider.estimateGas({
      from: fromAddress,
      to: tx.to,
      value: tx.value,
    });
    tx.gasLimit = gasEstimate;
    console.log(`   Gas limit: ${gasEstimate.toString()}`);
  } catch (error) {
    console.error(`❌ Gas estimation failed: ${error.message}`);
    process.exit(1);
  }

  // Calculate max cost
  const maxCost = (tx.gasLimit * tx.maxFeePerGas) + amountWei;
  console.log(`   Max fee: ${formatEther(tx.gasLimit * tx.maxFeePerGas)} ETH`);
  console.log(`   Max cost: ${formatEther(maxCost)} ETH\n`);

  // Prepare transaction summary
  const txSummary = {
    timestamp: new Date().toISOString(),
    mode: args.dry ? 'dry-run' : 'live',
    network: {
      name: 'base-sepolia',
      chainId: chainId,
      chainIdHex: chainIdHex
    },
    from: fromAddress,
    to: toAddress,
    value: args.amount,
    valueWei: amountWei.toString(),
    gasLimit: tx.gasLimit.toString(),
    maxFeePerGas: tx.maxFeePerGas.toString(),
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas.toString(),
    maxCostEth: formatEther(maxCost),
    balance: formatEther(balance)
  };

  if (args.dry) {
    // Dry run: print masked JSON
    console.log('📋 Transaction Summary (DRY RUN):\n');
    const maskedSummary = {
      ...txSummary,
      from: maskAddress(txSummary.from),
      to: maskAddress(txSummary.to)
    };
    console.log(JSON.stringify(maskedSummary, null, 2));
    console.log('\n✅ Dry run complete. No transaction was broadcast.');
    return;
  }

  // Live mode: send transaction
  console.log('📡 Broadcasting transaction...');
  
  try {
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`   Transaction hash: ${maskHash(txResponse.hash)}`);
    console.log(`   Waiting for confirmation...\n`);

    // Wait for 1 confirmation
    const receipt = await txResponse.wait(1);

    console.log('✅ Transaction confirmed!\n');

    // Prepare full transaction data
    const txData = {
      ...txSummary,
      mode: 'live',
      transaction: {
        hash: txResponse.hash,
        nonce: txResponse.nonce,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.gasPrice ? receipt.gasPrice.toString() : receipt.effectiveGasPrice.toString(),
        status: receipt.status,
        confirmations: 1
      },
      explorer: {
        tx: `https://sepolia.basescan.org/tx/${txResponse.hash}`,
        address: `https://sepolia.basescan.org/address/${fromAddress}`
      }
    };

    // Save to diagnostics (ignored by git)
    const diagnosticsDir = path.join(__dirname, '..', 'diagnostics');
    if (!fs.existsSync(diagnosticsDir)) {
      fs.mkdirSync(diagnosticsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `tx_${timestamp}.json`;
    const filepath = path.join(diagnosticsDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(txData, null, 2));
    console.log(`💾 Full transaction data saved: diagnostics/${filename}\n`);

    // Print explorer link
    console.log('🔗 View on BaseScan:');
    console.log(`   ${txData.explorer.tx}\n`);

    // Print masked summary to stdout
    console.log('📋 Transaction Summary:\n');
    const maskedOutput = {
      hash: maskHash(txResponse.hash),
      from: maskAddress(fromAddress),
      to: maskAddress(toAddress),
      value: `${args.amount} ETH`,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber,
      status: receipt.status === 1 ? 'success' : 'failed',
      explorer: txData.explorer.tx
    };
    console.log(JSON.stringify(maskedOutput, null, 2));

  } catch (error) {
    console.error(`\n❌ Transaction failed: ${error.message}`);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main().catch(error => {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, maskAddress, maskHash };
