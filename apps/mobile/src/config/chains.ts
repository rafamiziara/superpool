import type { Chain } from '@wagmi/core/chains'

/**
 * Localhost chain configuration for local Hardhat development
 * Only available in development mode
 */
export const localhost: Chain = {
  id: 31337,
  name: 'Localhost',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Local Explorer',
      url: 'http://localhost:8545', // No real explorer for localhost
    },
  },
  contracts: {
    // Add your deployed contract addresses here when deploying locally
    // Example:
    // poolFactory: {
    //   address: '0x...',  // Update with your deployed factory address
    // },
  },
  testnet: true,
} as const

/**
 * Get chain configuration based on environment
 */
export function getChainConfig() {
  return {
    localhost,
    // Add other custom chain configurations here if needed
  }
}

/**
 * Check if we're running against localhost
 */
export function isLocalhost(chainId: number): boolean {
  return chainId === localhost.id
}

/**
 * Get RPC URL for localhost
 */
export function getLocalhostRpcUrl(): string {
  return localhost.rpcUrls.default.http[0]
}
