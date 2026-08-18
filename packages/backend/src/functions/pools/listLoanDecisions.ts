import { ListLoanDecisionsRequest, ListLoanDecisionsResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, LOAN_DECISIONS_COLLECTION } from '../../constants'
import { firestore } from '../../services'

/** Mirrors the cap in the Firestore rules, which reject a larger `list`. */
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export const listLoanDecisionsHandler = async (request: CallableRequest<ListLoanDecisionsRequest>): Promise<ListLoanDecisionsResponse> => {
  // Gated like every other feed: these events are public on chain, but serving
  // them anonymously would make the collection trivially scrapeable in one
  // request.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to list loan decisions')
  }

  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, request.data.limit || DEFAULT_LIMIT))
    const chainId = request.data.chainId || DEFAULT_CHAIN_ID
    // The indexer lowercases both addresses, so the filters must too — wallets
    // report them checksummed and would otherwise match nothing.
    const borrower = request.data.borrower?.toLowerCase()
    const decidedBy = request.data.decidedBy?.toLowerCase()

    let query = firestore.collection(LOAN_DECISIONS_COLLECTION).where('chainId', '==', chainId)

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

    // A different question from `borrower`, not a narrower one: an owner who
    // borrows from their own pool appears under both.
    if (decidedBy) {
      query = query.where('decidedBy', '==', decidedBy)
    }

    if (request.data.outcome) {
      query = query.where('outcome', '==', request.data.outcome)
    }

    const totalSnapshot = await query.count().get()
    const totalCount = totalSnapshot.data().count

    const snapshot = await query.orderBy('decidedAt', 'desc').limit(limit).get()

    const decisions = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        loanId: data.loanId,
        poolId: data.poolId,
        poolAddress: data.poolAddress,
        borrower: data.borrower,
        amount: data.amount,
        outcome: data.outcome,
        decidedBy: data.decidedBy,
        chainId: data.chainId,
        transactionHash: data.transactionHash,
        logIndex: data.logIndex,
        blockNumber: data.blockNumber,
        // ISO string, not a Date: the callable encoder turns a Date into `{}`.
        decidedAt: (data.decidedAt?.toDate() || new Date()).toISOString(),
      }
    })

    logger.info(`Retrieved ${decisions.length} loan decisions`, { totalCount, chainId, limit })

    return { decisions, totalCount, limit }
  } catch (error) {
    logger.error('Error listing loan decisions', {
      error: error instanceof Error ? error.message : String(error),
      params: request.data,
    })

    throw new HttpsError('internal', 'Failed to list loan decisions. Please try again.')
  }
}

/**
 * Cloud Function to list what a pool decided about its loans.
 *
 * Separate from `listLoans` because the two answer different questions and
 * neither can be derived from the other: a loan says what it is now, and these
 * say what was decided, when, and by whom. A loan approved in March and
 * declared in default in August is one loan record and two decisions.
 *
 * The **reason** behind a decision is not here — it lives in `notes`, which is
 * backend-only in both directions and readable by the two parties alone. This
 * says that a decision happened; a note says what somebody stood behind.
 *
 * @param {CallableRequest<ListLoanDecisionsRequest>} request Filtering options
 * @returns {Promise<ListLoanDecisionsResponse>} Matching decisions, newest first
 * @throws {HttpsError} If unauthenticated or the query fails
 */
export const listLoanDecisions = onCall<ListLoanDecisionsRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listLoanDecisionsHandler
)
