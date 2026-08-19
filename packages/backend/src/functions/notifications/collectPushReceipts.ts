import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { firestore } from '../../services'
import { collectReceipts, CollectResult } from '../../services/pushReceipts'

/**
 * Ask Expo what became of the messages it accepted.
 *
 * The second half of every send. `/push/send` answers with a ticket — "queued"
 * — and the delivery verdict arrives minutes later from `/push/getReceipts`.
 * `DeviceNotRegistered` is written into the receipt rather than the ticket,
 * because at ticket time Expo has not yet spoken to Apple or Google, so
 * everything the send path prunes is a small fraction of what should be pruned.
 * This is where a dead token actually goes.
 *
 * Not per chain, unlike the sweep and the reminders: a push token belongs to a
 * device and a wallet, and nothing about it is chain-shaped.
 */
export const collectPushReceiptsHandler = async (): Promise<CollectResult> => {
  return collectReceipts(firestore)
}

/**
 * Scheduled Cloud Function that runs every fifteen minutes.
 *
 * Matched to the delay a ticket waits before it is worth asking about, so a
 * receipt is collected on the first run that can answer it rather than sitting
 * for most of another cycle. Faster would mostly fetch "no receipt yet"; slower
 * would leave dead tokens being POSTed to for longer, which is the whole cost
 * this is here to stop.
 *
 * The run is bounded, so a backlog drains over several cycles instead of one
 * long invocation — and a row whose receipt never arrives is dropped at 24
 * hours, because Expo has discarded it by then and nobody will ever answer.
 *
 * Scheduled functions do not fire in the Firebase emulator; use the
 * `collectPushReceiptsNow` callable to run the same pass locally.
 */
export const collectPushReceipts = onSchedule(
  {
    schedule: 'every 15 minutes',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async (): Promise<void> => {
    try {
      await collectPushReceiptsHandler()
    } catch (error) {
      logger.error('Scheduled push receipt collection failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
)

export const collectPushReceiptsNowHandler = async (request: CallableRequest<void>): Promise<CollectResult> => {
  // Same rule as `sendDueRemindersNow` and `syncPoolEventsNow`: open in the
  // emulator, where schedules never fire and there is no signed-in user, and
  // behind authentication everywhere else.
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'

  if (!isEmulator && !request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to collect push receipts')
  }

  try {
    return await collectPushReceiptsHandler()
  } catch (error) {
    logger.error('Manual push receipt collection failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to collect push receipts. Please try again.')
  }
}

/**
 * Cloud Function to collect push receipts on demand.
 *
 * Exists because the scheduled version cannot be exercised locally at all, and
 * this is the half of push that a dev build *can* verify without a device: a
 * token that is no longer registered should disappear from `push_tokens` after
 * one pass.
 *
 * @param {CallableRequest<void>} request no parameters; the whole queue is drained
 * @returns {Promise<CollectResult>} what the pass did
 * @throws {HttpsError} If unauthenticated outside the emulator, or the pass fails
 */
export const collectPushReceiptsNow = onCall<void>(
  {
    memory: '256MiB',
    timeoutSeconds: 300,
    cors: true,
  },
  collectPushReceiptsNowHandler
)
