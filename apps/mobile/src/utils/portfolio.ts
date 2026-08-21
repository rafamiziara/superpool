import type { LoanDecisionInfo, LoanInfo } from '@superpool/types'
import { latenessOfRecord } from './lateness'

/**
 * What a pool has done with its money, counted from the indexed loans.
 *
 * For the owner's portfolio screen. Derived on read rather than stored, like
 * every other total in this app: a figure written down is one that can
 * disagree with the chain.
 *
 * Counts are of loans, sums are in the pool's own unit. **Never mix pools
 * here** — a pool lends one asset, and adding a USDC figure to a POL one is
 * wrong by whatever the rate happens to be.
 */
export interface LoanPortfolio {
  /** Requests nobody has decided yet. Nothing has moved on these. */
  pending: number
  /** Funded, unsettled, still inside its term. */
  active: number
  /** Funded, unsettled, past its term, and nobody has declared it. */
  overdue: number
  /** Declared in default by the owner and still owed. */
  defaulted: number
  /** Paid off in full. */
  settled: number
  /**
   * Declared in default and paid off afterwards.
   *
   * Counted separately because the pair `defaulted` + `isRepaid` is what
   * "recovered" means, and it is a different fact from never having been late.
   * These are also counted in `settled`: the money did come back.
   */
  recovered: number
  /**
   * Principal the pool actually paid out, over its whole history.
   *
   * Requests and refusals are excluded — nothing moved — so this is what was
   * lent rather than what was asked for.
   */
  lentToDate: bigint
  /** What borrowers have paid back against it, principal and interest together. */
  repaidToDate: bigint
}

/** Whether the pool's money went out on this record, settled or not. */
function wasFunded(loan: LoanInfo): boolean {
  return loan.status === 'disbursed' || loan.status === 'defaulted'
}

/**
 * Summarise one pool's loans.
 *
 * `now` is a parameter rather than read here so a render can pass a single
 * timestamp for the whole screen, and so a test can state the moment. It is
 * the **device clock**, which is right for counting what looks late and wrong
 * for anything about to send money — those figures are read from the chain.
 */
export function loanPortfolio(loans: LoanInfo[], now: number = Date.now()): LoanPortfolio {
  const portfolio: LoanPortfolio = {
    pending: 0,
    active: 0,
    overdue: 0,
    defaulted: 0,
    settled: 0,
    recovered: 0,
    lentToDate: 0n,
    repaidToDate: 0n,
  }

  for (const loan of loans) {
    if (loan.status === 'requested') {
      portfolio.pending++
      continue
    }

    // A refusal leaves a record and moves no money, so it belongs in none of
    // the counts below. It is counted where it happened: in the decisions.
    if (!wasFunded(loan)) continue

    portfolio.lentToDate += BigInt(loan.amount)
    portfolio.repaidToDate += BigInt(loan.amountRepaid)

    if (loan.isRepaid) {
      portfolio.settled++
      if (loan.status === 'defaulted') portfolio.recovered++
      continue
    }

    // One definition of late for the whole app, so a screen cannot disagree
    // with a badge about which loans are overdue.
    const lateness = latenessOfRecord(loan, now)

    if (lateness === 'defaulted') portfolio.defaulted++
    else if (lateness === 'overdue') portfolio.overdue++
    else portfolio.active++
  }

  return portfolio
}

/**
 * What was decided, counted by outcome.
 *
 * Named for what a pool owner would call them rather than for the wire values:
 * a refusal and a request its borrower withdrew are the same event on chain
 * and separate outcomes here, and collapsing them would credit an owner with
 * declining requests nobody ever put to them.
 */
export interface DecisionSummary {
  approved: number
  declined: number
  withdrawn: number
  declaredInDefault: number
  /**
   * Decisions the owner actually made: everything except withdrawals.
   *
   * The denominator for "how many of these were approvals", which is the one
   * ratio the screen shows and the only one that is honestly about the owner.
   */
  answered: number
}

export function decisionSummary(decisions: LoanDecisionInfo[]): DecisionSummary {
  const summary: DecisionSummary = { approved: 0, declined: 0, withdrawn: 0, declaredInDefault: 0, answered: 0 }

  for (const decision of decisions) {
    switch (decision.outcome) {
      case 'approved':
        summary.approved++
        break
      case 'rejected':
        summary.declined++
        break
      case 'cancelled':
        summary.withdrawn++
        break
      case 'defaulted':
        summary.declaredInDefault++
        break
    }
  }

  summary.answered = summary.approved + summary.declined + summary.declaredInDefault

  return summary
}
