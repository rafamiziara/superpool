import { SyncPoolEventsRequest, SyncPoolEventsResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, getChainConfig, SUPPORTED_CHAIN_IDS } from '../../constants'
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

  const chainId = requestedChainId ?? DEFAULT_CHAIN_ID

  // Refused rather than defaulted: a caller that names a chain this backend
  // does not serve must not have its request quietly answered about a different
  // one, which is what sweeping the default would be.
  if (!getChainConfig(chainId)) {
    throw new HttpsError('invalid-argument', `Unsupported chain ID: ${chainId}. Configured: ${SUPPORTED_CHAIN_IDS.join(', ')}`)
  }

  if (fromBlock !== undefined && (!Number.isInteger(fromBlock) || fromBlock < 0)) {
    throw new HttpsError('invalid-argument', 'fromBlock must be a non-negative integer')
  }

  logger.info('Manual event sync requested', { chainId, fromBlock })

  try {
    return await syncPoolEventsHandler({ chainId, fromBlock })
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
