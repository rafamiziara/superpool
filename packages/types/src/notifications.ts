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
 * apart.
 *
 * Two groups, and they exist for different reasons. The **owner-facing** pair
 * is the reason notifications were built at all: a request costs the asker
 * nothing to make and the owner everything to miss, and the only other way to
 * find out is to open the pool. The **borrower-facing** rest are answers and
 * warnings — somebody is waiting on a decision that has now been made, or owes
 * money on a term that is running out.
 *
 * `loan_due_soon` and `loan_overdue` are the only two that are not caused by
 * anybody doing anything. They come from a scheduled scan, because a term
 * lapsing emits no event: nothing on chain fires when time passes.
 */
export type NotificationKind =
  // Owner-facing: somebody is waiting on a decision.
  | 'membership_requested'
  | 'loan_requested'
  // Borrower-facing: a decision was made.
  | 'loan_approved'
  | 'loan_rejected'
  | 'membership_approved'
  | 'membership_rejected'
  // Borrower-facing: the clock.
  | 'loan_due_soon'
  | 'loan_overdue'
  | 'loan_defaulted'

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
  /**
   * The wallet the notification is *about* — the asker on a request, the
   * borrower on anything loan-shaped. Never the recipient on an owner-facing
   * kind; on a borrower-facing one the two are the same wallet, because the
   * person being told about their own loan is the one whose loan it is.
   */
  actor: string
  /**
   * The loan this is about, as a decimal string. Only on the loan-shaped
   * kinds, and it is what the deep link needs to open the right screen.
   */
  loanId?: string
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
