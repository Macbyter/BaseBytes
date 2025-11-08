import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <section className="max-w-7xl mx-auto px-6 py-24 text-center">
        <h1 className="text-6xl font-bold mb-6">
          Ethical Data Rental<br />on Base
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto">
          Pay-per-use data streams and bulk datasets. No subscriptions, no custody, no compromise.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/demo"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-lg transition-colors"
          >
            Try Demo
          </Link>
          <Link
            href="/catalog"
            className="px-8 py-3 border-2 border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg font-medium text-lg transition-colors"
          >
            Browse Catalog
          </Link>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-bold mb-2">Browse Catalog</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Explore curated data streams and bulk datasets from trusted providers
            </p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-4">💳</div>
            <h3 className="text-xl font-bold mb-2">Pay with USDC</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Connect your wallet and pay on-chain. No subscriptions, just pay for what you use.
            </p>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-bold mb-2">Stream Data</h3>
            <p className="text-slate-600 dark:text-slate-400">
              Receive real-time NDJSON streams or bulk datasets instantly after payment
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-100 dark:bg-slate-900 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">Why BaseBytes?</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex items-start gap-4">
              <div className="text-2xl">✓</div>
              <div>
                <h3 className="font-bold mb-1">Non-Custodial</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  You control your wallet and funds. We never hold your assets.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="text-2xl">✓</div>
              <div>
                <h3 className="font-bold mb-1">Transparent Pricing</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Pay only for what you use. No hidden fees or subscriptions.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="text-2xl">✓</div>
              <div>
                <h3 className="font-bold mb-1">Verifiable Receipts</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Every transaction is attested on-chain via EAS for full transparency.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="text-2xl">✓</div>
              <div>
                <h3 className="font-bold mb-1">Built on Base</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Low fees, fast settlement, and Ethereum security.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          Try our live demo or browse the catalog to see what data is available
        </p>
        <Link
          href="/demo"
          className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-lg transition-colors"
        >
          Try Live Demo
        </Link>
      </section>
    </main>
  )
}
