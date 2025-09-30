import '@walletconnect/react-native-compat'

import { createAppKit, defaultWagmiConfig } from '@reown/appkit-wagmi-react-native'
import { localhost, polygon, polygonAmoy } from 'wagmi/chains'

// Get environment variables with validation
const projectId = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID
if (!projectId) {
  throw new Error('EXPO_PUBLIC_REOWN_PROJECT_ID is required')
}

// Create localhost chain for development
const localhostChain = {
  ...localhost,
  name: 'Localhost',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
    public: { http: ['http://127.0.0.1:8545'] },
  },
} as const

// App metadata
const metadata = {
  name: 'SuperPool',
  description: 'Decentralized Micro-Lending Platform',
  url: 'https://superpool.app',
  icons: [require('@superpool/assets/images/logos/symbol.png')],
  redirect: {
    native: 'superpool://',
    universal: 'https://superpool.app',
  },
}

// Configure chains based on environment
const chains = __DEV__ ? ([polygon, polygonAmoy, localhostChain] as const) : ([polygon, polygonAmoy] as const)

// Create Wagmi configuration
export const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata })

createAppKit({
  projectId,
  metadata,
  wagmiConfig,
  defaultChain: polygon,
  enableAnalytics: true,
})
