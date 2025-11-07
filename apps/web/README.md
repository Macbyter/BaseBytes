# BaseBytes Web App

Production-ready marketing website with wallet integration and x402 payment flow.

## Features

- ✅ **Wallet Connections:** Coinbase Wallet, MetaMask, Rabby, WalletConnect
- ✅ **x402 Payment Flow:** DRY RUN and REAL payment modes
- ✅ **Live Demo:** NDJSON viewer with payment integration
- ✅ **Chain Guard:** Automatic network switching to Base/Base Sepolia
- ✅ **Catalog:** Browse available SKUs from API
- ✅ **Responsive Design:** Mobile-first with Tailwind CSS
- ✅ **Type-Safe:** Full TypeScript support with Wagmi/Viem

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **Web3:** Wagmi + Viem
- **Wallets:** RainbowKit connectors
- **State:** TanStack Query

## Getting Started

### Installation

\`\`\`bash
npm install
cp .env.local.example .env.local
# Edit .env.local with your values
\`\`\`

### Development

\`\`\`bash
npm run dev
# Open http://localhost:3000
\`\`\`

### Build

\`\`\`bash
npm run build
npm start
\`\`\`

## Environment Variables

Required:
- \`NEXT_PUBLIC_API_BASE\`
- \`NEXT_PUBLIC_WC_PROJECT_ID\`

See \`.env.local.example\` for full list.

## Deployment

Deploy to Vercel with \`apps/web\` as root directory.

## License

See root LICENSE file.
