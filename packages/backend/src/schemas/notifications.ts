import type { RegisterPushTokenRequest, UnregisterPushTokenRequest } from '@superpool/types'
import { z } from 'zod'
import { isExpoPushToken } from '../services/pushTokens'

/**
 * An Expo push token.
 *
 * Not an FCM or APNs one: push goes through Expo's service, so a token that is
 * not `ExponentPushToken[…]` shaped is one this backend can never deliver to.
 */
const pushToken = z.string().refine(isExpoPushToken, 'must be an Expo push token')

export const registerPushTokenSchema = z.object({
  token: pushToken,
  deviceId: z.string().min(1),
  platform: z.enum(['android', 'ios', 'web']),
}) satisfies z.ZodType<RegisterPushTokenRequest>

export const unregisterPushTokenSchema = z.object({
  token: pushToken,
}) satisfies z.ZodType<UnregisterPushTokenRequest>
