import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { WalletButton } from '@/components/WalletButton'
import { ChainGuard } from '@/components/ChainGuard'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BaseBytes - Ethical Data Rental on Base',
  description: 'Pay-per-use data streams and bulk datasets on Base blockchain',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <nav className="border-b border-slate-200 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
              <Link href="/" className="text-2xl font-bold">
                BaseBytes
              </Link>
              
              <div className="flex items-center gap-6">
                <Link href="/catalog" className="hover:text-blue-600 dark:hover:text-blue-400">
                  Catalog
                </Link>
                <Link href="/demo" className="hover:text-blue-600 dark:hover:text-blue-400">
                  Demo
                </Link>
                <Link href="/pricing" className="hover:text-blue-600 dark:hover:text-blue-400">
                  Pricing
                </Link>
                <Link href="/trust" className="hover:text-blue-600 dark:hover:text-blue-400">
                  Trust
                </Link>
                <a
                  href="https://github.com/Macbyter/BaseBytes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Docs
                </a>
                <WalletButton />
              </div>
            </div>
          </nav>
          
          <ChainGuard />
          
          {children}
          
          <footer className="border-t border-slate-200 dark:border-slate-800 mt-16">
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="grid md:grid-cols-4 gap-8">
                <div>
                  <div className="font-bold mb-2">BaseBytes</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Ethical data rental on Base
                  </div>
                </div>
                <div>
                  <div className="font-bold mb-2">Product</div>
                  <div className="space-y-1 text-sm">
                    <div><Link href="/catalog">Catalog</Link></div>
                    <div><Link href="/pricing">Pricing</Link></div>
                    <div><Link href="/demo">Demo</Link></div>
                  </div>
                </div>
                <div>
                  <div className="font-bold mb-2">Resources</div>
                  <div className="space-y-1 text-sm">
                    <div><a href="https://github.com/Macbyter/BaseBytes">GitHub</a></div>
                    <div><Link href="/trust">Trust & Compliance</Link></div>
                    <div><a href="https://github.com/Macbyter/BaseBytes/blob/main/INTEGRATION.md">Integration Guide</a></div>
                  </div>
                </div>
                <div>
                  <div className="font-bold mb-2">Network</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    Base Sepolia (Testnet)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                    v0.1-testnet
                  </div>
                </div>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  )
}
