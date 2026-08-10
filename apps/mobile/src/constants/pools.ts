/**
 * Limits that mirror `PoolFactory.createPool`'s own validation.
 *
 * These live here rather than beside the hook that enforces them: the form and
 * the hook both need them, and a constant exported from a hook module silently
 * becomes `undefined` wherever that hook is mocked — which turns a comparison
 * like `rate <= MAX_INTEREST_RATE_BPS` into a rejection of everything.
 */

/** Interest rate ceiling: 10000 bps = 100%. Verified against the deployed contract. */
export const MAX_INTEREST_RATE_BPS = 10_000

export const SECONDS_PER_DAY = 86_400

/**
 * Client-side caps the contract does not impose. Unbounded strings are stored on
 * chain and paid for in gas, so the form keeps them sane.
 */
export const MAX_POOL_NAME_LENGTH = 64
export const MAX_POOL_DESCRIPTION_LENGTH = 256
