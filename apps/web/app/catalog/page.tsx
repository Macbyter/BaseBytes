'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'

type SKU = {
  sku_id: string
  title: string
  license: string[]
  units: {
    name: string
    bundle: number
  }
  pricing: Record<string, number>
  updates: {
    cadence: string
    delta_stream: boolean
  }
}

export default function CatalogPage() {
  const [skus, setSkus] = useState<SKU[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/ai/catalog`)
      .then(res => res.json())
      .then(data => {
        setSkus(data)
        setLoading(false)
      })
      .catch(() => {
        setSkus([])
        setLoading(false)
      })
  }, [])

  return (
    <main className="max-w-7xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-2">Data Catalog</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8">
        Browse our curated data streams and bulk datasets
      </p>

      {loading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {skus.map(sku => (
            <div
              key={sku.sku_id}
              className="border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {sku.sku_id}
                </div>
                <div className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded">
                  {sku.updates.delta_stream ? 'Stream' : 'Bulk'}
                </div>
              </div>

              <h3 className="text-xl font-bold mb-2">{sku.title}</h3>

              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <div>
                  <span className="font-medium">Unit:</span> {sku.units.bundle} {sku.units.name}
                </div>
                <div>
                  <span className="font-medium">License:</span> {sku.license.join(', ')}
                </div>
                <div>
                  <span className="font-medium">Updates:</span> {sku.updates.cadence}
                  {sku.updates.delta_stream && ' • Deltas'}
                </div>
                <div>
                  <span className="font-medium">Price:</span> $
                  {Object.values(sku.pricing)[0]?.toFixed(2) || '0.00'}
                </div>
              </div>

              <Link
                href="/demo"
                className="mt-4 block w-full text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Try Demo
              </Link>
            </div>
          ))}
        </div>
      )}

      {!loading && skus.length === 0 && (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          No SKUs available. Check API configuration.
        </div>
      )}
    </main>
  )
}
