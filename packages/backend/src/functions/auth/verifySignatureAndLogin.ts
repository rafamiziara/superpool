import { AuthNonce, User, VerifySignatureAndLoginRequest, VerifySignatureAndLoginResponse } from '@superpool/types'
import { verifyMessage, verifyTypedData } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { USERS_COLLECTION } from '../../constants'
import { verifySignatureAndLoginSchema } from '../../schemas'
import { auth, firestore } from '../../services'
import { DeviceVerificationService } from '../../services/deviceVerification'
import { claimAuthNonce, createAuthMessage, NonceExpiredError } from '../../utils/auth'
import { parseRequest } from '../../utils/validation'

export const verifySignatureAndLoginHandler = async (request: CallableRequest<VerifySignatureAndLoginRequest>) => {
  // The address and the signature's shape — prefix, length and alphabet — are
  // the schema's now. `personal-sign` stays the default here rather than in the
  // schema: it is what a wallet that names nothing did, which is a fact about
  // this backend's history rather than about the request.
  const {
    walletAddress,
    signature,
    deviceId,
    platform,
    chainId,
    signatureType = 'personal-sign',
  } = parseRequest(verifySignatureAndLoginSchema, request.data)

  /*
   * Claim the nonce, atomically, before anything else.
   *
   * This used to read the document here and delete it at the very end, with
   * signature verification, a profile write and a device approval in between —
   * so two requests arriving together both saw it, both passed, and both got a
   * token. "Single-use" described the intent rather than the behaviour, and the
   * window was the whole handler.
   *
   * It is now spent on the attempt rather than on the success: a signature that
   * fails below has still consumed the challenge. That is the right way round —
   * a challenge that survives a wrong answer can be answered any number of
   * times — and it costs one regenerated message on a flow that regenerates
   * anyway.
   */
  let nonceData: AuthNonce | null

  try {
    nonceData = await claimAuthNonce(walletAddress, firestore)
  } catch (error) {
    if (error instanceof NonceExpiredError) {
      throw new HttpsError('deadline-exceeded', 'Authentication message has expired. Please generate a new message.')
    }

    throw error
  }

  if (!nonceData) {
    throw new HttpsError('not-found', 'No authentication message found for this wallet address. Please generate a new message.')
  }

  const { nonce, timestamp } = nonceData

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
      /*
       * EIP-712 typed data verification.
       *
       * **`chainId` comes from the caller, and has to.** It was queried in
       * review as unvalidated input; it is not a hole, and refusing a chain
       * this backend does not serve — which was tried here and reverted — is a
       * live bug rather than a hardening. Logging in is not a per-chain act: a
       * wallet sitting on Ethereum mainnet is entitled to authenticate against
       * a backend that only serves Amoy, and will switch afterwards. The number
       * only has to reproduce the domain the wallet actually signed with.
       *
       * Nor does controlling it buy anything. It is a domain separator, so a
       * wrong value recovers a different address, and the equality check below
       * then refuses the login. The thing that makes this signature
       * unforgeable is the single-use nonce claimed above, which is a uuid this
       * backend generated moments ago.
       *
       * **No `verifyingContract`, deliberately.** The field names the contract
       * that will check the signature on chain, and nothing here ever will —
       * this is an off-chain login. Naming an address would be a claim that is
       * not true.
       */
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
    throw new HttpsError('unauthenticated', 'Invalid signature or expired nonce. Please try again.')
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
