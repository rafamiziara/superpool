import { BorrowerHistory } from '@superpool/types'
import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { LOANS_COLLECTION } from '../constants'

/**
 * What one wallet has done with money it borrowed before.
 *
 * The same shape `PoolStore.borrowerHistory` derives in the app, computed here
 * instead — and the reason is not the assessment that wanted it. The app's
 * version is derived from `PoolStore.loans`, which is the newest
 * `DEFAULT_PAGE_SIZE` loans on the chain, so **a wallet with more loans than
 * one page is summarised from part of its record**. That is fine for a feed
 * and wrong for the panel a pool owner reads before lending. Filtering by
 * borrower first, here, summarises the whole record.
 *
 * Counts rather than a score, deliberately — see `BorrowerHistory` and
 * `.dev/old/REPUTATION_PLAN.md` §7. Nothing about a borrower is stored, so
 * nothing about a borrower can go stale.
 */

/**
 * How many wallets one call may ask about.
 *
 * Bounded because each is its own pass over the returned documents, and
 * because the approvals queue — the caller this exists for — shows one card
 * per pending request and never a hundred of them.
 */
export const MAX_BORROWERS_PER_CALL = 25

/** The fields a history is made of, and no others. */
interface HistoryLoan {
  borrower: string
  status?: string
  isRepaid?: boolean
  /** Seconds. The chain's own start, as `startedAt` on the stored record. */
  startedAtSeconds: number
  /** Seconds. */
  duration: number
  /** Seconds, or undefined on a loan nobody has settled — or settled undated. */
  repaidAtSeconds?: number
  /** Seconds, or undefined on a loan nobody declared. */
  defaultedAtSeconds?: number
}

export function emptyHistory(): BorrowerHistory {
  return { total: 0, repaid: 0, onTime: 0, late: 0, undated: 0, outstanding: 0, overdue: 0, defaulted: 0, isNew: true }
}

/**
 * Whether the pool's money actually went out on this loan.
 *
 * `defaulted` counts, and so does a repaid loan — the chain leaves `status` at
 * `disbursed` (or at `defaulted`, on one that recovered) and flips `isRepaid`,
 * so status alone never says "settled". Only `requested` and `rejected` mean
 * nothing was ever lent, and neither says anything about whether this wallet
 * gives money back.
 */
function wasFunded(loan: HistoryLoan): boolean {
  return loan.status === 'disbursed' || loan.status === 'defaulted'
}

/**
 * Summarise loans into one wallet's record.
 *
 * Pure, and takes its own `now` rather than reading a clock. That is what lets
 * the caller pass **chain time** — see `borrowerHistoriesFor`, and the same
 * trap `sendDueReminders` is shaped around: a local node's clock and this
 * machine's disagree by months, and `overdue` is a judgement about time.
 *
 * @param loans every funded and unfunded loan belonging to one wallet
 * @param nowSeconds the moment to judge lateness against, in seconds
 */
export function summariseLoans(loans: HistoryLoan[], nowSeconds: number): BorrowerHistory {
  const history = emptyHistory()

  for (const loan of loans) {
    if (!wasFunded(loan)) continue

    history.total += 1

    // Read from the date rather than from the status, so a loan that was
    // declared and then paid still counts here. The two are independent facts
    // and this is the one an owner is asking about.
    if (loan.defaultedAtSeconds !== undefined) history.defaulted += 1

    const dueAtSeconds = loan.startedAtSeconds + loan.duration

    // Still owed: funded and not settled. `defaulted` is live too — a
    // declaration is a judgement on a debt, never a settlement of one.
    if (!loan.isRepaid) {
      history.outstanding += 1

      if (nowSeconds > dueAtSeconds) history.overdue += 1

      continue
    }

    history.repaid += 1

    // A repayment with no date is neither on time nor late. Loans settled
    // before the contract recorded `repaidAt` are counted as repaid and left
    // out of both tallies, because the honest answer to when they were settled
    // is that nobody knows.
    if (loan.repaidAtSeconds === undefined) history.undated += 1
    else if (loan.repaidAtSeconds > dueAtSeconds) history.late += 1
    else history.onTime += 1
  }

  // Nothing to show reads as **new**, never as bad. A lending product that
  // confuses "has never borrowed" with "is the worst kind of borrower" is
  // unusable for exactly the people micro-lending is for.
  history.isNew = history.total === 0

  return history
}

