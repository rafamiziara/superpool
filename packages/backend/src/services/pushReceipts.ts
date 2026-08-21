import { NotificationKind, PushReceipt } from '@superpool/types'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { PUSH_RECEIPTS_COLLECTION } from '../constants'
import { deletePushToken } from './pushTokens'

/**
 * The second half of sending: finding out whether it arrived.
 *
 * Expo answers `/push/send` with a **ticket**, which means only "queued". The
 * delivery verdict comes from `/push/getReceipts`, asked by ticket id some
 * minutes later — and that is where `DeviceNotRegistered` almost always
 * appears, because the ticket is written before Expo has spoken to Apple or
 * Google at all. Reading tickets alone, which is all this service did until
 * now, prunes a small fraction of the dead tokens it should and leaves the rest
 * being POSTed to for ever.
 */

const EXPO_RECEIPTS_ENDPOINT = 'https://exp.host/--/api/v2/push/getReceipts'

/**
 * How long to leave a ticket alone before asking about it.
 *
 * Expo's own guidance. Asking sooner mostly returns "no receipt yet", which
 * costs a request and answers nothing — and this runs on a schedule, so the
 * only thing haste buys is a token pruned one cycle earlier.
 */
export const RECEIPT_DELAY_MS = 15 * 60 * 1000

/**
 * When to give up on a ticket.
 *
 * Expo discards receipts after about 24 hours, so a row older than that will
 * never be answered by anybody. Without this the queue keeps every ticket that
 * was sent while the service was misconfigured, and re-asks about them for ever.
 */
export const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000

/** Expo's documented cap for one `getReceipts` request. */
const MAX_IDS_PER_REQUEST = 1000

/** A bound on one scheduled run, so a backlog is drained over several. */
const MAX_BATCHES_PER_RUN = 5

/**
 * Errors that mean **this token** is dead.
 *
 * Deliberately just the one. `MismatchSenderId` and `InvalidCredentials` are
 * faults in the project's own FCM or APNs setup: they arrive on *every* message
 * at once, and pruning on them would empty `push_tokens` — every device, every
 * wallet — because somebody uploaded the wrong key. `MessageTooBig` and
 * `MessageRateExceeded` are faults in what was sent, and say nothing about the
 * recipient either. All of them are worth a loud log and none is worth a delete.
 */
const PRUNABLE_ERRORS = new Set(['DeviceNotRegistered'])

interface ExpoPushReceipt {
  status: 'ok' | 'error'
  message?: string
  details?: { error?: string }
}

/** One accepted ticket, waiting to be asked about. */
export interface AcceptedTicket {
  ticketId: string
  token: string
  kind: NotificationKind
}

export interface CollectResult {
  /** Receipts Expo had an answer for. */
  checked: number
  /** Tokens deleted because the device is gone. */
  pruned: number
  /** Receipts Expo reported as failed for a reason that is not the token's. */
  failed: number
  /** Rows abandoned because Expo will never answer them now. */
  expired: number
  /** Rows left in the queue because no receipt exists yet. */
  pending: number
}

/**
 * Remember an accepted ticket so its receipt can be collected later.
 *
 * Failures are swallowed and logged. A send that reached Expo has happened, and
 * losing the ability to check on it later is not worth reporting the send as
 * failed — which would release the `notifyOnce` claim and deliver the same
 * message twice.
 *
 * @param {AcceptedTicket[]} tickets what Expo accepted, in send order
 * @param {string} walletAddress who the messages were addressed to
 * @param {Firestore} firestore the database
 * @returns {Promise<number>} how many rows were written
 */
export async function recordTickets(tickets: AcceptedTicket[], walletAddress: string, firestore: Firestore): Promise<number> {
  if (tickets.length === 0) return 0

  const account = walletAddress.toLowerCase()
  const createdAt = Date.now()

  try {
    const batch = firestore.batch()

    for (const ticket of tickets) {
      const record: PushReceipt = {
        ticketId: ticket.ticketId,
        token: ticket.token,
        walletAddress: account,
        kind: ticket.kind,
        createdAt,
      }

      batch.set(firestore.collection(PUSH_RECEIPTS_COLLECTION).doc(ticket.ticketId), record)
    }

    await batch.commit()

    return tickets.length
  } catch (error) {
    logger.warn('Could not queue push receipts; the send still happened', {
      walletAddress: account,
      count: tickets.length,
      error: error instanceof Error ? error.message : String(error),
    })

    return 0
  }
}

