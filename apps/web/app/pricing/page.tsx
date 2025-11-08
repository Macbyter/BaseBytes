export default function PricingPage() {
  return (
    <main className="max-w-7xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-4">Pricing</h1>
      <p className="text-xl text-slate-600 dark:text-slate-400 mb-12">
        Pay only for what you use. No subscriptions, no commitments.
      </p>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-8">
          <h3 className="text-2xl font-bold mb-2">Stream</h3>
          <div className="text-4xl font-bold mb-4">
            $0.01<span className="text-lg text-slate-500">/unit</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Real-time data streams with delta updates
          </p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>NDJSON streaming</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>Delta updates</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>Real-time delivery</span>
            </li>
          </ul>
        </div>

        <div className="border-2 border-blue-500 rounded-lg p-8 relative">
          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium">
            Popular
          </div>
          <h3 className="text-2xl font-bold mb-2">Bulk</h3>
          <div className="text-4xl font-bold mb-4">
            $0.005<span className="text-lg text-slate-500">/unit</span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Large datasets delivered in batches
          </p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>Batch delivery</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>Volume discounts</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>Historical data</span>
            </li>
          </ul>
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-8">
          <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
          <div className="text-4xl font-bold mb-4">Custom</div>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Tailored solutions for large-scale needs
          </p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>Custom data feeds</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>Dedicated support</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-500 mr-2">✓</span>
              <span>SLA guarantees</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-16 bg-slate-100 dark:bg-slate-800 rounded-lg p-8">
        <h2 className="text-2xl font-bold mb-4">Payment Options</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-bold mb-2">x402 (Default)</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Pay with USDC on Base. Instant settlement, no intermediaries.
            </p>
          </div>
          <div>
            <h3 className="font-bold mb-2">Gasless (Coming Soon)</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Relayer-based payments for seamless UX.
            </p>
          </div>
          <div>
            <h3 className="font-bold mb-2">AP2 (Future)</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Account Payable v2 for enterprise billing.
            </p>
          </div>
          <div>
            <h3 className="font-bold mb-2">On-Ramp</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Buy USDC with credit card via Coinbase.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
