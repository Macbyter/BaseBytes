// connectors/mini-app/payout.js
// USDC payout helper (ethers v6). Supports simulate/live via PAYOUTS_MODE.
'use strict';
const { ethers } = require('ethers');

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

/**
 * Perform or simulate a USDC payout.
 * @param {object} p
 * @param {'live'|'simulate'} p.mode
 * @param {string} p.rpcUrl
 * @param {string} p.signerKey
 * @param {string} p.usdcAddress
 * @param {string} p.to
 * @param {string|number} p.amountUsd  // USD nominal; will be converted using USDC decimals (default 6)
 * @param {number} [p.usdcDecimals]    // optional override; if omitted, fetched on-chain
 * @returns {Promise<{status:string, txHash?:string, amountUSDC?:string, chainId?:string, note?:string}>}
 */
async function sendUsdc({ mode, rpcUrl, signerKey, usdcAddress, to, amountUsd, usdcDecimals }) {
  if (mode !== 'live') {
    return { status:'queued', note:'PAYOUTS_MODE=simulate' };
  }
  if (!rpcUrl || !signerKey || !usdcAddress || !to || !isPositive(amountUsd)) {
    return { status:'error', note:'missing rpc/signer/usdc/to/amountUsd' };
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet   = new ethers.Wallet(signerKey, provider);
  const token    = new ethers.Contract(usdcAddress, ERC20_ABI, wallet);
  const decimals = typeof usdcDecimals === 'number' ? usdcDecimals : await token.decimals();

  const amount = parseToUnits(amountUsd, decimals);
  const balance = await token.balanceOf(await wallet.getAddress());
  if (balance < amount) {
    return { status:'insufficient_funds', note:`have ${balance.toString()} need ${amount.toString()}` };
  }

  const tx = await token.transfer(to, amount);
  const receipt = await tx.wait();
  return {
    status: receipt?.status === 1 ? 'sent' : 'failed',
    txHash: tx.hash,
    amountUSDC: amount.toString(),
    chainId: String((await provider.getNetwork()).chainId)
  };
}

function isPositive(x){ const n = Number(x); return Number.isFinite(n) && n > 0; }

/**
 * SECURITY FIX: Use ethers.parseUnits for precision-safe conversion
 * Avoids floating-point rounding errors for large amounts
 */
function parseToUnits(usd, decimals=6) {
  try {
    // Convert to string to preserve precision
    const usdStr = String(usd);
    // Use ethers.parseUnits for bigint-safe decimal parsing
    return ethers.parseUnits(usdStr, decimals);
  } catch (e) {
    // Fallback for invalid input
    return BigInt(0);
  }
}

module.exports = { sendUsdc };
