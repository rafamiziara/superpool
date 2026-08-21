import '@walletconnect/react-native-compat'

import { createAppKit, defaultWagmiConfig } from '@reown/appkit-wagmi-react-native'
import { arbitrum, base, bsc, mainnet, polygon, polygonAmoy } from 'wagmi/chains'
import { localhostChain } from './chains'

// Get environment variables with validation
const projectId = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID
if (!projectId) {
  throw new Error('EXPO_PUBLIC_REOWN_PROJECT_ID is required')
}

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
const chains = __DEV__
  ? ([mainnet, polygon, arbitrum, base, bsc, polygonAmoy, localhostChain] as const)
  : ([mainnet, polygon, arbitrum, base, bsc, polygonAmoy] as const)

// Create Wagmi configuration
export const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata })

createAppKit({
  projectId,
  metadata,
  wagmiConfig,
  defaultChain: polygon,
  enableAnalytics: true,
  // The app is dark-only, so pin the modal rather than let it follow the system
  // scheme. The accent is deliberately left at AppKit's own indigo: its buttons
  // hardcode white label text, which our mint would leave unreadable.
  themeMode: 'dark',
})
