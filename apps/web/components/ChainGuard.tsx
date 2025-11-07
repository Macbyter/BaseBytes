'use client'

import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'

export function ChainGuard() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  if (!isConnected) return null

  const isCorrectChain = chainId === base.id || chainId === baseSepolia.id
  
  if (isCorrectChain) return null

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-4">
      <div>
        <div className="font-bold">Wrong Network</div>
        <div className="text-sm">Please switch to Base or Base Sepolia</div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => switchChain({ chainId: baseSepolia.id })}
          className="px-3 py-1 bg-black text-white rounded hover:bg-gray-800 text-sm"
        >
          Base Sepolia
        </button>
        <button
          onClick={() => switchChain({ chainId: base.id })}
          className="px-3 py-1 bg-black text-white rounded hover:bg-gray-800 text-sm"
        >
          Base
        </button>
      </div>
    </div>
  )
}
