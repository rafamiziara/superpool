import { AuthNonce } from '@superpool/types'
import { Firestore } from 'firebase-admin/firestore'
import { AUTH_NONCES_COLLECTION } from '../constants'

/**
 * Creates the standardized authentication message to be signed by a wallet.
 * This message must be identical in both the generation and verification steps.
 *
 * @param {string} walletAddress The user's wallet address.
 * @param {string} nonce A unique nonce generated for this authentication attempt.
 * @param {number} timestamp The timestamp of the message creation.
 * @returns {string} The formatted authentication message.
 */
export function createAuthMessage(walletAddress: string, nonce: string, timestamp: number): string {
  return (
    `Welcome to SuperPool!\n\n` +
    `This request will not trigger a blockchain transaction.\n\n` +
    `Wallet address:\n${walletAddress}\n\n` +
    `Nonce:\n${nonce}\n` +
    `Timestamp:\n${timestamp}`
  )
}

/**
 * Take a wallet's login challenge, atomically, so it can only be taken once.
 *
 * The read and the delete used to be separate awaits with the whole of
 * signature verification, a profile write and a device approval in between. Two
 * requests arriving together both saw the document, both passed, and both got a
 * token — so "single-use nonce" described the intent rather than the behaviour.
 * The window was the entire handler.
 *
 * **The nonce is spent on the attempt, not on the success**, which is the part
 * worth being deliberate about. Verification happens after this returns, so a
 * signature that turns out to be wrong has still consumed the challenge and the
 * caller has to ask for a new one. That is the right way round: a challenge
 * that survives a failed answer can be answered any number of times, and the
 * cost is one extra round trip on a flow that regenerates its message anyway.
 *
 * @param walletAddress whose challenge to claim — the `auth_nonces` document id
 * @param firestore the Firestore instance to claim in
 * @returns the claimed nonce, or `null` if there was none
 * @throws {NonceExpiredError} if one was found but had lapsed. It is consumed
 *   either way: an expired challenge is not worth leaving behind.
 */
export async function claimAuthNonce(walletAddress: string, firestore: Firestore): Promise<AuthNonce | null> {
  const docRef = firestore.collection(AUTH_NONCES_COLLECTION).doc(walletAddress)

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef)

    if (!snapshot.exists) return null

    const data = snapshot.data() as AuthNonce

    // Deleted inside the transaction, before anything can look at it a second
    // time. Expired ones go too — leaving them would keep a document nothing
    // will ever accept.
    transaction.delete(docRef)

    if (new Date().getTime() > data.expiresAt) {
      throw new NonceExpiredError()
    }

    return data
  })
}

/** A challenge was found but had lapsed. It has been consumed regardless. */
export class NonceExpiredError extends Error {
  constructor() {
    super('Authentication message has expired')
    this.name = 'NonceExpiredError'
  }
}
