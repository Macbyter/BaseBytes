'use client'

import { useState } from 'react'
import { usePayNow, type Payment } from '@/lib/pay'
import { useAccount } from 'wagmi'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'
const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x') as `0x${string}`

export function LiveDemo() {
  const { isConnected } = useAccount()
  const { purchase } = usePayNow(USDC_ADDRESS)
  const [sku, setSku] = useState('bb.text.qa.cited.v1')
  const [status, setStatus] = useState<'idle' | 'loading' | 'paid' | 'error'>('idle')
  const [payment, setPayment] = useState<Payment | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [txHash, setTxHash] = useState<string>('')

  async function tryStream(dryRun = false) {
    setStatus('loading')
    setLines([])
    
    try {
      const headers: Record<string, string> = {}
      let url = `${API_BASE}/ai/stream/${sku}`
      
      if (dryRun) {
        headers['x402-paid'] = '1'
        url += '?paid=1'
      } else if (txHash) {
        headers['Authorization'] = `evm-tx ${txHash}`
      }

      const res = await fetch(url, { headers })

      if (res.status === 402) {
        const paymentData = await res.json()
        setPayment(paymentData)
        setStatus('idle')
        return
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      // Stream NDJSON
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      const newLines: string[] = []

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        const chunkLines = chunk.split('\n').filter(l => l.trim())
        newLines.push(...chunkLines)
        setLines([...newLines])
        
        if (newLines.length >= 100) break
      }

      setStatus('idle')
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  async function handlePay() {
    if (!payment) return
    
    setStatus('loading')
    try {
      const hash = await purchase(payment)
      setTxHash(hash)
      setStatus('paid')
      
      // Auto-retry after payment
      setTimeout(() => tryStream(false), 2000)
    } catch (error) {
      console.error(error)
      setStatus('error')
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-3xl font-bold mb-6">Live Demo</h2>
      
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
          placeholder="SKU ID"
        />
        <button
          onClick={() => tryStream(false)}
          disabled={status === 'loading'}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {status === 'loading' ? 'Loading...' : 'Try Stream'}
        </button>
        <button
          onClick={() => tryStream(true)}
          disabled={status === 'loading'}
          className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
        >
          DRY RUN
        </button>
      </div>

      {payment && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="font-bold text-yellow-900 dark:text-yellow-100">Payment Required (HTTP 402)</div>
              <div className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Network: {payment.network} | Asset: {payment.asset} | Amount: ${payment.amount}
              </div>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(payment, null, 2))}
              className="text-xs px-2 py-1 bg-yellow-200 dark:bg-yellow-800 rounded"
            >
              Copy 402
            </button>
          </div>
          
          {isConnected ? (
            <button
              onClick={handlePay}
              disabled={status === 'loading'}
              className="mt-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium disabled:opacity-50"
            >
              Pay ${payment.amount} USDC
            </button>
          ) : (
            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              Connect wallet to pay
            </div>
          )}
        </div>
      )}

      {txHash && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="font-bold text-green-900 dark:text-green-100">Payment Confirmed</div>
          <div className="text-sm text-green-700 dark:text-green-300 mt-1 font-mono">
            {txHash.slice(0, 10)}...{txHash.slice(-8)}
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-auto max-h-96">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-900 dark:text-red-100">
          Error occurred. Check console for details.
        </div>
      )}
    </div>
  )
}
