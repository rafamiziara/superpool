import { ListLoansRequest, ListLoansResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, LOANS_COLLECTION } from '../../constants'
import { firestore } from '../../services'

/** Mirrors the cap in the Firestore rules, which reject a larger `list`. */
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

/** The two states a loan can be in while the money is still out. */
const OPEN_STATUSES = ['disbursed', 'defaulted']

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

    // Outstanding debt: money that is out and not yet back. Both halves matter
    // now that a loan can exist without having been funded — a pending request
    // is not repaid either, and would otherwise read as active.
    //
    // **`defaulted` belongs here.** A declaration is a judgement on a debt, not
    // a settlement of one: narrowing this to `disbursed` alone would drop the
    // loans most worth chasing, and would take a borrower's own debt off their
    // repay screen at the exact moment it was declared.
    if (request.data.activeOnly) {
      query = query.where('status', 'in', OPEN_STATUSES).where('isRepaid', '==', false)
    }

    // What a pool owner has to decide on.
    if (request.data.pendingOnly) {
      query = query.where('status', '==', 'requested')
    }

    // Narrower than "overdue", which needs no query: a due date is
    // `startedAt + duration` and any reader can work it out.
    if (request.data.defaultedOnly) {
      query = query.where('status', '==', 'defaulted')
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
        // Absent on loans indexed before instalments were possible, and those
        // were all-or-nothing: `isRepaid` already says which end they are at,
        // so '0' loses nothing that was ever recorded.
        amountRepaid: data.amountRepaid ?? '0',
        // Absent on records indexed before interest accrued. Falling back to
        // the whole principal is the safe direction — it says the debt is
        // outstanding rather than settled — and the next sweep fills it in.
        principalOutstanding: data.principalOutstanding ?? data.amount,
        interestOutstanding: data.interestOutstanding ?? '0',
        // Left off entirely rather than sent as null, like `repaidAt`: absent
        // is the statement that these figures do not accrue.
        ...(data.accruedAt ? { accruedAt: data.accruedAt.toDate().toISOString() } : {}),
        // Left off entirely rather than sent as null when the loan is
        // outstanding: the field means "settled at this moment", and there is
        // no moment. Also absent on a loan repaid before the contract recorded
        // one, which is why `isRepaid` and not this says whether it was repaid.
        ...(data.repaidAt ? { repaidAt: data.repaidAt.toDate().toISOString() } : {}),
        // Absent on every loan nobody declared, which is almost all of them,
        // and left off rather than nulled like the two stamps above.
        ...(data.defaultedAt ? { defaultedAt: data.defaultedAt.toDate().toISOString() } : {}),
        // Absent on loans indexed before the approval step shipped; they were
        // all disbursed, which is what the contract's enum zero means too.
        status: data.status ?? 'disbursed',
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
 * Each record is a loan's current state rather than an event, so a repaid or
 * rejected loan stays in the list as history. `activeOnly` narrows to
 * outstanding debt, `pendingOnly` to requests awaiting the pool owner.
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
