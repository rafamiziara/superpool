import { ListLoansRequest, ListLoansResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, LOANS_COLLECTION } from '../../constants'
import { firestore } from '../../services'

/** Mirrors the cap in the Firestore rules, which reject a larger `list`. */
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export const listLoansHandler = async (request: CallableRequest<ListLoansRequest>): Promise<ListLoansResponse> => {
  // Gated like the other feeds: this ties a wallet to a debt, and serving it
  // anonymously would make the collection trivially scrapeable in one request
  // even though every loan is public on chain.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to list loans')
  }

  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, request.data.limit || DEFAULT_LIMIT))
    const chainId = request.data.chainId || DEFAULT_CHAIN_ID
    // The indexer lowercases what it stores, so the filter must too — wallets
    // report addresses checksummed and would otherwise match nothing.
    const borrower = request.data.borrower?.toLowerCase()

    let query = firestore.collection(LOANS_COLLECTION).where('chainId', '==', chainId)

    if (request.data.poolId !== undefined) {
      query = query.where('poolId', '==', request.data.poolId)
    }

    if (borrower) {
      query = query.where('borrower', '==', borrower)
    }

    // `isRepaid` is the contract's only lifecycle bit — repayment is
    // all-or-nothing — so "outstanding" is exactly its negation.
    if (request.data.activeOnly) {
      query = query.where('isRepaid', '==', false)
    }

    const totalSnapshot = await query.count().get()
    const totalCount = totalSnapshot.data().count

    const snapshot = await query.orderBy('startedAt', 'desc').limit(limit).get()

    const loans = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        loanId: data.loanId,
        poolId: data.poolId,
        poolAddress: data.poolAddress,
        borrower: data.borrower,
        amount: data.amount,
        interestRate: data.interestRate,
        duration: data.duration,
        // ISO string, not a Date: the callable encoder turns a Date into `{}`.
        startedAt: (data.startedAt?.toDate() || new Date()).toISOString(),
        isRepaid: data.isRepaid,
        chainId: data.chainId,
        transactionHash: data.transactionHash,
        blockNumber: data.blockNumber,
      }
    })

    logger.info(`Retrieved ${loans.length} loans`, { totalCount, chainId, limit })

    return { loans, totalCount, limit }
  } catch (error) {
    logger.error('Error listing loans', {
      error: error instanceof Error ? error.message : String(error),
      params: request.data,
    })

    throw new HttpsError('internal', 'Failed to list loans. Please try again.')
  }
}

/**
 * Cloud Function to list indexed loans.
 *
 * Each record is a loan's current state rather than an event, so a repaid loan
 * stays in the list with `isRepaid` true — the app shows it as history and uses
 * `activeOnly` when it wants only outstanding debt.
 *
 * @param {CallableRequest<ListLoansRequest>} request Filtering options
 * @returns {Promise<ListLoansResponse>} Matching loans, newest first
 * @throws {HttpsError} If unauthenticated or the query fails
 */
export const listLoans = onCall<ListLoansRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listLoansHandler
)
