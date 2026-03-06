import { IndexPoolRequest, IndexPoolResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, getChainConfig } from '../../constants'
import { firestore } from '../../services'
import { indexPoolByTxHash } from '../../services/eventIndexer'
import { getProvider } from '../../utils/blockchain'

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/

export const indexPoolHandler = async (request: CallableRequest<IndexPoolRequest>): Promise<IndexPoolResponse> => {
  // 1. Require auth
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to index pools')
  }

  // 2. Validate txHash format
  const { txHash, chainId: requestedChainId } = request.data

  if (!txHash || !TX_HASH_REGEX.test(txHash)) {
    throw new HttpsError('invalid-argument', 'Invalid transaction hash format')
  }

  // 3. Resolve chainId
  const chainId = requestedChainId || DEFAULT_CHAIN_ID

  // 4. Validate chain is supported
  if (!getChainConfig(chainId)) {
    throw new HttpsError('invalid-argument', `Unsupported chain ID: ${chainId}`)
  }

  logger.info('Indexing pool by transaction hash', { txHash, chainId })

  try {
    // 5. Get provider
    const provider = getProvider(chainId)

    // 6. Index pool by tx hash (may throw HttpsError for not-found / failed-precondition)
    const result = await indexPoolByTxHash(txHash, chainId, provider, firestore)

    logger.info('Pool indexing completed', {
      txHash,
      chainId,
      poolId: result.poolId,
      alreadyIndexed: result.alreadyIndexed,
      stored: result.stored,
    })

    // 7. Return response
    return {
      poolId: result.poolId,
      alreadyIndexed: result.alreadyIndexed,
      stored: result.stored,
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error('Failed to index pool', {
      txHash,
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to index pool. Please try again.')
  }
}

/**
 * Cloud Function to index a pool by its creation transaction hash.
 *
 * Called by the mobile app immediately after a pool creation tx is confirmed,
 * to write the pool into Firestore without waiting for the scheduled sync.
 *
 * @param {CallableRequest<IndexPoolRequest>} request txHash and optional chainId
 * @returns {Promise<IndexPoolResponse>} poolId, alreadyIndexed, stored flags
 * @throws {HttpsError} If unauthenticated, invalid args, or indexing fails
 */
export const indexPool = onCall<IndexPoolRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  indexPoolHandler
)
