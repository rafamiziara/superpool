import { AuthNonce, User, VerifySignatureAndLoginRequest, VerifySignatureAndLoginResponse } from '@superpool/types'
import { isAddress, verifyMessage, verifyTypedData } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { AUTH_NONCES_COLLECTION, USERS_COLLECTION } from '../../constants'
import { auth, firestore } from '../../services'
import { DeviceVerificationService } from '../../services/deviceVerification'
import { createAuthMessage } from '../../utils'

export const verifySignatureAndLoginHandler = async (request: CallableRequest<VerifySignatureAndLoginRequest>) => {
  const { walletAddress, signature, deviceId, platform, chainId, signatureType = 'personal-sign' } = request.data

  // Input Validation
  if (!walletAddress || !signature || !isAddress(walletAddress)) {
    throw new HttpsError('invalid-argument', 'The function must be called with a valid walletAddress and signature.')
  }

  // Validate signature format
  if (!signature.startsWith('0x') || signature.length < 4) {
    throw new HttpsError('invalid-argument', 'Invalid signature format. It must be a hex string prefixed with "0x".')
  }

  // Additional validation: ensure it's valid hex
  const hexPattern = /^0x[0-9a-fA-F]*$/
  if (!hexPattern.test(signature)) {
    throw new HttpsError('invalid-argument', 'Invalid signature format. Signature must contain only hexadecimal characters.')
  }

  // Retrieve Nonce from Firestore
  const nonceRef = firestore.collection(AUTH_NONCES_COLLECTION).doc(walletAddress)
  const nonceDoc = await nonceRef.get()

  if (!nonceDoc.exists) {
    throw new HttpsError('not-found', 'No authentication message found for this wallet address. Please generate a new message.')
  }

  // Cast the data to the AuthNonce interface for type safety
  const nonceData = nonceDoc.data() as AuthNonce
  const { nonce, timestamp, expiresAt } = nonceData

  // Check if the nonce has expired
  const currentTime = new Date().getTime()
  if (currentTime > expiresAt) {
    // Clean up expired nonce
    await nonceRef.delete()
    throw new HttpsError('deadline-exceeded', 'Authentication message has expired. Please generate a new message.')
  }

  // Reconstruct the signed message
  const message = createAuthMessage(walletAddress, nonce, timestamp)

  // Verify the signature - try EIP-712 first (Safe compatible), fallback to personal_sign
  let recoveredAddress: string

  try {
    logger.info('Attempting signature verification', {
      signature: signature.substring(0, 20) + '...',
      walletAddress,
      signatureLength: signature.length,
      chainId,
      signatureType,
    })

    if (signatureType === 'typed-data') {
      // EIP-712 typed data verification
      const domain = {
        name: 'SuperPool Authentication',
        version: '1',
        chainId: chainId || 1,
      }

      const types = {
        Authentication: [
          { name: 'wallet', type: 'address' },
          { name: 'nonce', type: 'string' },
          { name: 'timestamp', type: 'uint256' },
        ],
      }

      const value = {
        wallet: walletAddress,
        nonce,
        timestamp: BigInt(Math.floor(timestamp)),
      }

      recoveredAddress = verifyTypedData(domain, types, value, signature)
      logger.info('EIP-712 signature verification successful', { recoveredAddress })
    } else {
      // Personal message verification (default)
      recoveredAddress = verifyMessage(message, signature)
      logger.info('Personal sign verification successful', { recoveredAddress })
    }
  } catch (error) {
    logger.error('Signature verification failed', {
      error,
      walletAddress,
      signatureLength: signature.length,
      messageLength: message.length,
      chainId,
      signatureType,
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw new HttpsError(
      'unauthenticated',
      `Signature verification failed: ${error instanceof Error ? error.message : 'Invalid signature'}`
    )
  }

  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new HttpsError('unauthenticated', 'The signature does not match the provided wallet address.')
  }

  // Create or Update User Profile
  let userData: User

  try {
    logger.info('Creating/updating user profile', { walletAddress })
    const userProfileRef = firestore.collection(USERS_COLLECTION).doc(walletAddress)
    const userProfileDoc = await userProfileRef.get()
    const now = new Date().getTime()

    if (!userProfileDoc.exists) {
      // Profile does not exist, so create a new one
      userData = { walletAddress, createdAt: now, updatedAt: now }
      await userProfileRef.set(userData)
      logger.info('User profile created', { walletAddress })
    } else {
      // Profile exists, so update the updatedAt timestamp
      await userProfileRef.update({ updatedAt: now })
      userData = { ...(userProfileDoc.data() as User), updatedAt: now }
      logger.info('User profile updated', { walletAddress })
    }
  } catch (error) {
    logger.error('Failed to create or update user profile', { error, walletAddress })
    throw new HttpsError('internal', 'Failed to create or update user profile. Please try again.')
  }

  // Approve device after successful authentication
  if (deviceId && platform) {
    try {
      logger.info('Approving device', { deviceId, walletAddress, platform, signatureType })
      await DeviceVerificationService.approveDevice(deviceId, walletAddress, platform)
      logger.info('Device approved successfully', { deviceId, walletAddress, signatureType })
    } catch (error) {
      // Device approval failure shouldn't block authentication
      logger.error('Failed to approve device', { error, deviceId, walletAddress, signatureType })
    }
  } else {
    logger.info('Skipping device approval - no deviceId or platform provided', {
      deviceId,
      platform,
      signatureType,
      walletAddress,
    })
  }

  // Delete the nonce to prevent replay attacks
  try {
    logger.info('Deleting nonce document', { walletAddress })
    await nonceRef.delete()
    logger.info('Nonce document deleted successfully', { walletAddress })
  } catch (error) {
    // The user has already been authenticated, so a failure here is an acceptable cleanup error.
    logger.error('Failed to delete nonce document', { error, walletAddress })
  }

  // Issue a Firebase Custom Token
  // Use the walletAddress as the user's unique UID in Firebase Auth.
  try {
    logger.info('Creating Firebase custom token', { walletAddress })
    const firebaseToken = await auth.createCustomToken(walletAddress)
    logger.info('Firebase custom token created successfully', { walletAddress })

    const response: VerifySignatureAndLoginResponse = { firebaseToken, user: userData }
    return response
  } catch (error) {
    logger.error('Failed to create Firebase custom token', { error, walletAddress })
    throw new HttpsError('unauthenticated', 'Failed to generate a valid session token.')
  }
}

/**
 * Verifies a wallet signature against a stored nonce and issues a Firebase custom token.
 * This is the final step in the wallet-based authentication flow.
 *
 * @param {CallableRequest<LoginRequest>} request The callable function's request object, containing the wallet address and signature.
 * @returns {Promise<{ firebaseToken: string }>} A promise that resolves with a Firebase custom token upon successful verification.
 * @throws {HttpsError} If the walletAddress or signature are invalid, the nonce is not found, or the signature verification fails.
 */
export const verifySignatureAndLogin = onCall<VerifySignatureAndLoginRequest>({ cors: true }, verifySignatureAndLoginHandler)
