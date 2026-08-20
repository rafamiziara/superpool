/**
 * Whether callables refuse a request that carries no valid App Check token.
 *
 * **Off unless `ENFORCE_APP_CHECK=true`, and that default is deliberate.**
 *
 * Until now `enforceAppCheck` appeared in no function at all. The whole App
 * Check chain existed and ran — `customAppCheckMinter`, `approved_devices`,
 * `DeviceVerificationService` — minting tokens that nothing ever asked for, and
 * `CLAUDE.md` described the device-verification flow as though it were a live
 * control. It was not one; this is the switch that makes it real.
 *
 * It ships off because turning it on blind locks every existing client out.
 * Enforcement needs a build whose App Check provider actually works end to end,
 * which is the same dev build push is waiting on. Flip it there, confirm the
 * app still gets through, then flip it in production.
 *
 * Two things to know before relying on it, because neither is obvious:
 *
 * - **A device is approved on the caller's say-so.** `verifySignatureAndLogin`
 *   approves whatever `deviceId` string it is handed once a signature checks
 *   out, so anybody with any wallet can have an approved device of their
 *   choosing. This raises the cost of automated abuse — a script now needs to
 *   walk the whole login flow — and it is not an identity boundary.
 * - **It is not a substitute for the caps.** `WHITELIST_DAILY_CAP` and
 *   `requireAdmin` bound what a caller who gets through can do; App Check only
 *   makes getting through less convenient.
 */
export function enforceAppCheck(): boolean {
  return process.env.ENFORCE_APP_CHECK === 'true'
}
