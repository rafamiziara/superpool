import { ContributionInfo, IndexContributionRequest, IndexContributionResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, getChainConfig } from '../../constants'
import { indexByTransactionSchema } from '../../schemas'
import { firestore } from '../../services'
import { contributionDocId, indexContributionsByTxHash, ParsedContributionEvent } from '../../services/contributionIndexer'
import { parseRequest } from '../../utils/validation'
import { getProvider } from '../../utils/blockchain'

/** Firestore's Date becomes an ISO string on the wire; see ContributionInfo. */
function toContributionInfo(contribution: ParsedContributionEvent): ContributionInfo {
  return {
    id: contributionDocId(contribution.chainId, contribution.transactionHash, contribution.logIndex),
    poolId: contribution.poolId,
    poolAddress: contribution.poolAddress,
    contributor: contribution.contributor,
    amount: contribution.amount,
    chainId: contribution.chainId,
    transactionHash: contribution.transactionHash,
    logIndex: contribution.logIndex,
    blockNumber: contribution.blockNumber,
    contributedAt: contribution.contributedAt.toISOString(),
  }
}

export const indexContributionHandler = async (request: CallableRequest<IndexContributionRequest>): Promise<IndexContributionResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to index contributions')
  }

  const { txHash, chainId: requestedChainId } = parseRequest(indexByTransactionSchema, request.data)

  const chainId = requestedChainId ?? DEFAULT_CHAIN_ID
  const chainConfig = getChainConfig(chainId)

  if (!chainConfig) {
    throw new HttpsError('invalid-argument', `Unsupported chain ID: ${chainId}`)
  }

  // The factory is what maps a pool address back to its id, so indexing a
  // deposit needs it just as much as creating a pool does.
  if (!chainConfig.poolFactoryAddress) {
    throw new HttpsError('internal', `PoolFactory address not configured for chain ${chainId}`)
  }

  logger.info('Indexing contribution by transaction hash', { txHash, chainId })

  try {
    const provider = getProvider(chainId)
    const { contributions, results } = await indexContributionsByTxHash(
      txHash,
      chainId,
      chainConfig.poolFactoryAddress,
      provider,
      firestore
    )

    const storedCount = results.filter((result) => result.stored).length

    logger.info('Contribution indexing completed', {
      txHash,
      chainId,
      count: contributions.length,
      storedCount,
    })

    return {
      contributions: contributions.map(toContributionInfo),
      storedCount,
      // True only when this call wrote nothing at all — a partially new
      // transaction is not "already indexed" in any useful sense.
      alreadyIndexed: storedCount === 0,
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error('Failed to index contribution', {
      txHash,
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to index contribution. Please try again.')
  }
}

/**
 * Cloud Function to index a liquidity contribution by its transaction hash.
 *
 * Called by the mobile app immediately after a `depositFunds` transaction is
 * confirmed, so the contribution appears without waiting for a scheduled sync.
 *
 * @param {CallableRequest<IndexContributionRequest>} request txHash and optional chainId
 * @returns {Promise<IndexContributionResponse>} the indexed contributions and how many were new
 * @throws {HttpsError} If unauthenticated, invalid args, or indexing fails
 */
export const indexContribution = onCall<IndexContributionRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  indexContributionHandler
)
