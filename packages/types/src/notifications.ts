/**
 * Push notifications.
 *
 * Delivery goes through **Expo's push service**, which fronts FCM on Android
 * and APNs on iOS, rather than through `admin.messaging()`. The backend has no
 * Firebase messaging dependency at all — it POSTs to `exp.host`. The reason is
 * that `firebase/messaging` in the JS SDK is web-only (service workers and the
 * Push API), so the alternative was running a second, native Firebase SDK
 * alongside the JS one the app already uses for auth, Firestore and callables.
 *
 * The cost, stated plainly: an Expo push token is not an FCM token, so moving
 * to FCM later means re-issuing every token.
 */

/**
 * One device that has agreed to receive notifications, for one wallet.
 *
 * Both directions are many-to-many: one wallet on two phones, and — routinely
 * in development — two wallets on one phone. So this is keyed on the token
 * rather than on either party, and a recipient is resolved by querying for
 * every token belonging to a wallet.
 *
 * It deliberately does **not** live on `approved_devices`, which would
 * otherwise be the natural home for a (device, wallet) pair:
 * `DeviceVerificationService.approveDevice` writes that document with `set()`
 * and no merge, so a token stored there would be wiped on the next
 * authentication — which happens on every cold start.
 */
export interface PushToken {
  /** The Expo push token, e.g. `ExponentPushToken[xxxxxxxx]`. The document id. */
  token: string
  /** Lowercased, as everything address-shaped is on write. */
  walletAddress: string
  deviceId: string
  platform: 'android' | 'ios' | 'web'
  /** Epoch millis. Refreshed on every re-registration. */
  updatedAt: number
}

/**
 * What a notification is about.
 *
 * Shared so the backend's payload and the mobile deep-link switch cannot drift
 * apart. Only the two owner-facing kinds exist so far — they are the ones that
 * cost the asker nothing to make and the owner everything to miss.
 */
export type NotificationKind = 'membership_requested' | 'loan_requested'

/**
 * The `data` block carried alongside the title and body.
 *
 * Every value is a string because that is what survives both transports
 * unchanged; `poolId` is parsed back on the mobile side.
 */
export interface NotificationData {
  kind: NotificationKind
  poolId: string
  poolName: string
  /** The wallet that caused the notification — the asker, never the recipient. */
  actor: string
}

export interface RegisterPushTokenRequest {
  token: string
  deviceId: string
  platform: 'android' | 'ios' | 'web'
}

export interface RegisterPushTokenResponse {
  /** False when the record already said exactly this and nothing was written. */
  stored: boolean
}

/**
 * Giving up a token.
 *
 * Called on disconnect, not only on sign-out: leaving a token registered to a
 * wallet the user has switched away from means the next wallet on that device
 * receives the previous one's notifications, which is a privacy leak rather
 * than an annoyance.
 */
export interface UnregisterPushTokenRequest {
  token: string
}

export interface UnregisterPushTokenResponse {
  /** False when there was nothing registered under that token. */
  removed: boolean
}
