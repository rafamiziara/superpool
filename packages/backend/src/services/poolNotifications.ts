import { NoteKind, NotificationData } from '@superpool/types'
import { Provider } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { POOLS_COLLECTION } from '../constants'
import { IndexLoanResult, ParsedLoan } from './loanIndexer'
import { IndexMembershipResult, ParsedMembership } from './membershipIndexer'
import { notificationKey, notifyOnce } from './notifications'
import { noteFor } from './notes'

/**
 * Which transitions are worth a push, and to whom.
 *
 * **Owner-facing**, and the reason any of this exists: somebody asked to join,
 * and somebody asked to borrow. They cost the asker nothing to make and the
 * owner everything to miss, and everything an owner is supposed to do
 * otherwise depends on them opening the pool and looking.
 *
 * **Borrower-facing**: the answers to those two questions, and the declaration
 * of a default. Courtesies, but ones with a decision behind them — a request
 * that is answered silently is indistinguishable from one that was ignored.
 *
 * Two are deliberately absent. **Being removed from a pool** is not a decision
 * on anything the member asked for, and reaches them through the pool screen
 * rather than a push. **Leaving** is self-authored, like cancelling a request:
 * nobody needs telling what they just did.
 *
 * The reminders that come from the clock rather than from an event are in
 * `dueReminders.ts`; nothing on chain fires when a term lapses.
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
 * Tell a borrower what happened to the request or the debt they were waiting on.
 *
 * Three transitions, all reaching the same wallet: the owner approved, the
 * owner refused, or the owner declared the debt in default.
 *
 * The provider is here for one reason, and it is the trap this whole function
 * is shaped around — see `wasSelfAuthored`.
 */
export async function notifyLoanDecided(
  result: IndexLoanResult,
  loan: ParsedLoan,
  provider: Provider,
  firestore: Firestore
): Promise<void> {
  const kind = DECIDED_KINDS[result.transition as keyof typeof DECIDED_KINDS]

  if (!kind) return

  // `cancelLoanRequest` emits `LoanRejected` and leaves the loan in exactly the
  // state `rejectLoan` does — deliberately, since the record tracks the state
  // and not who ended the request. So the state cannot tell the two apart and
  // the *sender* has to: telling a borrower their request was declined when
  // they withdrew it themselves is worse than saying nothing.
  if (result.transition === 'rejected' && (await wasSelfAuthored(loan, provider))) {
    logger.info('Skipping notification for a request its borrower withdrew', {
      poolId: loan.poolId,
      loanId: loan.loanId,
    })

    return
  }

  const pool = await poolSummary(loan.chainId, loan.poolId, firestore)

  if (!pool) return

  // An owner borrowing from their own pool decided this themselves.
  if (isSameAddress(pool.poolOwner, loan.borrower)) {
    logger.info('Skipping self-authored loan decision notification', { poolId: loan.poolId, borrower: loan.borrower })

    return
  }

  const data: NotificationData = {
    kind,
    poolId: String(loan.poolId),
    poolName: pool.name,
    actor: loan.borrower,
    loanId: String(loan.loanId),
  }

  const copy = LOAN_DECISION_COPY[kind](pool.name)
  // The whole point of the ordering: the owner writes their reason *before*
  // sending the transaction, so by the time this runs there is something to
  // quote. A refusal with a reason is a different thing from a refusal.
  const body = await withReason(copy.body, result.id, kind, firestore)

  await notifyOnce(notificationKey(result.id, kind), loan.borrower, { ...copy, body, data }, firestore)
}

/**
 * Tell an applicant whether they are in.
 *
 * Only the two outcomes of a decision. Reaching `active` from nothing is
 * `MemberJoined` — an open pool enrolling whoever deposited — and the
 * membership indexer already reports that as no transition at all, so a
 * depositor is never congratulated on being admitted to a pool that admits
 * everybody.
 */
