#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { JsonRpcProvider, Wallet, formatUnits, parseUnits } = require('ethers');
const {
  ensureChainId,
  extractErrorMessage,
  maskHex,
  parseCliArgs,
  pickInput,
  resolveExpectedChainId,
  shouldAllowChainMismatch,
  timestampForDiagnostics
} = require('./utils');

const { positionals, flags } = parseCliArgs(process.argv.slice(2));

let rpcUrl;
let privateKey;

try {
  rpcUrl = pickInput({
    envKey: 'RPC_URL',
    flagKeys: ['rpc', 'rpc-url', 'url', 'provider'],
    flags,
    positionals,
    positionalTest: (value) => typeof value === 'string' && /^(https?:|wss?:)/i.test(value),
    name: 'RPC_URL environment variable, --rpc flag, or positional RPC URL argument'
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

try {
  privateKey = pickInput({
    envKey: 'PRIVATE_KEY',
    flagKeys: ['key', 'private-key', 'pk'],
    flags,
    positionals,
    positionalTest: (value) => /^0x[0-9a-fA-F]{64}$/.test(value),
    name: 'PRIVATE_KEY environment variable, --key flag, or positional private key argument'
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const toOverride = pickInput({
  envKey: 'SELF_TX_TO',
  flagKeys: ['to', 'to-address', 'recipient'],
  flags,
  positionals,
  positionalTest: (value) => /^0x[0-9a-fA-F]{40}$/.test(value),
  optional: true
});

const valueInput = pickInput({
  envKey: 'SELF_TX_VALUE',
  flagKeys: ['value', 'amount', 'eth'],
  flags,
  positionals,
  positionalTest: (value) => {
    if (typeof value !== 'string') {
      return false;
    }
    if (/^0x[0-9a-fA-F]{64}$/.test(value)) {
      return false;
    }
    if (/^(https?:|wss?:)/i.test(value)) {
      return false;
    }
    return /^-?\d+(\.\d+)?$/.test(value.trim());
  },
  optional: true
});

let valueWei;
try {
  valueWei = parseUnits(valueInput || '0', 'ether');
} catch (error) {
  console.error(`Invalid value amount: ${extractErrorMessage(error)}`);
  process.exit(1);
}

const expectedChainId = resolveExpectedChainId({ flags });
const allowMismatch = shouldAllowChainMismatch({ flags });

const confirmationsInput = process.env.TX_CONFIRMATIONS || flags.confirmations;
const confirmations = Number.isFinite(Number(confirmationsInput)) && Number(confirmationsInput) >= 0
  ? Number(confirmationsInput)
  : 1;

const diagnosticsDir = path.join(process.cwd(), 'diagnostics');

(async () => {
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const reportedChainId = await provider.send('eth_chainId', []);
    const chainId = ensureChainId(reportedChainId, expectedChainId, { allowMismatch });

    if (allowMismatch && chainId !== expectedChainId) {
      console.warn(`Connected chain id ${chainId} differs from expected ${expectedChainId}, proceeding anyway.`);
    }

    const wallet = new Wallet(privateKey, provider);
    const from = await wallet.getAddress();
    const to = toOverride || from;

    const feeData = await provider.getFeeData();
    const tip = feeData.maxPriorityFeePerGas ?? parseUnits('1.5', 'gwei');
    const base = feeData.maxFeePerGas ?? feeData.gasPrice ?? parseUnits('2', 'gwei');
    const max = base * 2n;

    const nonce = await provider.getTransactionCount(from, 'pending');

    let gasLimit = 21000n;
    try {
      gasLimit = await provider.estimateGas({ from, to: from, value: 0 });
    } catch (estimateError) {
      console.warn(`Gas estimation failed, using default 21000: ${extractErrorMessage(estimateError)}`);
    }

    const tx = {
      to,
      value: valueWei,
      type: 2,
      maxPriorityFeePerGas: tip,
      maxFeePerGas: max,
      gasLimit,
      nonce
    };

    const response = await wallet.sendTransaction(tx);
    const receipt = await response.wait(confirmations);

    const now = timestampForDiagnostics();
    const filePath = path.join(diagnosticsDir, `tx_${now}.json`);

    const output = {
      phase: 'self-tx',
      network: chainId,
      from: maskHex(from),
      to: maskHex(to),
      value_wei: valueWei.toString(),
      value_eth: formatUnits(valueWei, 'ether'),
      gas_limit: gasLimit.toString(),
      max_fee_gwei: Number(formatUnits(max, 'gwei')).toFixed(2),
      max_priority_gwei: Number(formatUnits(tip, 'gwei')).toFixed(2),
      tx_hash: maskHex(response.hash),
      tx_hash_full: response.hash,
      block: receipt?.blockNumber ?? null,
      status: receipt?.status === 1 ? 'OK' : (receipt?.status === 0 ? 'FAILED' : 'PENDING')
    };

    fs.mkdirSync(diagnosticsDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2));

    console.log(JSON.stringify({
      status: output.status,
      explorer: `https://sepolia.basescan.org/tx/${output.tx_hash_full}`,
      saved: path.relative(process.cwd(), filePath)
    }));
  } catch (error) {
    console.error(JSON.stringify({
      status: 'ERROR',
      reason: extractErrorMessage(error).slice(0, 200)
    }));
    process.exit(1);
  }
})();
