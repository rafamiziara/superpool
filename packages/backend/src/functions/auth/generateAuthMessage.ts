import { AuthMessageRequest, AuthMessageResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { v4 as uuidv4 } from 'uuid'
import { AUTH_NONCES_COLLECTION } from '../../constants'
import { authMessageSchema } from '../../schemas'
import { firestore } from '../../services'
import { createAuthMessage } from '../../utils'
import { parseRequest } from '../../utils/validation'

export const generateAuthMessageHandler = async (request: CallableRequest<AuthMessageRequest>) => {
  // Present, a string, and a real address: three checks the schema now makes,
  // which is also what stops a non-address becoming an `auth_nonces` document id.
  const { walletAddress } = parseRequest(authMessageSchema, request.data)

  // Generate a unique, random nonce
  const nonce = uuidv4()
  const timestamp = new Date().getTime()

  // Set nonce expiration to 10 minutes from now
  const expiresAt = timestamp + 10 * 60 * 1000

  // Store the nonce in a temporary collection. This will be used for verification.
  // The try/catch block ensures we handle any potential errors during the database write.
  try {
    await firestore.collection(AUTH_NONCES_COLLECTION).doc(walletAddress).set({ nonce, timestamp, expiresAt })
  } catch {
    throw new HttpsError('internal', 'Failed to save authentication nonce.')
  }

  // Construct the message to be signed
  const message = createAuthMessage(walletAddress, nonce, timestamp)

  logger.info('Generated auth message data', {
    message: message.substring(0, 50) + '...',
    nonce,
    timestamp,
    walletAddress,
  })

  const response: AuthMessageResponse = { message, nonce, timestamp }
  return response
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
