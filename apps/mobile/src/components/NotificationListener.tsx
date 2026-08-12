import type { NotificationData, NotificationKind } from '@superpool/types'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useEffect } from 'react'
import Toast from 'react-native-toast-message'
import { logger } from '../utils/logger'

/**
 * What to do when a notification arrives, and when one is tapped.
 *
 * Mounted once at the root, next to the other listeners. Renders nothing.
 */

/**
 * Where each kind of notification goes.
 *
 * Both are owner-facing queues, which is the point of the feature: the owner
 * had to open the pool and look, and now the notification takes them to the
 * exact list they need to act on.
 */
const DESTINATIONS: Record<NotificationKind, (poolId: string) => string> = {
  loan_requested: (poolId) => `/(auth)/pool/approvals?poolId=${poolId}`,
  membership_requested: (poolId) => `/(auth)/pool/members?poolId=${poolId}`,
}

/**
 * A notification that arrives while the app is open should not be a system
 * banner over the app the user is already looking at — it should be an in-app
 * toast, which is what `react-native-toast-message` in `app/_layout.tsx` is
 * for. Set at module scope because Expo reads it when the notification lands,
 * not when a component renders.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

function dataOf(notification: Notifications.Notification): NotificationData | null {
  const data = notification.request.content.data as Partial<NotificationData> | undefined

  if (!data?.kind || !data.poolId || !(data.kind in DESTINATIONS)) return null

  return data as NotificationData
}

export function NotificationListener() {
  useEffect(() => {
    /*
      Arriving while the app is open.

      The toast is tappable for the same reason the system notification is:
      being told a request exists and then having to go and find it is most of
      the problem this feature exists to solve.
    */
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = dataOf(notification)

      if (!data) return

      Toast.show({
        type: 'info',
        text1: notification.request.content.title ?? 'New activity',
        text2: notification.request.content.body ?? undefined,
        onPress: () => {
          Toast.hide()
          navigateTo(data)
        },
      })
    })

    /*
      Tapped, from the background or from cold.

      Expo replays the tap that launched the app through this same listener, so
      a cold start needs no separate `getLastNotificationResponseAsync` path.

      The destination is inside the `(auth)` group and a cold start has no
      connected wallet for a moment — the screens there resolve that themselves
      by distinguishing "still loading" from "not the owner", which is the
      distinction `pool/settings.tsx` already had to make. Navigating straight
      there is therefore safe; the screen shows a spinner and then the queue.
    */
    const responded = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = dataOf(response.notification)

      if (!data) return

      navigateTo(data)
    })

    return () => {
      received.remove()
      responded.remove()
    }
  }, [])

  return null
}

function navigateTo(data: NotificationData): void {
  const destination = DESTINATIONS[data.kind](data.poolId)

  logger.debug('🔔 Opening notification destination:', destination)

  router.push(destination)
}
