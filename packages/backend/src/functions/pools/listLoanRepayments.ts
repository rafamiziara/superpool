import { ListLoanRepaymentsRequest, ListLoanRepaymentsResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, LOAN_REPAYMENTS_COLLECTION } from '../../constants'
import { firestore } from '../../services'

/** Mirrors the cap in the Firestore rules, which reject a larger `list`. */
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export const listLoanRepaymentsHandler = async (
  request: CallableRequest<ListLoanRepaymentsRequest>
): Promise<ListLoanRepaymentsResponse> => {
  // Gated for the same reason as `listContributions`: this ties a wallet
  // address to an amount, and serving it anonymously would make the collection
  // trivially scrapeable in one request even though it is all public on chain.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to list loan repayments')
  }

  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, request.data.limit || DEFAULT_LIMIT))
    const chainId = request.data.chainId || DEFAULT_CHAIN_ID
    // The indexer lowercases what it stores, so the filter must too — wallets
    // report addresses checksummed and would otherwise match nothing.
    const borrower = request.data.borrower?.toLowerCase()

    let query = firestore.collection(LOAN_REPAYMENTS_COLLECTION).where('chainId', '==', chainId)

    if (request.data.poolId !== undefined) {
      query = query.where('poolId', '==', request.data.poolId)
    }

    // Only meaningful alongside a pool: loan ids restart at 1 in every pool
    // clone, so this on its own would match one loan per pool on the chain.
    if (request.data.loanId !== undefined) {
      query = query.where('loanId', '==', request.data.loanId)
    }

    if (borrower) {
      query = query.where('borrower', '==', borrower)
    }

    const totalSnapshot = await query.count().get()
    const totalCount = totalSnapshot.data().count

    const snapshot = await query.orderBy('repaidAt', 'desc').limit(limit).get()

    const repayments = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        loanId: data.loanId,
        poolId: data.poolId,
        poolAddress: data.poolAddress,
        borrower: data.borrower,
        amount: data.amount,
        chainId: data.chainId,
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        blockNumber: data.blockNumber,
        // ISO string, not a Date: the callable encoder turns a Date into `{}`.
        repaidAt: (data.repaidAt?.toDate() || new Date()).toISOString(),
      }
    })

    logger.info(`Retrieved ${repayments.length} loan repayments`, { totalCount, chainId, limit })

    return { repayments, totalCount, limit }
  } catch (error) {
    logger.error('Error listing loan repayments', {
      error: error instanceof Error ? error.message : String(error),
      params: request.data,
    })

    throw new HttpsError('internal', 'Failed to list loan repayments. Please try again.')
  }
}

/**
 * Cloud Function to list payments made towards loans.
 *
 * Separate from `listLoans` because the two answer different questions and
 * neither can be derived from the other: a loan says how much is still owed
 * right now, and these say when each instalment arrived and in which
 * transaction. Before loans could be paid in parts the second question had one
 * answer per loan and lived on the loan record; it does not any more.
 *
 * @param {CallableRequest<ListLoanRepaymentsRequest>} request Filtering options
 * @returns {Promise<ListLoanRepaymentsResponse>} Matching payments, newest first
 * @throws {HttpsError} If unauthenticated or the query fails
 */
export const listLoanRepayments = onCall<ListLoanRepaymentsRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listLoanRepaymentsHandler
)
