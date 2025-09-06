import { JsonRpcProvider } from 'ethers'
import { logger } from 'firebase-functions/v2'

/**
 * Provider service for blockchain interactions
 * Provides ethers.js providers for different networks
 */
export class ProviderService {
  private static providers: Map<number, JsonRpcProvider> = new Map()

  /**
   * Default RPC endpoints for different networks
   */
  private static readonly DEFAULT_RPC_ENDPOINTS: Record<number, string> = {
    1: 'https://eth-mainnet.g.alchemy.com/v2/demo', // Ethereum Mainnet (fallback)
    137: 'https://polygon-rpc.com', // Polygon Mainnet
    80002: 'https://polygon-amoy.g.alchemy.com/v2/demo', // Polygon Amoy Testnet (fallback)
    31337: 'http://127.0.0.1:8545', // Local Hardhat Network
  }

  /**
   * Get provider for specific chain ID
   */
  static getProvider(chainId: number = 80002): JsonRpcProvider {
    // Check if we already have a cached provider
    if (this.providers.has(chainId)) {
      return this.providers.get(chainId)!
    }

    // Get RPC URL from environment or use default
    const rpcUrl = this.getRpcUrl(chainId)

    logger.info('Creating new provider', { chainId, rpcUrl: rpcUrl.substring(0, 30) + '...' })

    try {
      const provider = new JsonRpcProvider(rpcUrl)
      this.providers.set(chainId, provider)
      return provider
    } catch (error) {
      logger.error('Failed to create provider', {
        error: error instanceof Error ? error.message : String(error),
        chainId,
        rpcUrl: rpcUrl.substring(0, 30) + '...',
      })
      throw new Error(`Failed to create provider for chain ${chainId}`)
    }
  }

  /**
   * Get RPC URL for chain ID from environment variables
   */
  private static getRpcUrl(chainId: number): string {
    // Check environment variables first
    const envVars = {
      1: process.env.ETHEREUM_MAINNET_RPC_URL,
      137: process.env.POLYGON_MAINNET_RPC_URL || process.env.POLYGON_RPC_URL,
      80002: process.env.POLYGON_AMOY_RPC_URL,
      31337: process.env.LOCALHOST_RPC_URL,
    }

    const envUrl = envVars[chainId as keyof typeof envVars]
    if (envUrl) {
      return envUrl
    }

    // Fallback to default endpoints
    const defaultUrl = this.DEFAULT_RPC_ENDPOINTS[chainId]
    if (defaultUrl) {
      logger.warn(`Using default RPC endpoint for chain ${chainId}, consider setting environment variable`)
      return defaultUrl
    }

    throw new Error(`No RPC URL configured for chain ID ${chainId}`)
  }

  /**
   * Test provider connectivity
   */
  static async testProvider(chainId: number): Promise<boolean> {
    try {
      const provider = this.getProvider(chainId)
      const blockNumber = await provider.getBlockNumber()

      logger.info('Provider connectivity test successful', {
        chainId,
        blockNumber,
      })

      return true
    } catch (error) {
      logger.error('Provider connectivity test failed', {
        error: error instanceof Error ? error.message : String(error),
        chainId,
      })
      return false
    }
  }

  /**
   * Get network information
   */
  static async getNetworkInfo(chainId: number): Promise<{
    chainId: number
    name: string
    blockNumber: number
    gasPrice?: bigint
  }> {
    const provider = this.getProvider(chainId)

    const [network, blockNumber, feeData] = await Promise.all([
      provider.getNetwork(),
      provider.getBlockNumber(),
      provider.getFeeData().catch(() => null), // Fee data might not be available on all networks
    ])

    const networkNames: Record<number, string> = {
      1: 'Ethereum Mainnet',
      137: 'Polygon Mainnet',
      80002: 'Polygon Amoy Testnet',
      31337: 'Localhost Hardhat Network',
    }

    return {
      chainId: Number(network.chainId),
      name: networkNames[Number(network.chainId)] || `Chain ${network.chainId}`,
      blockNumber,
      gasPrice: feeData?.gasPrice || undefined,
    }
  }

  /**
   * Clear cached providers (useful for testing or reconnection)
   */
  static clearProviders(): void {
    this.providers.clear()
    logger.info('Cleared all cached providers')
  }

  /**
   * Get default chain ID based on environment
   */
  static getDefaultChainId(): number {
    // Check if we're in development/testing
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      return 31337 // Local Hardhat
    }

    // Default to Polygon Amoy testnet
    return 80002
  }
}
