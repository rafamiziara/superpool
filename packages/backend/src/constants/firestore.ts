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
 * The name of the Firestore collection used to store indexed liquidity
 * withdrawals (`FundsWithdrawn` events).
 *
 * Separate from contributions rather than a signed amount on them: each is one
 * event, and a position is deposits minus withdrawals, summed on read.
 */
export const WITHDRAWALS_COLLECTION = 'withdrawals'
