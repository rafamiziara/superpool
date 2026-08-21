import { NotificationData } from '@superpool/types'
import { JsonRpcProvider } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { LOANS_COLLECTION, POOLS_COLLECTION } from '../constants'
import { notificationKey, notifyOnce } from './notifications'

/**
 * Telling a borrower their term is running out, or has run out.
 *
 * **The only notifications in this project that nobody causes.** Every other
 * one hangs off an indexer, because somebody did something and a log was
 * emitted. A term lapsing emits nothing — no event fires when time passes,
 * there is no keeper, and `markDefaulted` is the owner's decision rather than
 * the clock's. So this is a scan, on a schedule, and it is the only way a
 * borrower hears about a date rather than about an action.
 */

/** How long before the due date the first reminder goes out. */
export const DUE_SOON_WINDOW_SECONDS = 24 * 60 * 60

/**
 * The most open loans one chain is scanned for in a run.
 *
 * A bound rather than a page size: nothing here paginates, so a chain with more
 * open loans than this would leave the remainder unreminded until they fell
 * inside the window on a later run — which is survivable and silent, so it is
 * logged. The fix at that scale is a `dueAt` field written by the indexer and a
 * range query, not a bigger number here; that is a real schema change and this
 * is not the scale that justifies it.
 */
const MAX_OPEN_LOANS_PER_CHAIN = 500

/** The two states a loan can be in while the money is still out. */
const OPEN_STATUSES = ['disbursed', 'defaulted'] as const

export interface DueReminderResult {
  chainId: number
  /** Open loans considered. */
  scanned: number
  /** Reminders sent because the due date is close. */
  dueSoon: number
  /** Reminders sent because the due date has passed. */
  overdue: number
}

interface OpenLoan {
  docId: string
  loanId: number
  poolId: number
  borrower: string
  /** Unix seconds, in **chain** time — `startTime + duration`. */
  dueAt: number
}

/**
 * Remind the borrowers of one chain's open loans.
 *
 * **The clock is the chain's, not the server's**, and that is the whole
 * discipline of this function. `startedAt` is a block timestamp and `duration`
 * is a count of chain seconds, so a due date is a fact in chain time; comparing
 * it against `Date.now()` compares two clocks that are only loosely related.
 * On a public chain they drift by seconds, which would merely make a reminder
 * early or late. On a local node they are not related at all — the tests move
 * chain time by months — so a server clock would report every loan as
 * comfortably inside its term while the contract considered it long overdue.
 *
 * One `getBlock('latest')` per chain per run buys the right answer.
 */
export async function remindChain(chainId: number, provider: JsonRpcProvider, firestore: Firestore): Promise<DueReminderResult> {
  const latest = await provider.getBlock('latest')

  if (!latest) throw new Error(`No latest block for chain ${chainId}; cannot date a reminder`)

  const now = latest.timestamp
  const loans = await openLoans(chainId, firestore)

  const result: DueReminderResult = { chainId, scanned: loans.length, dueSoon: 0, overdue: 0 }

  for (const loan of loans) {
    // Overdue first, and exclusively: a loan that is already past its date has
    // no use for a warning that it is approaching one. A loan that ran its
    // whole term between two runs of this job therefore gets the overdue
    // reminder and never the due-soon one, which is the right of the two to
    // keep.
    if (now > loan.dueAt) {
      if (await remind(loan, 'loan_overdue', chainId, firestore)) result.overdue += 1
      continue
    }

    if (loan.dueAt - now <= DUE_SOON_WINDOW_SECONDS) {
      if (await remind(loan, 'loan_due_soon', chainId, firestore)) result.dueSoon += 1
    }
  }

  logger.info('Due reminders swept a chain', { ...result })

  return result
}

/**
 * The open loans of one chain.
 *
 * `defaulted` is in the filter beside `disbursed` for the same reason it is
 * everywhere else: a declared default is a debt that is still owed, and the
 * borrower of one is exactly who a reminder is for.
 */
async function openLoans(chainId: number, firestore: Firestore): Promise<OpenLoan[]> {
  const snapshot = await firestore
    .collection(LOANS_COLLECTION)
    .where('chainId', '==', chainId)
    .where('status', 'in', OPEN_STATUSES)
    .where('isRepaid', '==', false)
    .limit(MAX_OPEN_LOANS_PER_CHAIN)
    .get()

  if (snapshot.size === MAX_OPEN_LOANS_PER_CHAIN) {
    logger.warn('Hit the open-loan scan bound; some borrowers may not be reminded this run', {
      chainId,
      bound: MAX_OPEN_LOANS_PER_CHAIN,
    })
  }

  return snapshot.docs.flatMap((doc) => {
    const data = doc.data()
    const startedAt = data.startedAt?.toDate?.() as Date | undefined

    // A record with no start date cannot be dated, and guessing one would
    // either nag a fresh borrower or stay silent on an old debt. Both are worse
    // than skipping it and saying so.
    if (!startedAt || typeof data.duration !== 'number') {
      logger.warn('Open loan has no usable term; not reminding', { docId: doc.id })

      return []
    }

    return [
      {
        docId: doc.id,
        loanId: data.loanId as number,
        poolId: data.poolId as number,
        borrower: data.borrower as string,
        dueAt: Math.floor(startedAt.getTime() / 1000) + data.duration,
      },
    ]
  })
}

/**
 * Send one reminder, at most once per loan per kind, ever.
 *
 * **Once, not daily.** The marker `notifyOnce` claims is keyed on the loan and
 * the kind, so a borrower is told once that their loan is nearly due and once
 * that it is late, and never again. A job that ran every hour against a
 * "still overdue" condition would otherwise send a notification an hour for as
 * long as the debt stood, which is how an app gets its notifications turned
 * off — and the second reminder tells the borrower nothing the first did not.
 *
 * @returns Whether a notification was actually dispatched.
 */
async function remind(loan: OpenLoan, kind: 'loan_due_soon' | 'loan_overdue', chainId: number, firestore: Firestore): Promise<boolean> {
  const pool = await firestore.collection(POOLS_COLLECTION).doc(`${chainId}-${loan.poolId}`).get()

  if (!pool.exists) {
    logger.warn('No indexed pool for a due reminder; skipping', { chainId, poolId: loan.poolId })

    return false
  }

  const poolName = (pool.data()!.name as string) || `pool #${loan.poolId}`

  // Note there is no self-authored guard here, unlike every other sender.
  // Nobody caused this: an owner who borrowed from their own pool is as capable
  // of losing track of a date as anyone else, and the reminder is about the
  // clock rather than about somebody's decision.
  const data: NotificationData = {
    kind,
    poolId: String(loan.poolId),
    poolName,
    actor: loan.borrower,
    loanId: String(loan.loanId),
  }

  const copy =
    kind === 'loan_due_soon'
      ? { title: 'Loan due soon', body: `Your loan from ${poolName} is due within a day.` }
      : { title: 'Loan overdue', body: `Your loan from ${poolName} is past its due date, and interest is still accruing.` }

  const sent = await notifyOnce(notificationKey(loan.docId, kind), loan.borrower, { ...copy, data }, firestore)

  return sent !== null
}
