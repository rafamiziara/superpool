import { ListBorrowerHistoriesRequest, ListBorrowerHistoriesResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, getChainConfig } from '../../constants'
import { listBorrowerHistoriesSchema } from '../../schemas'
import { firestore } from '../../services'
import { borrowerHistoriesFor, emptyHistoriesFor } from '../../services/borrowerHistory'
import { parseRequest } from '../../utils/validation'
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

  // The list and its cap are both in the schema, which is why neither is
  // restated here: an oversized batch was already refused by name rather than
  // trimmed, unlike a page size.
  const { borrowers, chainId: requestedChainId } = parseRequest(listBorrowerHistoriesSchema, request.data)

  const chainId = requestedChainId ?? DEFAULT_CHAIN_ID

  /*
    An unserved chain answers empty, like every sibling — and above the `try`,
    which is the other half of the fix.

    This is the only `list*` endpoint that reads the chain, so it is the only
    one that could refuse a chain the backend does not serve; the other seven
    filter Firestore on `chainId`, match no documents and quietly return
    nothing. That divergence used to be reported as `internal — please try
    again`, because `getProvider` raises a deliberate `invalid-argument` from
    *inside* the try below and the catch collapses everything it sees. A
    permanent condition described as a transient one, on a healthy server.

    Empty is the true answer rather than a convenient one: a chain with no
    configuration has no indexed loans, and a wallet with no record is `isNew`.
    Every wallet asked about still comes back — see
    `ListBorrowerHistoriesResponse.histories`, where an absent key is the one
    thing that would make a caller guess.

    `asOf` is the single exception to this response being chain time, and it
    has to be: there is no chain here to read a block from. Nothing was judged
    against it — there are no loans — so it dates the answer rather than a
    comparison.
  */
  if (!getChainConfig(chainId)) {
    logger.info('No configuration for this chain; answering with empty histories', { chainId })

    return { histories: emptyHistoriesFor(borrowers), asOf: new Date().toISOString() }
  }

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
    // A deliberate refusal keeps its own code. Without this, anything raised on
    // purpose in the block above comes back as a retryable `internal` and the
    // caller is invited to keep trying something that can never work — the same
    // guard `assessLoan` and `preparePoolCreation` already carry.
    if (error instanceof HttpsError) throw error

    logger.error('Error listing borrower histories', {
      error: error instanceof Error ? error.message : String(error),
      params: { borrowers, chainId },
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
 * @throws {HttpsError} If unauthenticated, given no wallets or too many, or the chain is unreachable. A
 *   chain this backend does not serve is not an error: it answers empty, like every other feed.
 */
export const listBorrowerHistories = onCall<ListBorrowerHistoriesRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listBorrowerHistoriesHandler
)
