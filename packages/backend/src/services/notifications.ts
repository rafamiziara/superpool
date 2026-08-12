import { NotificationData } from '@superpool/types'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { NOTIFICATIONS_SENT_COLLECTION } from '../constants'
import { deletePushToken, tokensForWallet } from './pushTokens'

/**
 * Sending push notifications, through Expo rather than through Firebase.
 *
 * The backend gains no messaging dependency: this is an HTTPS POST. See
 * `@superpool/types/notifications` for why Expo and not FCM.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send'

/** Expo's documented cap for one request. */
const MAX_MESSAGES_PER_REQUEST = 100

/** What Expo accepts. `to` may be one token or many; one per message here. */
interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data: NotificationData
  sound: 'default'
  /** Android only; ignored elsewhere. Matches the channel the app creates. */
  channelId: string
}

interface ExpoPushTicket {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

export interface Notification {
  title: string
  body: string
  data: NotificationData
}

export interface NotifyResult {
  /** How many devices Expo accepted the message for. */
  sent: number
  /** Tokens dropped because the app is no longer installed. */
  pruned: number
  /** True when the wallet had no registered device at all. */
  noRecipients: boolean
}

export const DEFAULT_ANDROID_CHANNEL = 'default'

/**
 * Send one notification to every device a wallet has registered.
 *
 * Silent when the wallet has no tokens, which is the common case early on and
 * not an error: an owner who has never granted permission simply does not hear
 * about it, and the dashboard still shows what is waiting.
 */
export async function notifyWallet(walletAddress: string, notification: Notification, firestore: Firestore): Promise<NotifyResult> {
  const tokens = await tokensForWallet(walletAddress, firestore)

  if (tokens.length === 0) {
    logger.info('No push tokens for wallet, nothing to send', { walletAddress: walletAddress.toLowerCase() })

    return { sent: 0, pruned: 0, noRecipients: true }
  }

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    sound: 'default',
    channelId: DEFAULT_ANDROID_CHANNEL,
  }))

  let sent = 0
  let pruned = 0

  for (const batch of chunk(messages, MAX_MESSAGES_PER_REQUEST)) {
    const tickets = await postToExpo(batch)

    // Expo returns one ticket per message, in order. Zipping by index is the
    // only correspondence available — tickets carry no token.
    for (const [index, ticket] of tickets.entries()) {
      const token = batch[index]?.to

      if (ticket.status === 'ok') {
        sent += 1
        continue
      }

      // The app was uninstalled, or the token was reissued. Keeping it means
      // POSTing to a dead device on every future notification, forever.
      if (ticket.details?.error === 'DeviceNotRegistered' && token) {
        await deletePushToken(token, firestore)
        pruned += 1
        continue
      }

      logger.warn('Expo rejected a push message', { error: ticket.details?.error, message: ticket.message })
    }
  }

  logger.info('Push notification dispatched', { walletAddress: walletAddress.toLowerCase(), kind: notification.data.kind, sent, pruned })

  return { sent, pruned, noRecipients: false }
}

/**
 * Send a notification at most once for a given (record, transition).
 *
 * The marker is claimed **before** the send, not after. `syncPoolEvents`
 * re-scans block ranges on purpose and a failed scheduled run is retried, so
 * the question is which way to fail: claiming first can lose a notification if
 * the POST then fails, marking afterwards can send a thousand of them if the
 * process dies mid-sweep. Re-scanning genesis is a supported operation here,
 * which settles it.
 *
 * A send that throws outright releases the claim, so a transient network
 * failure still gets another attempt. A send that Expo *accepted and rejected
 * per-device* keeps it — that notification genuinely happened, and retrying
 * would deliver it twice to every device that did receive it.
 */
export async function notifyOnce(
  key: string,
  walletAddress: string,
  notification: Notification,
  firestore: Firestore
): Promise<NotifyResult | null> {
  const marker = firestore.collection(NOTIFICATIONS_SENT_COLLECTION).doc(key)

  try {
    // `create` rejects an existing document, which makes the check and the
    // claim one atomic step. A get-then-set would let two concurrent sweeps
    // both read "not sent" and both send.
    await marker.create({ kind: notification.data.kind, walletAddress: walletAddress.toLowerCase(), sentAt: new Date() })
  } catch {
    logger.info('Notification already sent, skipping', { key })

    return null
  }

  try {
    return await notifyWallet(walletAddress, notification, firestore)
  } catch (error) {
    await marker.delete().catch(() => undefined)

    logger.error('Push send failed; claim released for retry', {
      key,
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
}

/**
 * The idempotency key for one notification about one record.
 *
 * The transition is part of it, not just the document: the same loan is worth
 * notifying about more than once over its life, and keying on the document
 * alone would silence everything after the first.
 */
export function notificationKey(docId: string, kind: NotificationData['kind']): string {
  return `${docId}-${kind}`
}

async function postToExpo(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  const response = await fetch(EXPO_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      // Expo compresses its reply by default; asking for identity keeps the
      // parse simple in an environment with no stream tooling to hand.
      'accept-encoding': 'identity',
    },
    body: JSON.stringify(messages),
  })

  if (!response.ok) {
    throw new Error(`Expo push service returned ${response.status}: ${await response.text()}`)
  }

  const payload = (await response.json()) as { data?: ExpoPushTicket[]; errors?: { message: string }[] }

  if (payload.errors?.length) {
    throw new Error(`Expo push service rejected the request: ${payload.errors.map((error) => error.message).join('; ')}`)
  }

  return payload.data ?? []
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }

  return batches
}
