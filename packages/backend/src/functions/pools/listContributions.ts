import { ListContributionsRequest, ListContributionsResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { CONTRIBUTIONS_COLLECTION, DEFAULT_CHAIN_ID } from '../../constants'
import { firestore } from '../../services'

/** Mirrors the cap in the Firestore rules, which reject a larger `list`. */
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export const listContributionsHandler = async (request: CallableRequest<ListContributionsRequest>): Promise<ListContributionsResponse> => {
  // Unlike `listPools`, this is gated: contributions tie a wallet address to an
  // amount, and while all of it is public on chain, serving it anonymously here
  // would make the collection trivially scrapeable in one request.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to list contributions')
  }

  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, request.data.limit || DEFAULT_LIMIT))
    const chainId = request.data.chainId || DEFAULT_CHAIN_ID
    // The indexer lowercases what it stores, so the filter must lowercase too —
    // wallets report addresses checksummed and would otherwise match nothing.
    const contributor = request.data.contributor?.toLowerCase()

    let query = firestore.collection(CONTRIBUTIONS_COLLECTION).where('chainId', '==', chainId)

    if (request.data.poolId !== undefined) {
      query = query.where('poolId', '==', request.data.poolId)
    }

    if (contributor) {
      query = query.where('contributor', '==', contributor)
    }

    const totalSnapshot = await query.count().get()
    const totalCount = totalSnapshot.data().count

    const snapshot = await query.orderBy('contributedAt', 'desc').limit(limit).get()

    const contributions = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        poolId: data.poolId,
        poolAddress: data.poolAddress,
        contributor: data.contributor,
        amount: data.amount,
        chainId: data.chainId,
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        blockNumber: data.blockNumber,
        // ISO string, not a Date: the callable encoder turns a Date into `{}`.
        contributedAt: (data.contributedAt?.toDate() || new Date()).toISOString(),
      }
    })

    logger.info(`Retrieved ${contributions.length} contributions`, { totalCount, chainId, limit })

    return { contributions, totalCount, limit }
  } catch (error) {
    logger.error('Error listing contributions', {
      error: error instanceof Error ? error.message : String(error),
      params: request.data,
    })

    throw new HttpsError('internal', 'Failed to list contributions. Please try again.')
  }
}

/**
 * Cloud Function to list indexed liquidity contributions.
 *
 * Filters by chain, and optionally by pool and by contributing wallet. The app
 * sums these client-side to derive a member's position and a pool's liquidity —
 * there is no denormalised total to fall out of step with the events.
 *
 * @param {CallableRequest<ListContributionsRequest>} request Filtering options
 * @returns {Promise<ListContributionsResponse>} Matching contributions, newest first
 * @throws {HttpsError} If unauthenticated or the query fails
 */
export const listContributions = onCall<ListContributionsRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listContributionsHandler
)
