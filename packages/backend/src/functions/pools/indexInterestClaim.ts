import { IndexInterestClaimRequest, IndexInterestClaimResponse, InterestClaimInfo } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, getChainConfig } from '../../constants'
import { firestore } from '../../services'
import { indexInterestClaimsByTxHash, interestClaimDocId, ParsedInterestClaimEvent } from '../../services/interestClaimIndexer'
import { getProvider } from '../../utils/blockchain'

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/

/** Firestore's Date becomes an ISO string on the wire; see InterestClaimInfo. */
function toInterestClaimInfo(claim: ParsedInterestClaimEvent): InterestClaimInfo {
  return {
    id: interestClaimDocId(claim.chainId, claim.transactionHash, claim.logIndex),
    poolId: claim.poolId,
    poolAddress: claim.poolAddress,
    account: claim.account,
    amount: claim.amount,
    chainId: claim.chainId,
    transactionHash: claim.transactionHash,
    logIndex: claim.logIndex,
    blockNumber: claim.blockNumber,
    claimedAt: claim.claimedAt.toISOString(),
  }
}

export const indexInterestClaimHandler = async (
  request: CallableRequest<IndexInterestClaimRequest>
): Promise<IndexInterestClaimResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to index interest claims')
  }

  const { txHash, chainId: requestedChainId } = request.data

  if (!txHash || !TX_HASH_REGEX.test(txHash)) {
    throw new HttpsError('invalid-argument', 'Invalid transaction hash format')
  }

  const chainId = requestedChainId || DEFAULT_CHAIN_ID
  const chainConfig = getChainConfig(chainId)

  if (!chainConfig) {
    throw new HttpsError('invalid-argument', `Unsupported chain ID: ${chainId}`)
  }

  // The factory is what maps a pool address back to its id, and what proves the
  // address is a pool of ours at all.
  if (!chainConfig.poolFactoryAddress) {
    throw new HttpsError('internal', `PoolFactory address not configured for chain ${chainId}`)
  }

  logger.info('Indexing interest claim by transaction hash', { txHash, chainId })

  try {
    const provider = getProvider(chainId)
    const { claims, results } = await indexInterestClaimsByTxHash(txHash, chainId, chainConfig.poolFactoryAddress, provider, firestore)

    const storedCount = results.filter((result) => result.stored).length

    logger.info('Interest claim indexing completed', {
      txHash,
      chainId,
      count: claims.length,
      storedCount,
    })

    return {
      claims: claims.map(toInterestClaimInfo),
      storedCount,
      // True only when this call wrote nothing at all.
      alreadyIndexed: storedCount === 0,
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error('Failed to index interest claim', {
      txHash,
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to index interest claim. Please try again.')
  }
}

/**
 * Cloud Function to index an interest claim by its transaction hash.
 *
 * Called by the mobile app immediately after a `claimInterest` transaction is
 * confirmed, so the earnings figure settles without waiting for a sync.
 *
 * @param {CallableRequest<IndexInterestClaimRequest>} request txHash and optional chainId
 * @returns {Promise<IndexInterestClaimResponse>} the indexed claims and how many were new
 * @throws {HttpsError} If unauthenticated, invalid args, or indexing fails
 */
export const indexInterestClaim = onCall<IndexInterestClaimRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  indexInterestClaimHandler
)
