import { isAddress } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { v4 as uuidv4 } from 'uuid'
import { AUTH_NONCES_COLLECTION } from '../../constants'
import { firestore } from '../../services'
import { createAuthMessage } from '../../utils'

// Define the interface for your function's input
interface AuthMessageRequest {
  walletAddress: string
}

export const generateAuthMessageHandler = async (request: CallableRequest<AuthMessageRequest>) => {
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

  // Set nonce expiration to 10 minutes from now
  const expiresAt = timestamp + 10 * 60 * 1000

  // Store the nonce in a temporary collection. This will be used for verification.
  // The try/catch block ensures we handle any potential errors during the database write.
  try {
    await firestore.collection(AUTH_NONCES_COLLECTION).doc(walletAddress).set({ nonce, timestamp, expiresAt })
  } catch (error) {
    throw new HttpsError('internal', 'Failed to save authentication nonce.')
  }

  // Construct the message to be signed
  const message = createAuthMessage(walletAddress, nonce, timestamp)

  logger.info('Generated auth message data', { 
    message: message.substring(0, 50) + '...', 
    nonce, 
    timestamp,
    walletAddress 
  })
  
  return { message, nonce, timestamp }
}

/**
 * Generates a unique message for a user to sign for wallet authentication.
 * The message includes a nonce and the wallet address to prevent replay attacks.
 *
 * @param {CallableRequest<AuthMessageRequest>} request The callable function's request object, containing the wallet address.
 * @returns {Promise<{ message: string, nonce: string, timestamp: number }>} A promise that resolves with the unique message to be signed.
 * @throws {HttpsError} If the walletAddress is invalid or not provided.
 */
export const generateAuthMessage = onCall<AuthMessageRequest>(generateAuthMessageHandler)
