import { NotificationData } from '@superpool/types'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { POOLS_COLLECTION } from '../constants'
import { IndexLoanResult, ParsedLoan } from './loanIndexer'
import { IndexMembershipResult, ParsedMembership } from './membershipIndexer'
import { notificationKey, notifyOnce } from './notifications'

/**
 * Which transitions are worth a push, and to whom.
 *
 * Deliberately only two, both owner-facing: somebody asked to join, and
 * somebody asked to borrow. They are the ones that cost the asker nothing to
 * make and the owner everything to miss — everything an owner is supposed to do
 * otherwise depends on them opening the pool and looking.
 *
 * The borrower-facing ones (approved, rejected, repayment reminders) are
 * courtesies and a product decision respectively, and are not built. See
 * `.dev/NOTIFICATIONS_PLAN.md` §8.
 */

interface PoolSummary {
  /** Lowercased, as the indexer stores it. */
  poolOwner: string
  name: string
}

/**
 * Tell a pool's owner that somebody has asked to borrow.
 *
 * Silent unless the transition is a genuine `absent → requested`. `stored` is
 * not enough: the loan indexer rewrites a document to correct its transaction
 * reference, and triggering on that would announce a request every time a sweep
 * tidied up a hash.
 */
export async function notifyLoanRequested(result: IndexLoanResult, loan: ParsedLoan, firestore: Firestore): Promise<void> {
  if (result.transition !== 'requested') return

  const pool = await poolSummary(loan.chainId, loan.poolId, firestore)

  if (!pool) return

  // An owner borrowing from their own pool does not need telling. This is also
  // the guard that keeps a self-approving owner quiet, since `approveLoan` on
  // one's own request would otherwise be news to oneself.
  if (isSameAddress(pool.poolOwner, loan.borrower)) {
    logger.info('Skipping self-authored loan request notification', { poolId: loan.poolId, borrower: loan.borrower })

    return
  }

  const data: NotificationData = {
    kind: 'loan_requested',
    poolId: String(loan.poolId),
    poolName: pool.name,
    actor: loan.borrower,
  }

  await notifyOnce(
    notificationKey(result.id, 'loan_requested'),
    pool.poolOwner,
    {
      title: 'New loan request',
      body: `Someone asked to borrow from ${pool.name}.`,
      data,
    },
    firestore
  )
}

/**
 * Tell a pool's owner that somebody has asked to join.
 *
 * Note what is *not* here: an address arriving at `active` with no prior record
 * is `MemberJoined`, an open pool enrolling whoever deposited. Nobody decided
 * anything, so there is nothing to tell the owner. The membership indexer
 * already reports that as no transition at all.
 */
export async function notifyMembershipRequested(
  result: IndexMembershipResult,
  membership: ParsedMembership,
  firestore: Firestore
): Promise<void> {
  if (result.transition !== 'requested') return

  const pool = await poolSummary(membership.chainId, membership.poolId, firestore)

  if (!pool) return

  if (isSameAddress(pool.poolOwner, membership.account)) {
    logger.info('Skipping self-authored membership request notification', {
      poolId: membership.poolId,
      account: membership.account,
    })

    return
  }

  const data: NotificationData = {
    kind: 'membership_requested',
    poolId: String(membership.poolId),
    poolName: pool.name,
    actor: membership.account,
  }

  await notifyOnce(
    notificationKey(result.id, 'membership_requested'),
    pool.poolOwner,
    {
      title: 'New join request',
      body: `Someone asked to join ${pool.name}.`,
      data,
    },
    firestore
  )
}

/**
 * The owner and name of a pool, or nothing.
 *
 * A missing document means the pool's own creation was never indexed. There is
 * no owner to notify and no name to put in the body, and inventing either would
 * be worse than staying quiet — the sweep will index the pool and the next
 * event about it will find this.
 */
async function poolSummary(chainId: number, poolId: number, firestore: Firestore): Promise<PoolSummary | null> {
  const doc = await firestore.collection(POOLS_COLLECTION).doc(`${chainId}-${poolId}`).get()

  if (!doc.exists) {
    logger.warn('No indexed pool for a notification; skipping', { chainId, poolId })

    return null
  }

  const data = doc.data()!

  if (!data.poolOwner) return null

  return { poolOwner: data.poolOwner as string, name: (data.name as string) || `pool #${poolId}` }
}

/**
 * Addresses are stored lowercased and wallets report them checksummed, so this
 * is never a `===` comparison. Empty on either side is false — "nobody" must
 * not match "nobody".
 */
function isSameAddress(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false

  return a.toLowerCase() === b.toLowerCase()
}
