'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useState } from 'react'

export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()
  const [showMenu, setShowMenu] = useState(false)

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
      >
        Connect Wallet
      </button>
      
      {showMenu && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-50">
          {connectors.map((connector) => (
            <button
              key={connector.id}
              onClick={() => {
                connect({ connector })
                setShowMenu(false)
              }}
              className="w-full px-4 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-700 first:rounded-t-lg last:rounded-b-lg transition-colors"
            >
              <div className="font-medium">{connector.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {connector.type}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
