import { isAddress } from 'ethers'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { v4 as uuidv4 } from 'uuid'

initializeApp()
const db = getFirestore()

/**
 * Generates a unique message for a user to sign for wallet authentication.
 * The message includes a nonce and the wallet address to prevent replay attacks.
 */

interface AuthMessageRequest {
  walletAddress: string
}

export const generateAuthMessage = onCall<AuthMessageRequest>(async (request) => {
  const { walletAddress } = request.data

  // Validate that the required properties exist
  if (!walletAddress) {
    throw new HttpsError('invalid-argument', 'The function must be called with one argument: walletAddress.')
  }

  // Check if the walletAddress is a valid Ethereum address format.
  if (!isAddress(walletAddress)) {
    throw new HttpsError('invalid-argument', 'Invalid Ethereum wallet address format.')
  }

  // Generate a unique, random nonce
  const nonce = uuidv4()
  const timestamp = new Date().getTime()

  // Store the nonce in a temporary collection. This will be used for verification.
  await db.collection('auth_nonces').doc(walletAddress).set({
    nonce,
    timestamp,
  })

  // Construct the message to be signed
  const message =
    `Welcome to SuperPool!\n\n` +
    `This request will not trigger a blockchain transaction.\n\n` +
    `Wallet address:\n${walletAddress}\n\n` +
    `Nonce:\n${nonce}\n` +
    `Timestamp:\n${timestamp}`

  return { message }
})
