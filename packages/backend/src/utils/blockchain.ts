import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { getChainConfig, PoolFactoryABI } from '../constants'

/**
 * Get JSON-RPC provider for a specific chain
 */
export const getProvider = (chainId: number): JsonRpcProvider => {
  const chainConfig = getChainConfig(chainId)
  if (!chainConfig) {
    throw new HttpsError('invalid-argument', `Unsupported chain ID: ${chainId}`)
  }

  if (!chainConfig.rpcUrl) {
    throw new HttpsError('internal', `RPC URL not configured for chain ${chainId}`)
  }

  return new JsonRpcProvider(chainConfig.rpcUrl, chainId)
}

/**
 * Get backend wallet instance for signing transactions
 */
export const getBackendWallet = (chainId: number): Wallet => {
  const privateKey = process.env.BACKEND_WALLET_PRIVATE_KEY
  if (!privateKey) {
    throw new HttpsError('internal', 'Backend wallet private key not configured')
  }

  const provider = getProvider(chainId)
  return new Wallet(privateKey, provider)
}

/**
 * Get PoolFactory contract instance connected to backend wallet
 */
export const getPoolFactoryContract = (chainId: number): Contract => {
  const chainConfig = getChainConfig(chainId)
  if (!chainConfig) {
    throw new HttpsError('invalid-argument', `Unsupported chain ID: ${chainId}`)
  }

  if (!chainConfig.poolFactoryAddress) {
    throw new HttpsError('internal', `PoolFactory address not configured for chain ${chainId}`)
  }

  const wallet = getBackendWallet(chainId)
  return new Contract(chainConfig.poolFactoryAddress, PoolFactoryABI, wallet)
}

/**
 * Check if whitelist mode is enabled on PoolFactory
 */
export const isWhitelistModeEnabled = async (chainId: number): Promise<boolean> => {
  try {
    const poolFactory = getPoolFactoryContract(chainId)
    const isEnabled = await poolFactory.isWhitelistEnabled()
    return isEnabled
  } catch (error) {
    logger.error('Error checking whitelist mode', {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new HttpsError('internal', 'Failed to check whitelist mode')
  }
}

/**
 * Check if a wallet address is whitelisted for pool creation
 */
export const isWalletWhitelisted = async (walletAddress: string, chainId: number): Promise<boolean> => {
  try {
    const poolFactory = getPoolFactoryContract(chainId)
    const isAuthorized = await poolFactory.isAuthorizedCreator(walletAddress)
    return isAuthorized
  } catch (error) {
    logger.error('Error checking whitelist status', {
      walletAddress,
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new HttpsError('internal', 'Failed to check whitelist status')
  }
}

/**
 * Whitelist a wallet address for pool creation
 */
export const whitelistWallet = async (walletAddress: string, chainId: number): Promise<{ transactionHash: string; gasCost: string }> => {
  try {
    const poolFactory = getPoolFactoryContract(chainId)

    logger.info('Sending whitelist transaction', { walletAddress, chainId })

    // Call setCreatorAuthorization to whitelist the wallet
    const txResponse = await poolFactory.setCreatorAuthorization(walletAddress, true)

    if (!txResponse || !txResponse.hash) {
      throw new Error('Failed to get transaction response')
    }

    logger.info('Transaction sent, waiting for confirmation', {
      transactionHash: txResponse.hash,
      walletAddress,
    })

    // Wait for transaction confirmation
    const receipt = await txResponse.wait()

    if (!receipt || receipt.status !== 1) {
      throw new Error('Transaction failed or was reverted')
    }

    // Calculate gas cost (in ethers v6, use gasUsed and gasPrice or effectiveGasPrice)
    const gasPrice = receipt.gasPrice || receipt.effectiveGasPrice || 0n
    const gasCost = (receipt.gasUsed * gasPrice).toString()

    logger.info('Whitelist transaction confirmed', {
      transactionHash: receipt.hash,
      walletAddress,
      gasUsed: receipt.gasUsed.toString(),
      gasCost,
    })

    return {
      transactionHash: receipt.hash,
      gasCost,
    }
  } catch (error) {
    logger.error('Error whitelisting wallet', {
      walletAddress,
      chainId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('insufficient funds')) {
        throw new HttpsError('internal', 'Backend wallet has insufficient funds for gas')
      }
      if (error.message.includes('nonce')) {
        throw new HttpsError('internal', 'Transaction nonce error. Please try again.')
      }
    }

    throw new HttpsError('internal', 'Failed to whitelist wallet address')
  }
}
