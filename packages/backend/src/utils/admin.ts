import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https'

/**
 * Who may run the operator-only endpoints.
 *
 * Wallet addresses, comma-separated, case-insensitive:
 * `ADMIN_WALLETS=0xAbc…,0xDef…`
 *
 * Empty is the safe default and means **nobody** outside the emulator — not
 * everybody, which is what `request.auth` alone amounted to.
 */
function adminWallets(): Set<string> {
  const configured = process.env.ADMIN_WALLETS ?? ''

  return new Set(
    configured
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0)
  )
}

/** True inside the Firebase emulator, where there is no signed-in user at all. */
export function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === 'true'
}

/**
 * Refuse anyone who is not an operator of this deployment.
 *
 * The three manual twins of the schedules — `syncPoolEventsNow`,
 * `sendDueRemindersNow`, `collectPushReceiptsNow` — used to ask only for
 * `request.auth`. That is not a gate here: authentication in this project is
 * deliberately cheap, and `firestore.rules` says so in as many words — *any
 * wallet can sign a nonce and get a token*. So a stranger with a throwaway
 * wallet could call `syncPoolEventsNow({ fromBlock: 0 })` in a loop and start
 * a five-minute, whole-history re-scan of every configured chain per call,
 * spending this project's RPC quota and Cloud Functions budget rather than
 * their own.
 *
 * None of the three is a user-facing feature. They exist so an operator can run
 * a schedule on demand, and locally because schedules do not fire in the
 * emulator at all — which is why the emulator is still let through unasked.
 *
 * @param request the callable request to check
 * @param action what is being attempted, for the error message and the log
 * @throws {HttpsError} `unauthenticated` with no token, `permission-denied`
 *   with one that is not on the list
 */
export function requireAdmin(request: CallableRequest<unknown>, action: string): void {
  if (isEmulator()) return

  if (!request.auth) {
    throw new HttpsError('unauthenticated', `User must be authenticated to ${action}`)
  }

  const caller = request.auth.uid.toLowerCase()
  const admins = adminWallets()

  if (!admins.has(caller)) {
    // Logged because the alternative — an operator endpoint refusing an
    // operator — is otherwise indistinguishable from the endpoint being
    // broken, and `ADMIN_WALLETS` being unset is the likeliest cause.
    logger.warn('Refused an operator endpoint to a non-admin caller', {
      action,
      caller,
      configuredAdmins: admins.size,
    })

    throw new HttpsError('permission-denied', `Only an operator may ${action}`)
  }
}
