export default function TrustPage() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold mb-4">Trust & Compliance</h1>
      <p className="text-xl text-slate-600 dark:text-slate-400 mb-12">
        Non-custodial, transparent, and verifiable data transactions
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Non-Custodial Flow</h2>
        <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-6">
          <ol className="space-y-4">
            <li className="flex items-start">
              <span className="font-bold text-blue-600 dark:text-blue-400 mr-3">1.</span>
              <div>
                <div className="font-medium">Request Data</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Client requests data from /ai/stream endpoint
                </div>
              </div>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-blue-600 dark:text-blue-400 mr-3">2.</span>
              <div>
                <div className="font-medium">Receive Payment Terms (HTTP 402)</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Server returns payment details: network, asset, amount, payTo address
                </div>
              </div>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-blue-600 dark:text-blue-400 mr-3">3.</span>
              <div>
                <div className="font-medium">Pay On-Chain</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Client approves USDC and calls Router.purchase() on Base
                </div>
              </div>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-blue-600 dark:text-blue-400 mr-3">4.</span>
              <div>
                <div className="font-medium">Retry with Transaction Hash</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Client retries request with Authorization: evm-tx 0x... header
                </div>
              </div>
            </li>
            <li className="flex items-start">
              <span className="font-bold text-blue-600 dark:text-blue-400 mr-3">5.</span>
              <div>
                <div className="font-medium">Receive Data (HTTP 200)</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  Server verifies payment and streams NDJSON data
                </div>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Receipts & Attestations</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Every payment generates an immutable receipt attested on-chain via Ethereum Attestation Service (EAS).
        </p>
        <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-6">
          <div className="font-mono text-sm space-y-2">
            <div><span className="text-slate-500">Schema:</span> string receiptId, address buyer, address seller, string skuId, uint256 amountUsd6, uint32 units, bytes32 txHash</div>
            <div><span className="text-slate-500">Contract:</span> 0x4200000000000000000000000000000000000021 (Base Sepolia)</div>
            <div><span className="text-slate-500">Endpoint:</span> GET /ai/receipt/:id</div>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Daily Merkle Anchoring</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          All receipts are anchored daily at 10:00 Europe/Dublin in a Merkle tree. Inclusion proofs enable cryptographic verification.
        </p>
        <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-6">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Anchor Time:</span>
              <span className="font-medium">10:00 UTC (Europe/Dublin)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Proof Endpoint:</span>
              <span className="font-medium">GET /proofs/:id</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Verification:</span>
              <span className="font-medium">Client-side Merkle proof validation</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Security & Privacy</h2>
        <div className="space-y-4">
          <div className="flex items-start">
            <span className="text-green-500 text-xl mr-3">✓</span>
            <div>
              <div className="font-medium">No Custody</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                You control your wallet and funds at all times
              </div>
            </div>
          </div>
          <div className="flex items-start">
            <span className="text-green-500 text-xl mr-3">✓</span>
            <div>
              <div className="font-medium">On-Chain Verification</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                All payments are verifiable on Base blockchain
              </div>
            </div>
          </div>
          <div className="flex items-start">
            <span className="text-green-500 text-xl mr-3">✓</span>
            <div>
              <div className="font-medium">Privacy-First</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                No PII required. Pseudonymous wallet addresses only.
              </div>
            </div>
          </div>
          <div className="flex items-start">
            <span className="text-green-500 text-xl mr-3">✓</span>
            <div>
              <div className="font-medium">Audited</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Security audit completed with all findings resolved
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
