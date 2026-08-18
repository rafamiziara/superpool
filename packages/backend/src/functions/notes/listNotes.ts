import { ListNotesRequest, ListNotesResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID } from '../../constants'
import { firestore } from '../../services'
import { listNotes as list } from '../../services/notes'

/** Mirrors the cap the other feeds use. Notes are the sparsest of them. */
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export const listNotesHandler = async (request: CallableRequest<ListNotesRequest>): Promise<ListNotesResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to read notes')
  }

  try {
    const limit = Math.min(MAX_LIMIT, Math.max(1, request.data?.limit || DEFAULT_LIMIT))
    const chainId = request.data?.chainId || DEFAULT_CHAIN_ID

    const { notes, totalCount } = await list(
      {
        // From the token, like every entitlement in this project. A caller who
        // could name the wallet could read anybody's notes.
        caller: request.auth.uid,
        chainId,
        poolId: request.data?.poolId,
        recordId: request.data?.recordId,
        limit,
      },
      firestore
    )

    logger.info(`Retrieved ${notes.length} notes`, { totalCount, chainId, poolId: request.data?.poolId, limit })

    return { notes, totalCount, limit }
  } catch (error) {
    logger.error('Error listing notes', {
      error: error instanceof Error ? error.message : String(error),
      params: request.data,
    })

    throw new HttpsError('internal', 'Failed to list notes. Please try again.')
  }
}

/**
 * Cloud Function to read the notes a caller is entitled to.
 *
 * The only feed in this project that is not world-readable to any signed-in
 * wallet, because it is the only one that does not mirror the chain. A pool's
 * owner sees the notes on their own pool; everybody else sees the notes about
 * themselves. Other members of a pool are deliberately excluded — widening
 * this later is a one-line change, narrowing it after people have written
 * things is not.
 *
 * An unentitled caller gets an empty list rather than an error: refusing would
 * confirm that a note exists.
 *
 * @param {CallableRequest<ListNotesRequest>} request Filtering options
 * @returns {Promise<ListNotesResponse>} Matching notes, newest first
 * @throws {HttpsError} If unauthenticated or the query fails
 */
export const listNotes = onCall<ListNotesRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listNotesHandler
)