/**
 * Ask Expo about every ticket old enough to have an answer.
 *
 * Three outcomes per row, and the row is deleted in all three: a receipt says
 * delivered, a receipt says failed, or the ticket is old enough that no receipt
 * will ever come. Only "no receipt yet" leaves a row in place.
 *
 * @param {Firestore} firestore the database
 * @param {number} now epoch millis, injectable so a test does not wait fifteen minutes
 * @returns {Promise<CollectResult>} what this run did
 */
export async function collectReceipts(firestore: Firestore, now: number = Date.now()): Promise<CollectResult> {
  const result: CollectResult = { checked: 0, pruned: 0, failed: 0, expired: 0, pending: 0 }

  // Oldest first, so a backlog drains in the order it built up and the rows
  // closest to expiry are the ones a bounded run gets to.
  const snapshot = await firestore
    .collection(PUSH_RECEIPTS_COLLECTION)
    .where('createdAt', '<=', now - RECEIPT_DELAY_MS)
    .orderBy('createdAt')
    .limit(MAX_IDS_PER_REQUEST * MAX_BATCHES_PER_RUN)
    .get()

  if (snapshot.empty) return result

  const rows = snapshot.docs.map((doc) => doc.data() as PushReceipt)

  for (const batch of chunk(rows, MAX_IDS_PER_REQUEST)) {
    const receipts = await fetchReceipts(batch.map((row) => row.ticketId))

    for (const row of batch) {
      const receipt = receipts[row.ticketId]

      /*
        No receipt yet.

        Expo produces them on its own schedule, so an id it does not know about
        is normal rather than an error — unless the ticket is old enough that
        Expo has already discarded it, in which case nobody will ever answer
        and the row is only a source of future requests.
      */
      if (!receipt) {
        if (now - row.createdAt > RECEIPT_EXPIRY_MS) {
          await discard(row, firestore)
          result.expired += 1

          logger.warn('Push receipt expired unanswered', { ticketId: row.ticketId, kind: row.kind })
        } else {
          result.pending += 1
        }

        continue
      }

      result.checked += 1

      if (receipt.status === 'error') {
        const error = receipt.details?.error

        if (error && PRUNABLE_ERRORS.has(error)) {
          await deletePushToken(row.token, firestore)
          result.pruned += 1
        } else {
          result.failed += 1

          // Loud, because the two that are not the token's fault —
          // `MismatchSenderId` and `InvalidCredentials` — mean every push in
          // the project is failing and nothing else will say so.
          logger.error('Push delivery failed', {
            ticketId: row.ticketId,
            kind: row.kind,
            walletAddress: row.walletAddress,
            error,
            message: receipt.message,
          })
        }
      }

      await discard(row, firestore)
    }
  }

  logger.info('Push receipts collected', result)

  return result
}

/** Take a row out of the queue. Its question has been answered, one way or another. */
async function discard(row: PushReceipt, firestore: Firestore): Promise<void> {
  await firestore
    .collection(PUSH_RECEIPTS_COLLECTION)
    .doc(row.ticketId)
    .delete()
    .catch(() => undefined)
}

/**
 * Ask Expo about a batch of ticket ids.
 *
 * Returns an empty map rather than throwing when the service is unreachable:
 * every row stays queued and the next run asks again, which is exactly what
 * should happen. Throwing would abandon the batches after it too.
 *
 * @param {string[]} ids the ticket ids to ask about
 * @returns {Promise<Record<string, ExpoPushReceipt>>} what Expo said, keyed by ticket id
 */
async function fetchReceipts(ids: string[]): Promise<Record<string, ExpoPushReceipt>> {
  try {
    const response = await fetch(EXPO_RECEIPTS_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        // As in `notifications.ts`: Expo compresses by default, and identity
        // keeps the parse simple with no stream tooling to hand.
        'accept-encoding': 'identity',
      },
      body: JSON.stringify({ ids }),
    })

    if (!response.ok) {
      logger.warn('Expo receipts endpoint returned an error', { status: response.status })

      return {}
    }

    const payload = (await response.json()) as { data?: Record<string, ExpoPushReceipt>; errors?: { message: string }[] }

    if (payload.errors?.length) {
      logger.warn('Expo rejected a receipts request', { errors: payload.errors.map((error) => error.message).join('; ') })

      return {}
    }

    return payload.data ?? {}
  } catch (error) {
    logger.warn('Could not reach the Expo receipts endpoint; rows stay queued', {
      error: error instanceof Error ? error.message : String(error),
    })

    return {}
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }

  return batches
}
