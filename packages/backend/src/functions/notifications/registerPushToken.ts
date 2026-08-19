import { RegisterPushTokenRequest, RegisterPushTokenResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { registerPushTokenSchema } from '../../schemas'
import { firestore } from '../../services'
import { savePushToken } from '../../services/pushTokens'
import { parseRequest } from '../../utils/validation'

export const registerPushTokenHandler = async (request: CallableRequest<RegisterPushTokenRequest>): Promise<RegisterPushTokenResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to register a push token')
  }

  const { token, deviceId, platform } = parseRequest(registerPushTokenSchema, request.data)

  // Deliberately not taken from the request. `verifySignatureAndLogin` mints a
  // token whose UID *is* the wallet address, so the caller cannot register a
  // token against somebody else's wallet and start receiving their
  // notifications.
  const walletAddress = request.auth.uid

  try {
    const stored = await savePushToken(token, walletAddress, deviceId, platform, firestore)

    return { stored }
  } catch (error) {
    logger.error('Failed to register push token', {
      walletAddress,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to register push token. Please try again.')
  }
}

/**
 * Cloud Function to register this device for push notifications.
 *
 * Called after wallet authentication succeeds, next to where the device is
 * already approved. Re-registering is free — the service reports no write when
 * the record already says the same thing — so the client does not have to
 * remember whether it has done this before.
 *
 * @param {CallableRequest<RegisterPushTokenRequest>} request the Expo token, device id and platform
 * @returns {Promise<RegisterPushTokenResponse>} whether anything was written
 * @throws {HttpsError} If unauthenticated, the token is malformed, or the write fails
 */
export const registerPushToken = onCall<RegisterPushTokenRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
  },
  registerPushTokenHandler
)
