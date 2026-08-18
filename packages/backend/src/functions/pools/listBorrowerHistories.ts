import { ListBorrowerHistoriesRequest, ListBorrowerHistoriesResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID } from '../../constants'
import { firestore } from '../../services'
import { borrowerHistoriesFor, MAX_BORROWERS_PER_CALL } from '../../services/borrowerHistory'
import { getProvider } from '../../utils/blockchain'

export const listBorrowerHistoriesHandler = async (
  request: CallableRequest<ListBorrowerHistoriesRequest>
): Promise<ListBorrowerHistoriesResponse> => {
  // Gated on authentication like the other feeds, and no further: a history is
  // a summary of the `loans` collection, which any signed-in wallet may already
  // read. Gating it harder would suggest it holds something the loans do not.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to read borrowing histories')
  }

  const borrowers = request.data?.borrowers

  if (!Array.isArray(borrowers) || borrowers.length === 0) {
    throw new HttpsError('invalid-argument', 'At least one borrower address is required')
  }

  if (borrowers.length > MAX_BORROWERS_PER_CALL) {
    throw new HttpsError('invalid-argument', `At most ${MAX_BORROWERS_PER_CALL} borrowers can be summarised in one call`)
  }

  const chainId = request.data?.chainId || DEFAULT_CHAIN_ID

  try {
    /*
      Chain time, not server time.

      `overdue` is a judgement about a moment, and the two clocks disagree: the
      verification scripts push a local node months ahead, so a history judged
      against `Date.now()` reports every loan on it as comfortably inside its
      term — a bug that looks exactly like the arithmetic being wrong. One
      `getBlock('latest')` per call buys the right answer, which is the same
      trade `sendDueReminders` makes.
    */
    const latest = await getProvider(chainId).getBlock('latest')

    if (!latest) throw new Error(`No latest block for chain ${chainId}; cannot judge lateness`)

    const histories = await borrowerHistoriesFor(borrowers, chainId, latest.timestamp, firestore)

    logger.info(`Summarised ${Object.keys(histories).length} borrowing histories`, { chainId, asOf: latest.timestamp })

    return { histories, asOf: new Date(latest.timestamp * 1000).toISOString() }
  } catch (error) {
    logger.error('Error listing borrower histories', {
      error: error instanceof Error ? error.message : String(error),
      params: request.data,
    })

    throw new HttpsError('internal', 'Failed to read borrowing histories. Please try again.')
  }
}

/**
 * Cloud Function to summarise what wallets have done with money they borrowed.
 *
 * Counts rather than a score, deliberately, and **nothing anywhere gates on
 * them** — see `BorrowerHistory`. A wallet that has never borrowed comes back
 * as `isNew`, which is a different thing from a wallet that borrowed and never
 * repaid, and the distinction is what keeps the product usable for the people
 * it is for.
 *
 * Summarised here rather than in the app because the app's version is derived
 * from one page of the loan feed, so a wallet with more loans than that page
 * is judged on part of its record.
 *
 * @param {CallableRequest<ListBorrowerHistoriesRequest>} request the wallets to summarise
 * @returns {Promise<ListBorrowerHistoriesResponse>} one record per wallet, and the chain time they were judged at
 * @throws {HttpsError} If unauthenticated, given no wallets or too many, or the chain is unreachable
 */
export const listBorrowerHistories = onCall<ListBorrowerHistoriesRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listBorrowerHistoriesHandler
)
