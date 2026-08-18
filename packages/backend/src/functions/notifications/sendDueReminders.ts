import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { SUPPORTED_CHAINS } from '../../constants'
import { firestore } from '../../services'
import { DueReminderResult, remindChain } from '../../services/dueReminders'
import { getProvider } from '../../utils/blockchain'

/**
 * Remind every chain's borrowers about the dates on their loans.
 *
 * Walks the chains in turn and **one failure does not stop the rest**, exactly
 * as the event sweep does: an unreachable public RPC is ordinary, and letting
 * it abort the run would mean a flaky testnet endpoint silently stopping
 * localhost reminders too.
 */
export const sendDueRemindersHandler = async (): Promise<DueReminderResult[]> => {
  const results: DueReminderResult[] = []

  for (const chain of SUPPORTED_CHAINS) {
    // The same gate the sweep uses: a chain with no factory has no pools this
    // backend indexed, so it has no loans to remind anyone about.
    if (!chain.poolFactoryAddress) continue

    try {
      results.push(await remindChain(chain.chainId, getProvider(chain.chainId), firestore))
    } catch (error) {
      logger.error('Due reminders failed for chain; continuing with the rest', {
        chainId: chain.chainId,
        name: chain.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

/**
 * Scheduled Cloud Function that runs once an hour.
 *
 * Hourly rather than every five minutes like the sweep, because the sweep is
 * chasing events that a user is waiting on and this is chasing a date. A
 * borrower reminded a day before their term ends does not care which hour it
 * arrived in, and each reminder is sent **once ever** — the schedule decides
 * the resolution of that one send, not how often anybody is bothered.
 *
 * Scheduled functions do not fire in the Firebase emulator; use the
 * `sendDueRemindersNow` callable to run the same scan locally.
 */
export const sendDueReminders = onSchedule(
  {
    schedule: 'every 60 minutes',
    memory: '256MiB',
    timeoutSeconds: 300,
  },
  async (): Promise<void> => {
    try {
      await sendDueRemindersHandler()
    } catch (error) {
      logger.error('Scheduled due reminders failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
)

export const sendDueRemindersNowHandler = async (request: CallableRequest<void>): Promise<DueReminderResult[]> => {
  // Same rule as `syncPoolEventsNow`: open in the emulator, where there is no
  // signed-in user and this is the only way to exercise the scan at all;
  // authenticated everywhere else, because it is an unbounded run of reads and
  // sends that a stranger should not be able to start.
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true'

  if (!isEmulator && !request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to trigger due reminders')
  }

  try {
    return await sendDueRemindersHandler()
  } catch (error) {
    logger.error('Manual due reminders failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to send due reminders. Please try again.')
  }
}

/**
 * Cloud Function to run the due-reminder scan on demand.
 *
 * The manual twin of the `sendDueReminders` schedule, and the only way to see
 * it work locally. Safe to call repeatedly: every reminder is claimed in
 * `notifications_sent` before it is sent, so a second run tells nobody
 * anything twice.
 *
 * @param {CallableRequest<void>} request no parameters; every configured chain is scanned
 * @returns {Promise<DueReminderResult[]>} one result per chain that was reachable
 * @throws {HttpsError} If unauthenticated outside the emulator, or the scan fails
 */
export const sendDueRemindersNow = onCall<void>(
  {
    memory: '256MiB',
    timeoutSeconds: 300,
    cors: true,
  },
  sendDueRemindersNowHandler
)
