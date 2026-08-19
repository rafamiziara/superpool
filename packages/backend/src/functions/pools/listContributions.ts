import { ListContributionsRequest, ListContributionsResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { CONTRIBUTIONS_COLLECTION, DEFAULT_CHAIN_ID } from '../../constants'
import { listContributionsSchema } from '../../schemas'
import { firestore } from '../../services'
import { parseRequest } from '../../utils/validation'

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

  // Outside the `try`: the catch below reports everything as `internal`, and a
  // malformed request is the caller's to fix rather than something to retry.
  const data = parseRequest(listContributionsSchema, request.data)

  try {
    const limit = Math.min(MAX_LIMIT, data.limit ?? DEFAULT_LIMIT)
    const chainId = data.chainId ?? DEFAULT_CHAIN_ID
    // The indexer lowercases what it stores, so the filter must lowercase too —
    // wallets report addresses checksummed and would otherwise match nothing.
    const contributor = data.contributor?.toLowerCase()

    let query = firestore.collection(CONTRIBUTIONS_COLLECTION).where('chainId', '==', chainId)

    if (data.poolId !== undefined) {
      query = query.where('poolId', '==', data.poolId)
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
      params: data,
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
