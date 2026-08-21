import { PreparePoolCreationRequest, PreparePoolCreationResponse } from '@superpool/types'
import { isAddress } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, WHITELISTING_LOGS_COLLECTION } from '../../constants'
import { preparePoolCreationSchema } from '../../schemas'
import { firestore } from '../../services'
import { isWalletWhitelisted, isWhitelistModeEnabled, whitelistWallet } from '../../utils'
import { backendWalletPrivateKey } from '../../utils/blockchain'
import { parseRequest } from '../../utils/validation'
import { claimWhitelisting, releaseWhitelisting, WalletBusyError, withWalletLock } from '../../services/walletBudget'
import { enforceAppCheck } from '../../utils/appCheck'

export const preparePoolCreationHandler = async (
  request: CallableRequest<PreparePoolCreationRequest>
): Promise<PreparePoolCreationResponse> => {
  // 1. Verify user authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to create pools')
  }

  const data = parseRequest(preparePoolCreationSchema, request.data)

  // Extract wallet address from authenticated user
  const walletAddress = request.auth.uid

  logger.info('Preparing pool creation', {
    walletAddress,
    chainId: data.chainId,
  })

  // 2. Validate wallet address format
  if (!isAddress(walletAddress)) {
    throw new HttpsError('invalid-argument', 'Invalid wallet address format')
  }

  // 3. Get chain ID (default to configured chain)
  const chainId = data.chainId ?? DEFAULT_CHAIN_ID

  try {
    // 4. Check if whitelist mode is enabled
    logger.info('Checking whitelist mode', { chainId })
    const whitelistEnabled = await isWhitelistModeEnabled(chainId)

    if (!whitelistEnabled) {
      logger.warn('Whitelist mode is disabled - only factory owner can create pools', {
        walletAddress,
        chainId,
      })
      throw new HttpsError(
        'failed-precondition',
        'Pool creation is currently restricted to administrators only. Whitelist mode is disabled.'
      )
    }

    // 5. Check if wallet is already whitelisted
    logger.info('Checking whitelist status', { walletAddress, chainId })
    const isWhitelisted = await isWalletWhitelisted(walletAddress, chainId)

    if (isWhitelisted) {
      logger.info('Wallet already whitelisted', { walletAddress, chainId })

      return {
        isWhitelisted: true,
        wasAlreadyWhitelisted: true,
      }
    }

    /*
     * 6. Whitelist the user (backend pays gas)
     *
     * Bounded and serialised, neither of which it was.
     *
     * **Bounded**: this is the only endpoint in the backend that spends the
     * project's own money for an arbitrary caller, and authentication here is
     * cheap by design — `firestore.rules` says so outright, *any wallet can
     * sign a nonce and get a token*. So a script with a thousand fresh wallets
     * was a thousand transactions off the backend's balance. The cap is global
     * per chain per day rather than per wallet, because a per-wallet limit
     * bounds an accident and not this.
     *
     * **Serialised**: every send signs from the same address, so two
     * concurrent calls collided on a nonce and one was dropped. The catch
     * below has always matched the word "nonce" and told the user to try
     * again; the lease is what stops it arising.
     *
     * The claim is taken before the send and given back if nothing was sent,
     * the shape `claimAssessment` uses — counting afterwards lets two calls
     * that started together both pass the check.
     */
    const budget = await claimWhitelisting(chainId, firestore)

    if (!budget.granted) {
      throw new HttpsError('resource-exhausted', 'Pool creation is temporarily unavailable while we top up. Please try again later.')
    }

    logger.info('Whitelisting wallet', { walletAddress, chainId, budgetUsed: budget.used, budgetCap: budget.cap })

    let transactionHash: string
    let gasCost: string

    try {
      ;({ transactionHash, gasCost } = await withWalletLock(chainId, firestore, () => whitelistWallet(walletAddress, chainId)))
    } catch (error) {
      // Nothing reached the chain, so nothing should have been charged to the
      // day. Released before the rethrow so the outer catch's logging and
      // error mapping are unchanged.
      await releaseWhitelisting(chainId, firestore)

      if (error instanceof WalletBusyError) {
        throw new HttpsError('unavailable', 'Another pool is being set up right now. Please try again in a moment.')
      }

      throw error
    }

    // 7. Log the whitelisting operation for audit trail
    try {
      await firestore.collection(WHITELISTING_LOGS_COLLECTION).add({
        walletAddress,
        chainId,
        transactionHash,
        gasCost,
        timestamp: new Date(),
        success: true,
      })
    } catch (logError) {
      // Don't fail the request if logging fails
      logger.error('Failed to log whitelisting operation', {
        error: logError instanceof Error ? logError.message : String(logError),
        walletAddress,
      })
    }

    logger.info('Wallet successfully whitelisted', {
      walletAddress,
      chainId,
      transactionHash,
      gasCost,
    })

    return {
      isWhitelisted: true,
      wasAlreadyWhitelisted: false,
      transactionHash,
      gasCost,
    }
  } catch (error) {
    logger.error('Error preparing pool creation', {
      error: error instanceof Error ? error.message : String(error),
      walletAddress,
      chainId,
    })

    // Log failed attempt
    try {
      await firestore.collection(WHITELISTING_LOGS_COLLECTION).add({
        walletAddress,
        chainId,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    } catch (logError) {
      logger.error('Failed to log whitelisting error', {
        error: logError instanceof Error ? logError.message : String(logError),
      })
    }

    // Re-throw the error
    if (error instanceof HttpsError) {
      throw error
    }

    throw new HttpsError('internal', 'Failed to prepare pool creation. Please try again.')
  }
}

/**
 * Cloud Function to prepare pool creation by whitelisting authenticated users
 *
 * This function implements "lazy whitelisting" - users are automatically whitelisted
 * when they first attempt to create a pool, so a new user is not made to wait on
 * an operator before they can do the first thing the app invites them to do.
 *
 * What it protects, and what it does not: the whitelist keeps unknown wallets
 * out of `PoolFactory.createPool`, which is spam protection for the *factory*.
 * It was never spam protection for the **backend wallet**, which pays for every
 * one of these transactions on behalf of whoever asks. That is what
 * `claimWhitelisting` is for; see the block around the send.
 *
 * @param {CallableRequest<PreparePoolCreationRequest>} request The callable request with optional chainId
 * @returns {Promise<PreparePoolCreationResponse>} Whitelist status and transaction details
 * @throws {HttpsError} If the user is not authenticated or whitelisting fails
 */
export const preparePoolCreation = onCall<PreparePoolCreationRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
    // See `enforceAppCheck`: off unless ENFORCE_APP_CHECK=true.
    enforceAppCheck: enforceAppCheck(),
    // The only deployed function that signs a transaction, and therefore the
    // only one given the key. Naming it here is what mounts it; a function
    // that does not name it cannot read it at all.
    secrets: [backendWalletPrivateKey],
  },
  preparePoolCreationHandler
)
