import type {
  RegisterPushTokenRequest,
  RegisterPushTokenResponse,
  UnregisterPushTokenRequest,
  UnregisterPushTokenResponse,
} from '@superpool/types'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { httpsCallable } from 'firebase/functions'
import { Platform } from 'react-native'
import { FIREBASE_FUNCTIONS } from '../config/firebase'
import { getUniqueDeviceId } from '../utils/deviceId'
import { logger } from '../utils/logger'

/**
 * Getting this device a push token and telling the backend about it.
 *
 * Delivery is Expo's push service, not FCM directly — see
 * `@superpool/types/notifications`. Two consequences show up here: the token is
 * issued against the EAS `projectId` in `app.json`, and **none of this works in
 * Expo Go on Android**, which has been unable to receive remote push since SDK
 * 53. A development build is required.
 */

/** Matches the channel id the backend puts on every message it sends. */
const ANDROID_CHANNEL_ID = 'default'

/**
 * The token this device last obtained, so disconnecting can give it back.
 *
 * Held in module scope rather than fetched again on the way out:
 * `getExpoPushTokenAsync` is a network call, and the moment a wallet
 * disconnects is the wrong time to depend on one succeeding.
 */
let currentToken: string | null = null

/**
 * Whether the user has already been asked.
 *
 * The permission prompt is a one-shot on iOS — a denial cannot be re-asked
 * in-app, only redirected to Settings — so the app has to be deliberate about
 * when it spends it. `hasPermission` reads the current answer without asking.
 */
export async function hasNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync()

  return status === 'granted'
}

/**
 * Ask for permission, at a moment the user has just created an expectation of
 * an answer.
 *
 * Never call this on launch. A prompt with no context is how an app permanently
 * loses the channel it is trying to build: on iOS the denial is effectively
 * final. The right moments are asking to join a pool and asking to borrow —
 * both are the user posting a question to somebody else and wanting to hear
 * back.
 *
 * Returns whether notifications may now be sent. Already-granted is not
 * re-asked, and an already-denied answer is reported rather than re-prompted,
 * because the OS would not show anything anyway.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync()

  if (existing.status === 'granted') return true
  if (!existing.canAskAgain) return false

  const { status } = await Notifications.requestPermissionsAsync()

  return status === 'granted'
}

/**
 * Obtain a token for this device and register it against the connected wallet.
 *
 * Called after wallet authentication succeeds, where the device is already
 * being approved. Deliberately does **not** prompt: if permission has not been
 * granted yet there is nothing to register, and asking here would be asking on
 * launch by another name.
 *
 * Best effort throughout. Notifications are an enhancement, and a failure to
 * arrange them must not break a sign-in that otherwise worked.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // A simulator has no push service to register with, and the call throws
    // rather than returning empty. Not an error worth surfacing.
    if (!Device.isDevice) {
      logger.debug('📵 Push notifications need a physical device; skipping registration')

      return null
    }

    if (!(await hasNotificationPermission())) {
      logger.debug('📵 No notification permission yet; nothing to register')

      return null
    }

    await ensureAndroidChannel()

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined

    if (!projectId) {
      logger.warn('No EAS projectId in app config; cannot obtain a push token')

      return null
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })

    const deviceId = await getUniqueDeviceId()

    if (!deviceId) {
      logger.warn('No device id available; cannot register push token')

      return null
    }

    const registerPushToken = httpsCallable<RegisterPushTokenRequest, RegisterPushTokenResponse>(FIREBASE_FUNCTIONS, 'registerPushToken')

    await registerPushToken({ token, deviceId, platform: platformName() })

    currentToken = token

    logger.debug('🔔 Push token registered')

    return token
  } catch (error) {
    logger.warn('Could not register for push notifications:', error)

    return null
  }
}

/**
 * Give the token back, so this device stops receiving the outgoing wallet's
 * notifications.
 *
 * Called on disconnect, not only on sign-out. Two wallets on one phone is
 * routine in development and not unheard of otherwise; a token left registered
 * would deliver one person's join requests to the next person to use the
 * device, which is a privacy leak rather than an annoyance.
 */
export async function unregisterForPushNotifications(): Promise<void> {
  if (!currentToken) return

  const token = currentToken

  // Cleared first: whether or not the call succeeds, this device should stop
  // considering the token its own, and a retry loop here would block a
  // disconnect the user has already asked for.
  currentToken = null

  try {
    const unregisterPushToken = httpsCallable<UnregisterPushTokenRequest, UnregisterPushTokenResponse>(
      FIREBASE_FUNCTIONS,
      'unregisterPushToken'
    )

    await unregisterPushToken({ token })

    logger.debug('🔕 Push token unregistered')
  } catch (error) {
    logger.warn('Could not unregister push token:', error)
  }
}

/**
 * Android shows nothing at all without a channel, silently — there is no error
 * and no notification. Created before the first token is requested, and safe to
 * repeat.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Pool activity',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#4ae3b5',
  })
}

/** Exposed for tests; the store's own platform mapping lives in `useAutoAuth`. */
function platformName(): 'android' | 'ios' | 'web' {
  return Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web'
}
