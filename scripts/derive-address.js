#!/usr/bin/env node
'use strict';

const { Wallet } = require('ethers');
const { parseCliArgs, pickInput } = require('./utils');

const { positionals, flags } = parseCliArgs(process.argv.slice(2));

let privateKey;
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

try {
  const wallet = new Wallet(privateKey);
  console.log(wallet.address);
} catch (error) {
  console.error(`Failed to derive address: ${error.message}`);
  process.exit(1);
}
