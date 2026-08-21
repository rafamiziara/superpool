import { UnregisterPushTokenRequest, UnregisterPushTokenResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { unregisterPushTokenSchema } from '../../schemas'
import { firestore } from '../../services'
import { deletePushToken } from '../../services/pushTokens'
import { parseRequest } from '../../utils/validation'

export const unregisterPushTokenHandler = async (
  request: CallableRequest<UnregisterPushTokenRequest>
): Promise<UnregisterPushTokenResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to unregister a push token')
  }

  const { token } = parseRequest(unregisterPushTokenSchema, request.data)

  try {
    // Not checked against the caller's wallet on purpose. The call that matters
    // is made while switching away from a wallet, and holding the physical
    // token is the only claim that can be made at that moment. Deleting
    // somebody else's token would need that token, which is not something an
    // attacker can guess — and the worst it achieves is silencing a device that
    // will re-register on its next launch.
    const removed = await deletePushToken(token, firestore)

    return { removed }
  } catch (error) {
    logger.error('Failed to unregister push token', {
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to unregister push token. Please try again.')
  }
}

/**
 * Cloud Function to stop sending notifications to this device.
 *
 * Called on wallet disconnect, not only on sign-out. Two wallets on one phone
 * is routine in development and not unheard of otherwise, and a token left
 * behind sends the next wallet the previous one's notifications.
 *
 * @param {CallableRequest<UnregisterPushTokenRequest>} request the Expo token to forget
 * @returns {Promise<UnregisterPushTokenResponse>} whether anything was removed
 * @throws {HttpsError} If unauthenticated, the token is malformed, or the delete fails
 */
export const unregisterPushToken = onCall<UnregisterPushTokenRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: true,
  },
  unregisterPushTokenHandler
)
