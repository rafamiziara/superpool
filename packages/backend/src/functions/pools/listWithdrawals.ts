import { ListWithdrawalsRequest, ListWithdrawalsResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, WITHDRAWALS_COLLECTION } from '../../constants'
import { firestore } from '../../services'

/** Mirrors the cap in the Firestore rules, which reject a larger `list`. */
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export const listWithdrawalsHandler = async (request: CallableRequest<ListWithdrawalsRequest>): Promise<ListWithdrawalsResponse> => {
  // Gated for the same reason as `listContributions`: this ties a wallet address
  // to an amount, and serving it anonymously would make the collection trivially
  // scrapeable in one request even though it is all public on chain.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to list withdrawals')
  }

  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, request.data.limit || DEFAULT_LIMIT))
    const chainId = request.data.chainId || DEFAULT_CHAIN_ID
    // The indexer lowercases what it stores, so the filter must too — wallets
    // report addresses checksummed and would otherwise match nothing.
    const member = request.data.member?.toLowerCase()

    let query = firestore.collection(WITHDRAWALS_COLLECTION).where('chainId', '==', chainId)

    if (request.data.poolId !== undefined) {
      query = query.where('poolId', '==', request.data.poolId)
    }

    if (member) {
      query = query.where('member', '==', member)
    }

    const totalSnapshot = await query.count().get()
    const totalCount = totalSnapshot.data().count

    const snapshot = await query.orderBy('withdrawnAt', 'desc').limit(limit).get()

    const withdrawals = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        poolId: data.poolId,
        poolAddress: data.poolAddress,
        member: data.member,
        amount: data.amount,
        chainId: data.chainId,
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        blockNumber: data.blockNumber,
        // ISO string, not a Date: the callable encoder turns a Date into `{}`.
        withdrawnAt: (data.withdrawnAt?.toDate() || new Date()).toISOString(),
      }
    })

    logger.info(`Retrieved ${withdrawals.length} withdrawals`, { totalCount, chainId, limit })

    return { withdrawals, totalCount, limit }
  } catch (error) {
    logger.error('Error listing withdrawals', {
      error: error instanceof Error ? error.message : String(error),
      params: request.data,
    })

    throw new HttpsError('internal', 'Failed to list withdrawals. Please try again.')
  }
}

/**
 * Cloud Function to list indexed liquidity withdrawals.
 *
 * The app subtracts these from the contributions to get a member's position and
 * a pool's liquidity. Neither total is stored, so neither can fall out of step
 * with the chain.
 *
 * @param {CallableRequest<ListWithdrawalsRequest>} request Filtering options
 * @returns {Promise<ListWithdrawalsResponse>} Matching withdrawals, newest first
 * @throws {HttpsError} If unauthenticated or the query fails
 */
export const listWithdrawals = onCall<ListWithdrawalsRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listWithdrawalsHandler
)
