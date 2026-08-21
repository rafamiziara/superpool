import { PushToken } from '@superpool/types'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { PUSH_TOKENS_COLLECTION } from '../constants'

/**
 * Where push tokens are kept, and how a wallet is turned into recipients.
 *
 * The token is the document id. A recipient, though, is a **wallet** — so
 * sending means querying every token registered to that address, because the
 * same person may be carrying two phones.
 */

/**
 * Register a token, or refresh one that is already known.
 *
 * `set` without merge is right here, unlike everywhere else in this codebase:
 * the whole document is four fields and all four are supplied, and a token that
 * has moved to a different wallet must not keep the old `walletAddress` — which
 * is exactly what merging would do.
 *
 * Returns `false` when nothing changed, so a client that re-registers on every
 * launch (which it does) does not generate a write per launch.
 */
export async function savePushToken(
  token: string,
  walletAddress: string,
  deviceId: string,
  platform: PushToken['platform'],
  firestore: Firestore
): Promise<boolean> {
  const account = walletAddress.toLowerCase()
  const docRef = firestore.collection(PUSH_TOKENS_COLLECTION).doc(token)
  const existing = (await docRef.get()).data() as PushToken | undefined

  if (existing && existing.walletAddress === account && existing.deviceId === deviceId && existing.platform === platform) {
    logger.info('Push token already registered, skipping', { token: redact(token), walletAddress: account })

    return false
  }

  const record: PushToken = { token, walletAddress: account, deviceId, platform, updatedAt: Date.now() }

  await docRef.set(record)

  logger.info('Push token registered', { token: redact(token), walletAddress: account, platform })

  return true
}

/**
 * Give up a token.
 *
 * Called on disconnect as well as on sign-out. A token left registered to a
 * wallet the user has switched away from sends the next wallet on that device
 * the previous one's notifications — a privacy leak, not an annoyance.
 */
export async function deletePushToken(token: string, firestore: Firestore): Promise<boolean> {
  const docRef = firestore.collection(PUSH_TOKENS_COLLECTION).doc(token)

  if (!(await docRef.get()).exists) return false

  await docRef.delete()

  logger.info('Push token removed', { token: redact(token) })

  return true
}

/**
 * Every token that should hear about something addressed to one wallet.
 *
 * Case-insensitive by construction: addresses are lowercased on write here and
 * on the way in, because wallets report them checksummed and an exact-match
 * query would silently return nothing.
 */
export async function tokensForWallet(walletAddress: string, firestore: Firestore): Promise<string[]> {
  if (!walletAddress) return []

  const snapshot = await firestore.collection(PUSH_TOKENS_COLLECTION).where('walletAddress', '==', walletAddress.toLowerCase()).get()

  return snapshot.docs.map((doc) => doc.id)
}

/**
 * Both shapes Expo issues.
 *
 * Checked because a token is used as a document id: a value containing `/`
 * would address a subcollection rather than a document, and an empty one
 * throws. This is a shape check, not proof the token is live — only a delivery
 * receipt can say that, which is what `DeviceNotRegistered` pruning is for.
 */
const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[^[\]/\s]+\]$/

export function isExpoPushToken(token: string): boolean {
  return EXPO_PUSH_TOKEN.test(token)
}

/** Tokens are credentials of a sort; logging them whole is not worth the risk. */
function redact(token: string): string {
  return token.length <= 12 ? token : `${token.slice(0, 10)}…${token.slice(-4)}`
}
