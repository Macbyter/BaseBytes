import { Hex, Address, parseUnits, keccak256, toHex } from 'viem'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'

export type Payment = {
  network: 'base' | 'base-sepolia'
  asset: 'USDC-US'
  payTo: Address
  amount: string   // decimal USD in USDC(6)
  memo?: string    // "sku:unit"
}

const ROUTER_ABI = [
  {
    name: 'purchase',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'skuId', type: 'bytes32' },
      { name: 'amountUsd6', type: 'uint256' }
    ],
    outputs: []
  }
] as const

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const

export function usePayNow(usdcAddress: Address) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  async function purchase(payment: Payment): Promise<Hex> {
    if (!walletClient) throw new Error('Wallet not connected')
    if (!address) throw new Error('No address')
    if (!publicClient) throw new Error('No public client')

    const amount6 = parseUnits(payment.amount, 6)

    // Check allowance and approve if needed
    const allowance = await publicClient.readContract({
      address: usdcAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address, payment.payTo]
    })

    if (allowance < amount6) {
      const approveHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [payment.payTo, amount6]
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
    }

    // Call Router.purchase(bytes32 skuId, uint256 amountUsd6)
    const skuId = toBytes32(payment.memo || 'basebytes:sku')
    const hash = await walletClient.writeContract({
      address: payment.payTo,
      abi: ROUTER_ABI,
      functionName: 'purchase',
      args: [skuId, amount6]
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    return receipt.transactionHash
  }

  return { purchase }
}

function toBytes32(s: string): Hex {
  // Simple keccak hash of string
  return keccak256(toHex(s))
}
