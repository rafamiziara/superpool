import { isAddress } from 'ethers'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { v4 as uuidv4 } from 'uuid'
import { AUTH_NONCES_COLLECTION } from '../../constants'
import { firestore } from '../../services'
import { createAuthMessage } from '../../utils'

// Define the interface for your function's input
interface AuthMessageRequest {
  walletAddress: string
}

/**
 * Generates a unique message for a user to sign for wallet authentication.
 * The message includes a nonce and the wallet address to prevent replay attacks.
 *
 * @param {CallableRequest<AuthMessageRequest>} request The callable function's request object, containing the wallet address.
 * @returns {Promise<{ message: string }>} A promise that resolves with the unique message to be signed.
 * @throws {HttpsError} If the walletAddress is invalid or not provided.
 */
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
  await firestore.collection(AUTH_NONCES_COLLECTION).doc(walletAddress).set({
    nonce,
    timestamp,
  })

  // Construct the message to be signed
  const message = createAuthMessage(walletAddress, nonce, timestamp)

  return { message }
})
