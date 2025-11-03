#!/usr/bin/env node
'use strict';

const { JsonRpcProvider } = require('ethers');
const {
  ensureChainId,
  extractErrorMessage,
  parseCliArgs,
  pickInput,
  resolveExpectedChainId,
  shouldAllowChainMismatch
} = require('./utils');

const { positionals, flags } = parseCliArgs(process.argv.slice(2));

let rpcUrl;
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

const expectedChainId = resolveExpectedChainId({ flags });
const allowMismatch = shouldAllowChainMismatch({ flags });

(async () => {
  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const chainIdHex = await provider.send('eth_chainId', []);
    const normalizedChainId = ensureChainId(chainIdHex, expectedChainId, { allowMismatch });

    const output = {
      chainId: normalizedChainId,
      expectedChainId
    };

    if (allowMismatch && normalizedChainId !== expectedChainId) {
      output.note = 'Chain id mismatch allowed by configuration';
    }

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(`Failed to query chain id: ${extractErrorMessage(error)}`);
    process.exit(1);
  }
})();
