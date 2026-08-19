import { PreparePoolCreationRequest, PreparePoolCreationResponse } from '@superpool/types'
import { isAddress } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, WHITELISTING_LOGS_COLLECTION } from '../../constants'
import { preparePoolCreationSchema } from '../../schemas'
import { firestore } from '../../services'
import { isWalletWhitelisted, isWhitelistModeEnabled, whitelistWallet } from '../../utils'
import { parseRequest } from '../../utils/validation'

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

    // 6. Whitelist the user (backend pays gas)
    logger.info('Whitelisting wallet', { walletAddress, chainId })
    const { transactionHash, gasCost } = await whitelistWallet(walletAddress, chainId)

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
 * when they first attempt to create a pool. This prevents spam while maintaining
 * a smooth user experience.
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
  },
  preparePoolCreationHandler
)
