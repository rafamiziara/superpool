/**
 * Blockchain chain configurations
 */

export interface ChainConfig {
  chainId: number
  name: string
  rpcUrl: string
  poolFactoryAddress: string
}

/**
 * Active chain configuration from environment variables
 * Switch environments by updating RPC_URL and POOL_FACTORY_ADDRESS in .env
 *
 * Examples:
 * - Localhost: RPC_URL=http://127.0.0.1:8545, CHAIN_ID=31337
 * - Polygon Amoy: RPC_URL=https://rpc-amoy.polygon.technology/, CHAIN_ID=80002
 */
export const ACTIVE_CHAIN_CONFIG: ChainConfig = {
  chainId: parseInt(process.env.CHAIN_ID || '31337'),
  name: process.env.CHAIN_NAME || 'Localhost',
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  poolFactoryAddress: process.env.POOL_FACTORY_ADDRESS || '',
}

/**
 * Get chain configuration by chain ID
 * Currently returns the active chain config if chainId matches
 * Can be extended to support multiple chains in the future
 */
export const getChainConfig = (chainId: number): ChainConfig | undefined => {
  if (chainId === ACTIVE_CHAIN_CONFIG.chainId) {
    return ACTIVE_CHAIN_CONFIG
  }
  // Chain not configured
  return undefined
}

/**
 * Default chain for pool operations
 */
export const DEFAULT_CHAIN_ID = ACTIVE_CHAIN_CONFIG.chainId
