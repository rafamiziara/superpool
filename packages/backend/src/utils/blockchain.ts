import { Contract, JsonRpcProvider, Wallet } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
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
 * The backend's signing key, declared as a Secret Manager secret.
 *
 * `defineSecret` rather than a bare `process.env` read, because the two are
 * stored in different places and only one of them is a secret store. A `.env`
 * shipped with a Functions deployment becomes part of the function's
 * configuration: readable by anyone with project Viewer, visible in the
 * console, and captured in deployment history — for the key that owns the one
 * funded wallet this project has.
 *
 * Set it with `firebase functions:secrets:set BACKEND_WALLET_PRIVATE_KEY`. The
 * value is then mounted into the process at runtime, so `.value()` reads the
 * same way the old code did and every caller is unchanged.
 *
 * Functions that sign must list this in their `secrets` option — see
 * `preparePoolCreation`. A function that does not is simply not given the
 * value, which is the point: the blast radius of the key is now the list of
 * endpoints that name it.
 */
export const backendWalletPrivateKey = defineSecret('BACKEND_WALLET_PRIVATE_KEY')

/**
 * Get backend wallet instance for signing transactions
 */
export const getBackendWallet = (chainId: number): Wallet => {
  // `.value()` falls back to `process.env` when the secret is not mounted,
  // which is what keeps the emulator and the live scripts in `scripts/`
  // working from a local `.env` exactly as before.
  const privateKey = backendWalletPrivateKey.value() || process.env.BACKEND_WALLET_PRIVATE_KEY

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
