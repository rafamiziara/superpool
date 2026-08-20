import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { WALLET_BUDGET_COLLECTION } from '../constants'

/**
 * How many whitelisting transactions the backend will pay for in a day, per
 * chain. `WHITELIST_DAILY_CAP`, default 100.
 *
 * A **global** cap rather than a per-wallet one, and that is the whole point.
 * A per-wallet limit bounds an accident and nothing else: the attack is one
 * transaction from each of a thousand fresh wallets, every one of them under
 * any per-wallet ceiling you could write. What has to be bounded is the
 * spending, so the counter is per chain and per day.
 *
 * 100 is chosen to be far above a real day of a testnet product and far below
 * a funded wallet. It is a circuit breaker, not a rationing scheme: reaching it
 * should page somebody rather than shape anyone's behaviour.
 */
const WHITELIST_DAILY_CAP = (() => {
  const configured = Number.parseInt(process.env.WHITELIST_DAILY_CAP ?? '', 10)

  return Number.isFinite(configured) && configured > 0 ? configured : 100
})()

/**
 * How long a nonce lease is held before it is considered abandoned, in ms.
 *
 * Longer than a confirmation on a healthy chain and shorter than the calling
 * function's 60-second timeout, so a crashed invocation cannot wedge the queue
 * for longer than the request that started it could have run.
 */
const LOCK_TTL_MS = 45_000

/** UTC, so a day means the same thing wherever this runs. */
function budgetDay(): string {
  return new Date().toISOString().slice(0, 10)
}

function budgetDocId(chainId: number): string {
  return `budget-${chainId}-${budgetDay()}`
}

function lockDocId(chainId: number): string {
  return `lock-${chainId}`
}

export interface BudgetClaim {
  granted: boolean
  used: number
  cap: number
}

/**
 * Take one whitelisting off today's budget for a chain, if there is one left.
 *
 * Claimed **before** the transaction is sent and given back if it never
 * happened — the shape `claimAssessment` and `notifyOnce` both use, and for the
 * same reason: counting afterwards lets two calls that started together both
 * pass the check.
 *
 * A transaction rather than `FieldValue.increment`, because the question is
 * "is there one left" and an increment cannot refuse.
 */
export async function claimWhitelisting(chainId: number, firestore: Firestore): Promise<BudgetClaim> {
  const docRef = firestore.collection(WALLET_BUDGET_COLLECTION).doc(budgetDocId(chainId))

  return firestore.runTransaction(async (transaction) => {
    const used = ((await transaction.get(docRef)).data()?.count as number | undefined) ?? 0

    if (used >= WHITELIST_DAILY_CAP) {
      // Loud, because reaching this means either a real surge worth knowing
      // about or somebody spending the project's gas — and nothing else in the
      // system would report either.
      logger.error('Daily whitelisting budget exhausted; refusing to spend more gas', {
        chainId,
        used,
        cap: WHITELIST_DAILY_CAP,
      })

      return { granted: false, used, cap: WHITELIST_DAILY_CAP }
    }

    transaction.set(docRef, { chainId, day: budgetDay(), count: used + 1 })

    return { granted: true, used: used + 1, cap: WHITELIST_DAILY_CAP }
  })
}

/**
 * Give a claim back when no transaction was sent.
 *
 * Never throws: a claim that leaks costs one slot out of the day's hundred and
 * the counter resets at midnight, which is a far better failure than an error
 * path that can itself fail.
 */
export async function releaseWhitelisting(chainId: number, firestore: Firestore): Promise<void> {
  try {
    const docRef = firestore.collection(WALLET_BUDGET_COLLECTION).doc(budgetDocId(chainId))

    await firestore.runTransaction(async (transaction) => {
      const used = ((await transaction.get(docRef)).data()?.count as number | undefined) ?? 0

      transaction.set(docRef, { chainId, day: budgetDay(), count: Math.max(0, used - 1) })
    })
  } catch (error) {
    logger.warn('Could not release a whitelisting claim; it expires at midnight anyway', {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Run `work` with exclusive use of the backend wallet on a chain.
 *
 * Every transaction this backend sends is signed by the same address, so two
 * concurrent sends build two transactions on the same nonce and the chain keeps
 * one. `preparePoolCreation` already caught the resulting error by matching the
 * word "nonce" in its message and asked the user to try again — that is the
 * symptom, and this is the cause.
 *
 * A lease rather than a mutex, because the holder is a Cloud Function that can
 * vanish: the lock carries an expiry, and an expired one is taken over rather
 * than waited on. Both the acquire and the takeover happen inside a
 * transaction, so two callers cannot decide simultaneously that the same stale
 * lease is theirs.
 *
 * Not queued, deliberately. A caller who cannot have the wallet is told so and
 * can ask again in a moment; holding an HTTP request open waiting for a lock
 * turns a fast refusal into a slow timeout.
 *
 * @throws {Error} `WalletBusyError` when the wallet is in use, or whatever
 *   `work` throws — the lease is released either way.
 */
export async function withWalletLock<T>(chainId: number, firestore: Firestore, work: () => Promise<T>): Promise<T> {
  const docRef = firestore.collection(WALLET_BUDGET_COLLECTION).doc(lockDocId(chainId))
  const heldUntil = Date.now() + LOCK_TTL_MS

  const acquired = await firestore.runTransaction(async (transaction) => {
    const lockedUntil = ((await transaction.get(docRef)).data()?.lockedUntil as number | undefined) ?? 0

    if (lockedUntil > Date.now()) return false

    transaction.set(docRef, { chainId, lockedUntil: heldUntil })

    return true
  })

  if (!acquired) {
    throw new WalletBusyError(chainId)
  }

  try {
    return await work()
  } finally {
    // Best effort: an unreleased lease expires on its own, so a failure here
    // delays the next caller rather than blocking them.
    try {
      await docRef.set({ chainId, lockedUntil: 0 })
    } catch (error) {
      logger.warn('Could not release the wallet lock; it expires on its own', {
        chainId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** The backend wallet is mid-transaction on this chain. Ask again shortly. */
export class WalletBusyError extends Error {
  constructor(public readonly chainId: number) {
    super(`The backend wallet is busy on chain ${chainId}`)
    this.name = 'WalletBusyError'
  }
}
