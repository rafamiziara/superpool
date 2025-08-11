import { isAddress, verifyMessage } from 'ethers'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { AuthNonce, createAuthMessage } from './auth'
import { AUTH_NONCES_COLLECTION, USERS_COLLECTION } from './constants'
import { auth, firestore } from './services'
import { UserProfile } from './types'

// Define the interface for your function's input
interface VerifySignatureAndLoginRequest {
  walletAddress: string
  signature: string
}

/**
 * Verifies a wallet signature against a stored nonce and issues a Firebase custom token.
 * This is the final step in the wallet-based authentication flow.
 *
 * @param {CallableRequest<LoginRequest>} request The callable function's request object, containing the wallet address and signature.
 * @returns {Promise<{ firebaseToken: string }>} A promise that resolves with a Firebase custom token upon successful verification.
 * @throws {HttpsError} If the walletAddress or signature are invalid, the nonce is not found, or the signature verification fails.
 */
export const verifySignatureAndLogin = onCall<VerifySignatureAndLoginRequest>({ cors: true, enforceAppCheck: true }, async (request) => {
  const { walletAddress, signature } = request.data

  // Input Validation
  if (!walletAddress || !signature || !isAddress(walletAddress)) {
    throw new HttpsError('invalid-argument', 'The function must be called with a valid walletAddress and signature.')
  }

  if (!signature.startsWith('0x') || signature.length !== 132) {
    throw new HttpsError('invalid-argument', 'Invalid signature format. It must be a 132-character hex string prefixed with "0x".')
  }

  // Retrieve Nonce from Firestore
  const nonceDoc = await firestore.collection(AUTH_NONCES_COLLECTION).doc(walletAddress).get()

  if (!nonceDoc.exists) {
    throw new HttpsError('not-found', 'No authentication message found for this wallet address. Please generate a new message.')
  }

  // Cast the data to the AuthNonce interface for type safety
  const nonceData = nonceDoc.data() as AuthNonce
  const { nonce, timestamp } = nonceData

  // Reconstruct the signed message
  const message = createAuthMessage(walletAddress, nonce, timestamp)

  // Verify the signature
  let recoveredAddress: string

  try {
    recoveredAddress = verifyMessage(message, signature)
  } catch (error) {
    throw new HttpsError('unauthenticated', 'Signature verification failed. The signature is invalid.')
  }

  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new HttpsError('unauthenticated', 'The signature does not match the provided wallet address.')
  }

  // Create or Update User Profile
  try {
    const userProfileRef = firestore.collection(USERS_COLLECTION).doc(walletAddress)
    const userProfileDoc = await userProfileRef.get()
    const now = new Date().getTime()

    if (!userProfileDoc.exists) {
      // Profile does not exist, so create a new one
      const newUserProfile: UserProfile = { walletAddress, createdAt: now, updatedAt: now }
      await userProfileRef.set(newUserProfile)
    } else {
      // Profile exists, so update the updatedAt timestamp
      await userProfileRef.update({ updatedAt: now })
    }
  } catch (error) {
    throw new HttpsError('internal', 'Failed to create or update user profile. Please try again.')
  }

  // Delete the nonce to prevent replay attacks
  try {
    await nonceDoc.ref.delete()
  } catch (error) {
    // The user has already been authenticated, so a failure here is an acceptable cleanup error.
    console.error('Failed to delete nonce document:', error)
  }

  // Issue a Firebase Custom Token
  // Use the walletAddress as the user's unique UID in Firebase Auth.
  try {
    const firebaseToken = await auth.createCustomToken(walletAddress)
    return { firebaseToken }
  } catch (error) {
    throw new HttpsError('unauthenticated', 'Failed to generate a valid session token.')
  }
})
