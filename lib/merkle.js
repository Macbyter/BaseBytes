/**
 * Merkle Tree Utility for BaseBytes
 * Generates Merkle trees and inclusion proofs for receipts
 */

const { ethers } = require('ethers');

/**
 * Build Merkle tree from receipt hashes
 * @param {string[]} leaves - Array of receipt hashes (keccak256)
 * @returns {Object} - { root, tree, leaves }
 */
function buildMerkleTree(leaves) {
  if (leaves.length === 0) {
    throw new Error('Cannot build Merkle tree from empty leaves');
  }

  // Ensure even number of leaves (duplicate last if odd)
  const paddedLeaves = [...leaves];
  if (paddedLeaves.length % 2 !== 0) {
    paddedLeaves.push(paddedLeaves[paddedLeaves.length - 1]);
  }

  const tree = [paddedLeaves];
  let currentLevel = paddedLeaves;

  // Build tree bottom-up
  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1];
      const parent = ethers.keccak256(
        ethers.concat([left, right].sort()) // Sort for deterministic ordering
      );
      nextLevel.push(parent);
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  return {
    root: currentLevel[0],
    tree,
    leaves: paddedLeaves
  };
}

/**
 * Generate Merkle proof for a leaf
 * @param {Object} merkleTree - Tree from buildMerkleTree()
 * @param {number} leafIndex - Index of leaf to prove
 * @returns {string[]} - Array of sibling hashes (proof)
 */
function generateProof(merkleTree, leafIndex) {
  const { tree, leaves } = merkleTree;
  const proof = [];

  let index = leafIndex;

  // Traverse tree from bottom to top
  for (let level = 0; level < tree.length - 1; level++) {
    const currentLevel = tree[level];
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;

    if (siblingIndex < currentLevel.length) {
      proof.push(currentLevel[siblingIndex]);
    }

    index = Math.floor(index / 2);
  }

  return proof;
}

/**
 * Verify Merkle proof
 * @param {string} leaf - Leaf hash to verify
 * @param {string[]} proof - Proof array from generateProof()
 * @param {string} root - Merkle root
 * @param {number} leafIndex - Index of leaf in tree
 * @returns {boolean} - True if proof is valid
 */
function verifyProof(leaf, proof, root, leafIndex) {
  let computedHash = leaf;
  let index = leafIndex;

  for (const proofElement of proof) {
    const isRightNode = index % 2 === 1;
    
    computedHash = ethers.keccak256(
      ethers.concat(
        isRightNode
          ? [proofElement, computedHash].sort()
          : [computedHash, proofElement].sort()
      )
    );

    index = Math.floor(index / 2);
  }

  return computedHash === root;
}

/**
 * Hash receipt data for Merkle tree
 * @param {Object} receipt - Receipt object
 * @returns {string} - Keccak256 hash
 */
function hashReceipt(receipt) {
  // Ensure addresses are properly formatted
  let buyer = receipt.buyer;
  let seller = receipt.seller;
  
  // If address is too short, pad with zeros
  if (buyer.startsWith('0x') && buyer.length < 42) {
    buyer = buyer + '0'.repeat(42 - buyer.length);
  }
  if (seller.startsWith('0x') && seller.length < 42) {
    seller = seller + '0'.repeat(42 - seller.length);
  }
  
  // Ensure tx_hash is 32 bytes (64 hex chars + 0x)
  let txHash = receipt.tx_hash;
  if (!txHash.startsWith('0x')) {
    txHash = '0x' + txHash;
  }
  // Manually pad to 64 hex characters
  const hexPart = txHash.slice(2).padEnd(64, '0');
  txHash = '0x' + hexPart;
  
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['string', 'address', 'address', 'string', 'uint256', 'uint32', 'bytes32'],
    [
      receipt.receipt_id,
      buyer,
      seller,
      receipt.sku_id,
      receipt.amount_usd6,
      receipt.units,
      txHash
    ]
  );
  return ethers.keccak256(encoded);
}

module.exports = {
  buildMerkleTree,
  generateProof,
  verifyProof,
  hashReceipt
};
