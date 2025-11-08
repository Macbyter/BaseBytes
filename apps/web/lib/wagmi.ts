import { http, createConfig } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { coinbaseWallet, metaMask, walletConnect, injected } from 'wagmi/connectors'

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo-project-id'

export const config = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    injected({ target: 'metaMask' }),
    coinbaseWallet({
      appName: 'BaseBytes',
      appLogoUrl: 'https://basebytes.org/logo.png',
    }),
    walletConnect({ projectId }),
    injected({ target: 'rabby' }),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_BASE || 'https://base.llamarpc.com'),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_BASE_SEPOLIA || 'https://sepolia.base.org'),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
