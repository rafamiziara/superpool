/**
 * The name of the Firestore collection used to store authentication nonces.
 */
export const AUTH_NONCES_COLLECTION = 'auth_nonces'

/**
 * The name of the Firestore collection used to store users information.
 */
export const USERS_COLLECTION = 'users'

/**
 * The name of the Firestore collection used to store approved devices.
 */
export const APPROVED_DEVICES_COLLECTION = 'approved_devices'

/**
 * The name of the Firestore collection used to store whitelisting audit logs.
 */
export const WHITELISTING_LOGS_COLLECTION = 'whitelisting_logs'

/**
 * The name of the Firestore collection used to store indexed lending pools.
 */
export const POOLS_COLLECTION = 'pools'

/**
 * The name of the Firestore collection used to store event sync state per chain.
 */
export const EVENT_SYNC_STATE_COLLECTION = 'event_sync_state'

/**
 * The name of the Firestore collection used to store indexed liquidity
 * contributions (`FundsDeposited` events).
 */
export const CONTRIBUTIONS_COLLECTION = 'contributions'

/**
 * The name of the Firestore collection used to store indexed loans.
 *
 * Unlike contributions and withdrawals, a document here is not one event: a
 * loan is created and later repaid, so the record is the loan's current state
 * as `getLoan` reports it, rewritten whenever either event is seen.
 */
export const LOANS_COLLECTION = 'loans'

/**
 * The name of the Firestore collection used to store indexed liquidity
 * withdrawals (`FundsWithdrawn` events).
 *
 * Separate from contributions rather than a signed amount on them: each is one
 * event, and a position is deposits minus withdrawals, summed on read.
 */
export const WITHDRAWALS_COLLECTION = 'withdrawals'

/**
 * The name of the Firestore collection used to store pool memberships.
 *
 * The loan shape rather than the contribution shape: one document per
 * (pool, address), rewritten by every event that touches it, holding what
 * `membership(address)` reports now. Keyed that way because an address's
 * standing changes — requested, admitted, removed — while a contribution never
 * does.
 */
export const MEMBERSHIPS_COLLECTION = 'memberships'

/**
 * The name of the Firestore collection used to store indexed interest claims
 * (`InterestClaimed` events).
 *
 * The contribution shape, not the membership shape: a claim is an event and
 * never changes, so a member's lifetime earnings are summed from these on read.
 * `InterestDistributed` has no collection of its own — it moves a pool-level
 * figure that is read from the chain.
 */
export const INTEREST_CLAIMS_COLLECTION = 'interest_claims'

/**
 * The name of the Firestore collection used to store Expo push tokens.
 *
 * Its own collection rather than a field on `approved_devices`, which is
 * otherwise exactly the (device, wallet) join a token wants:
 * `DeviceVerificationService.approveDevice` writes that document with `set()`
 * and no merge, so a token kept there would be wiped by the next
 * authentication — and that happens on every cold start. The failure would
 * look like notifications quietly stopping after a while, which is the worst
 * kind of bug to go looking for.
 *
 * Keyed by the token itself. Both directions are many-to-many — one wallet on
 * two phones, two wallets on one phone in development — so neither address nor
 * device can be the key.
 */
export const PUSH_TOKENS_COLLECTION = 'push_tokens'

/**
 * The name of the Firestore collection used to remember which notifications
 * have already been sent.
 *
 * One document per (record, transition). `syncPoolEvents` re-scans ranges on
 * purpose and a failed scheduled run is retried, so without this a re-scan of
 * genesis — a supported operation here — would produce a push for every
 * request ever made.
 */
export const NOTIFICATIONS_SENT_COLLECTION = 'notifications_sent'