/**
 * The records of several wallets, on one chain.
 *
 * Every wallet asked about comes back, including ones that have never
 * borrowed — an absent key would make a caller guess whether the wallet is new
 * or the call went wrong, which is the distinction `isNew` exists to protect.
 *
 * One query per wallet rather than one `in` query over all of them: `in` caps
 * at thirty values, and a wallet's whole record is what this exists to read,
 * so a shared page limit across wallets would reintroduce the very truncation
 * the app already suffers from.
 */
export async function borrowerHistoriesFor(
  borrowers: string[],
  chainId: number,
  nowSeconds: number,
  firestore: Firestore
): Promise<Record<string, BorrowerHistory>> {
  const histories = await Promise.all(
    walletsAsked(borrowers).map(async (wallet) => [wallet, summariseLoans(await loansOf(wallet, chainId, firestore), nowSeconds)] as const)
  )

  return Object.fromEntries(histories)
}

/**
 * The same answer for a chain with nothing on it, without asking Firestore.
 *
 * For a chain this backend does not serve, where there are no loans to read
 * and — the reason this exists rather than a plain empty object — **no chain
 * to read a time from**. A wallet with no record is `isNew`, which is what a
 * wallet on an unserved chain genuinely is as far as this backend can see.
 *
 * Normalised through `walletsAsked` like the real thing, so the two cannot
 * disagree about which keys come back for a given request.
 */
export function emptyHistoriesFor(borrowers: string[]): Record<string, BorrowerHistory> {
  return Object.fromEntries(walletsAsked(borrowers).map((wallet) => [wallet, emptyHistory()] as const))
}

/**
 * Which wallets a request is actually asking about.
 *
 * Lowercased because that is how the loans are stored and how the response is
 * keyed, deduplicated because asking twice is one question, and capped last so
 * the cap counts wallets rather than repetitions of one.
 */
function walletsAsked(borrowers: string[]): string[] {
  return [...new Set(borrowers.map((borrower) => borrower.toLowerCase()))].slice(0, MAX_BORROWERS_PER_CALL)
}

/**
 * Every loan one wallet holds on one chain — the whole record, not a page.
 *
 * `select` rather than the whole document: a history is made of six fields and
 * the records carry twenty, several of them wei strings nobody here reads.
 */
async function loansOf(wallet: string, chainId: number, firestore: Firestore): Promise<HistoryLoan[]> {
  const snapshot = await firestore
    .collection(LOANS_COLLECTION)
    .where('chainId', '==', chainId)
    .where('borrower', '==', wallet)
    .select('borrower', 'status', 'isRepaid', 'startedAt', 'duration', 'repaidAt', 'defaultedAt')
    .get()

  return snapshot.docs.flatMap((doc) => {
    const data = doc.data()
    const startedAt = secondsOf(data.startedAt as Timestamp | undefined)

    // A funded loan with no start date cannot be dated, and a guessed term
    // would put it in the on-time or the late column on no evidence. Counting
    // it at all would be worse than leaving it out and saying so.
    if (startedAt === undefined || typeof data.duration !== 'number') {
      logger.warn('Loan has no usable term; leaving it out of the borrower history', { docId: doc.id })

      return []
    }

    return [
      {
        borrower: data.borrower as string,
        status: data.status as string | undefined,
        isRepaid: data.isRepaid as boolean | undefined,
        startedAtSeconds: startedAt,
        duration: data.duration,
        repaidAtSeconds: secondsOf(data.repaidAt as Timestamp | undefined),
        defaultedAtSeconds: secondsOf(data.defaultedAt as Timestamp | undefined),
      },
    ]
  })
}

function secondsOf(stamp: Timestamp | undefined): number | undefined {
  if (!stamp?.toDate) return undefined

  return Math.floor(stamp.toDate().getTime() / 1000)
}
