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
 * Interface for the nonce object stored in Firestore.
 */
export interface AuthNonce {
  nonce: string
  timestamp: number
}
