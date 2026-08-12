import { ListInterestClaimsRequest, ListInterestClaimsResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, INTEREST_CLAIMS_COLLECTION } from '../../constants'
import { firestore } from '../../services'

/** Mirrors the cap in the Firestore rules, which reject a larger `list`. */
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export const listInterestClaimsHandler = async (
  request: CallableRequest<ListInterestClaimsRequest>
): Promise<ListInterestClaimsResponse> => {
  // Gated for the same reason as `listContributions`: this ties a wallet address
  // to an amount, and serving it anonymously would make the collection trivially
  // scrapeable in one request even though it is all public on chain.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to list interest claims')
  }

  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, request.data.limit || DEFAULT_LIMIT))
    const chainId = request.data.chainId || DEFAULT_CHAIN_ID
    // The indexer lowercases what it stores, so the filter must too — wallets
    // report addresses checksummed and would otherwise match nothing.
    const account = request.data.account?.toLowerCase()

    let query = firestore.collection(INTEREST_CLAIMS_COLLECTION).where('chainId', '==', chainId)

    if (request.data.poolId !== undefined) {
      query = query.where('poolId', '==', request.data.poolId)
    }

    if (account) {
      query = query.where('account', '==', account)
    }

    const totalSnapshot = await query.count().get()
    const totalCount = totalSnapshot.data().count

    const snapshot = await query.orderBy('claimedAt', 'desc').limit(limit).get()

    const claims = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        poolId: data.poolId,
        poolAddress: data.poolAddress,
        account: data.account,
        amount: data.amount,
        chainId: data.chainId,
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        blockNumber: data.blockNumber,
        // ISO string, not a Date: the callable encoder turns a Date into `{}`.
        claimedAt: (data.claimedAt?.toDate() || new Date()).toISOString(),
      }
    })

    logger.info(`Retrieved ${claims.length} interest claims`, { totalCount, chainId, limit })

    return { claims, totalCount, limit }
  } catch (error) {
    logger.error('Error listing interest claims', {
      error: error instanceof Error ? error.message : String(error),
      params: request.data,
    })

    throw new HttpsError('internal', 'Failed to list interest claims. Please try again.')
  }
}

/**
 * Cloud Function to list indexed interest claims.
 *
 * A member's lifetime earnings are these summed with whatever `claimable`
 * currently reports on chain. Neither half is stored as a total, so neither can
 * fall out of step.
 *
 * @param {CallableRequest<ListInterestClaimsRequest>} request Filtering options
 * @returns {Promise<ListInterestClaimsResponse>} Matching claims, newest first
 * @throws {HttpsError} If unauthenticated or the query fails
 */
export const listInterestClaims = onCall<ListInterestClaimsRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listInterestClaimsHandler
)
