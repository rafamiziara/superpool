import { SyncPoolEventsRequest, SyncPoolEventsResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { ACTIVE_CHAIN_CONFIG } from '../../constants'
import { syncPoolEventsHandler } from './syncPoolEvents'

export const syncPoolEventsNowHandler = async (request: CallableRequest<SyncPoolEventsRequest>): Promise<SyncPoolEventsResponse> => {
  // Scheduled functions do not fire in the emulator, so this callable is the
  // only way to exercise the sweep locally — where there is no signed-in user
  // to require. In deployed environments it stays behind authentication: the
  // sweep writes only what the chain already says, but it is an unbounded run
  // of RPC calls that a stranger should not be able to start.
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'

  if (!isEmulator && !request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to trigger an event sync')
  }

  const { chainId: requestedChainId, fromBlock } = request.data ?? {}

  // Only the active chain is configured; a request for another one would
  // silently sweep the wrong chain if it were ignored.
  if (requestedChainId !== undefined && requestedChainId !== ACTIVE_CHAIN_CONFIG.chainId) {
    throw new HttpsError('invalid-argument', `Unsupported chain ID: ${requestedChainId}`)
  }

  if (fromBlock !== undefined && (!Number.isInteger(fromBlock) || fromBlock < 0)) {
    throw new HttpsError('invalid-argument', 'fromBlock must be a non-negative integer')
  }

  logger.info('Manual event sync requested', { chainId: ACTIVE_CHAIN_CONFIG.chainId, fromBlock })

  try {
    return await syncPoolEventsHandler({ fromBlock })
  } catch (error) {
    if (error instanceof HttpsError) throw error

    logger.error('Manual event sync failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to sync events. Please try again.')
  }
}

/**
 * Cloud Function to run the event sweep on demand.
 *
 * The manual twin of the `syncPoolEvents` schedule, for the two cases the
 * schedule cannot serve: local development, where scheduled functions never
 * fire, and backfilling history that predates the sync state — pass
 * `fromBlock: 0` to re-scan a chain from genesis. Re-scanning is safe; every
 * indexer keys on the log, so nothing is written twice.
 *
 * @param {CallableRequest<SyncPoolEventsRequest>} request optional chainId and fromBlock
 * @returns {Promise<SyncPoolEventsResponse>} the blocks swept and what was newly indexed
 * @throws {HttpsError} If unauthenticated outside the emulator, invalid args, or the sweep fails
 */
export const syncPoolEventsNow = onCall<SyncPoolEventsRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 300,
    cors: true,
  },
  syncPoolEventsNowHandler
)