export async function notifyMembershipDecided(
  result: IndexMembershipResult,
  membership: ParsedMembership,
  firestore: Firestore
): Promise<void> {
  const kind = MEMBERSHIP_KINDS[result.transition as keyof typeof MEMBERSHIP_KINDS]

  if (!kind) return

  const pool = await poolSummary(membership.chainId, membership.poolId, firestore)

  if (!pool) return

  if (isSameAddress(pool.poolOwner, membership.account)) {
    logger.info('Skipping self-authored membership decision notification', {
      poolId: membership.poolId,
      account: membership.account,
    })

    return
  }

  const data: NotificationData = {
    kind,
    poolId: String(membership.poolId),
    poolName: pool.name,
    actor: membership.account,
  }

  const opening =
    kind === 'membership_approved' ? `You are now a member of ${pool.name}.` : `Your request to join ${pool.name} was declined.`
  const body = await withReason(opening, result.id, kind, firestore)

  await notifyOnce(
    notificationKey(result.id, kind),
    membership.account,
    { title: kind === 'membership_approved' ? 'Request approved' : 'Request declined', body, data },
    firestore
  )
}

/**
 * What a push body can carry before a phone stops showing it.
 *
 * Both platforms truncate rather than reject, so this is about what the
 * recipient actually reads on a lock screen, not about a limit. A note is
 * capped at 280 characters and the opening sentence names the pool, so a long
 * reason is the only thing that can push a body past this.
 */
const MAX_BODY_LENGTH = 240

/**
 * The notification body with the reason somebody gave, if they gave one.
 *
 * **Asked for by (record, outcome)**, which is what makes a stale reason
 * invisible rather than wrong: an owner who typed a rejection and then
 * approved instead leaves a `loan_rejected` note behind, and nothing ever asks
 * for it.
 *
 * Failing to read a note must not stop a notification — the decision is the
 * news and the reason is the courtesy — so this falls back to the bare body.
 */
async function withReason(body: string, recordId: string, kind: NoteKind, firestore: Firestore): Promise<string> {
  try {
    const note = await noteFor(recordId, kind, firestore)

    if (!note) return body

    return truncate(`${body} ${note.text}`, MAX_BODY_LENGTH)
  } catch (error) {
    logger.warn('Could not read the note for a notification; sending it without', {
      recordId,
      kind,
      error: error instanceof Error ? error.message : String(error),
    })

    return body
  }
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text

  return `${text.slice(0, limit - 1).trimEnd()}…`
}

/** Loan transitions that are an answer to the borrower, by the kind they send. */
const DECIDED_KINDS = {
  approved: 'loan_approved',
  rejected: 'loan_rejected',
  defaulted: 'loan_defaulted',
} as const

/** Membership transitions that are a decision, by the kind they send. */
const MEMBERSHIP_KINDS = {
  active: 'membership_approved',
  rejected: 'membership_rejected',
} as const

const LOAN_DECISION_COPY: Record<
  (typeof DECIDED_KINDS)[keyof typeof DECIDED_KINDS],
  (poolName: string) => { title: string; body: string }
> = {
  loan_approved: (poolName) => ({ title: 'Loan approved', body: `${poolName} approved your loan and sent the funds.` }),
  loan_rejected: (poolName) => ({ title: 'Loan declined', body: `${poolName} turned down your loan request.` }),
  // Says what is true and what to do, rather than only that something bad
  // happened: the debt is still open and paying it is still the way out.
  loan_defaulted: (poolName) => ({
    title: 'Loan marked in default',
    body: `${poolName} marked your loan as in default. It is still owed, and interest is still accruing.`,
  }),
}

/**
 * Whether the borrower sent the transaction that produced this state.
 *
 * The one question the indexed record cannot answer, because `rejectLoan` and
 * `cancelLoanRequest` leave it identical. Costs one `getTransaction`, asked
 * only on the rejected path rather than for every loan event.
 *
 * **Fails closed on an unreachable node**: an unknown sender is treated as the
 * borrower and nothing is sent. A missed courtesy is cheaper than telling
 * somebody they were refused when they changed their own mind, and the claim
 * is never made, so a later sweep can still send it.
 */
async function wasSelfAuthored(loan: ParsedLoan, provider: Provider): Promise<boolean> {
  try {
    const transaction = await provider.getTransaction(loan.transactionHash)

    if (!transaction) return true

    return isSameAddress(transaction.from, loan.borrower)
  } catch (error) {
    logger.warn('Could not read the sender of a loan rejection; staying quiet', {
      transactionHash: loan.transactionHash,
      error: error instanceof Error ? error.message : String(error),
    })

    return true
  }
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
