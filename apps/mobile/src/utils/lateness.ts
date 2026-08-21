import { Loan, LoanInfo, LoanStatus } from '@superpool/types'

/**
 * Where a loan stands against its own due date.
 *
 * **Derived, never stored, and never on chain.** A due date is
 * `startedAt + duration`, so anyone with a clock can work out whether a loan is
 * late — which is exactly why the contract does not record it. What the chain
 * records instead is the pool owner *declaring* a default, because a judgement
 * is the only part of this that needs a witness.
 *
 * So `overdue` and `defaulted` are different questions, and the difference
 * matters at every call site:
 *
 * - **overdue** is arithmetic, true the second the term lapses, and true of
 *   plenty of loans nobody minds about;
 * - **defaulted** is somebody's decision, on the record, and never automatic.
 *
 * A loan can be overdue for months without being defaulted — most owners will
 * never declare one — and a declared loan is overdue by construction.
 */
export type Lateness =
  /** Not funded, or settled: nothing is running. */
  | 'none'
  /** Running, with more than `DUE_SOON_WINDOW_MS` left. */
  | 'running'
  /** Running, and due within a day. */
  | 'due-soon'
  /** Past its due date and not declared. */
  | 'overdue'
  /** Past its due date and declared by the pool's owner. */
  | 'defaulted'

/**
 * How close to its due date a loan has to be to read as "due soon".
 *
 * A day, matching `DUE_SOON_WINDOW_SECONDS` in the backend's reminder scan, so
 * the badge a borrower sees and the notification they receive agree about when
 * a loan started being urgent. The two are separate constants because one is a
 * screen and the other is a scheduled job, and neither imports from the other.
 */
export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Judge a loan against a moment.
 *
 * `now` is a parameter rather than read here so that a render can pass a single
 * timestamp for a whole list — and so a test can state the moment instead of
 * arranging for one. It runs on the **device clock**, which is right for a
 * badge and wrong for anything about to send money: the contract runs on block
 * time, and every figure that decides a transaction is read from the chain.
 */
export function latenessOf(loan: Loan, now: number = Date.now()): Lateness {
  if (!isLive(loan)) return 'none'

  return judge(loan.status === LoanStatus.DEFAULTED, loan.dueDate?.getTime(), now)
}

/**
 * The same judgement against the **indexed** record.
 *
 * Two entry points rather than one because the two shapes are both real and
 * neither is going away: screens hold the mapped `Loan`, while anything that
 * needs a `loanId` — every screen that can send a transaction — holds the
 * `LoanInfo` it came from. Converting between them to ask this question would
 * be a lot of work to reach one boolean.
 *
 * They share `judge`, so the two cannot disagree about what "late" means.
 */
export function latenessOfRecord(loan: LoanInfo, now: number = Date.now()): Lateness {
  const funded = loan.status === 'disbursed' || loan.status === 'defaulted'

  if (!funded || loan.isRepaid) return 'none'

  const dueAt = new Date(loan.startedAt).getTime() + loan.duration * 1000

  return judge(loan.status === 'defaulted', dueAt, now)
}

/**
 * The one definition of where a live loan stands.
 *
 * A declaration outranks the arithmetic. It is also always past due — the
 * contract refuses to declare a loan inside its term — so checking it first
 * costs nothing and states the stronger fact.
 */
function judge(declared: boolean, dueAt: number | undefined, now: number): Lateness {
  if (declared) return 'defaulted'

  // A live loan with no due date is one the record could not date. Reporting it
  // as running is the safe direction: calling a loan overdue on the strength of
  // a missing field would be an accusation made from a gap.
  if (dueAt === undefined) return 'running'

  if (now > dueAt) return 'overdue'

  return dueAt - now <= DUE_SOON_WINDOW_MS ? 'due-soon' : 'running'
}

/**
 * Whether a loan still owes the pool money.
 *
 * The single answer to "is this debt open", so that `defaulted` cannot be
 * forgotten at one call site and remembered at another.
 */
export function isLive(loan: Loan): boolean {
  return loan.status === LoanStatus.DISBURSED || loan.status === LoanStatus.DEFAULTED
}

/** Whether the pool's money went out on this loan, settled or not. */
export function wasFunded(loan: Loan): boolean {
  return isLive(loan) || loan.status === LoanStatus.REPAID
}
