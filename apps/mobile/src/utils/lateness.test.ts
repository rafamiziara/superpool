import { type Loan, type LoanInfo, LoanStatus } from '@superpool/types'
import { DUE_SOON_WINDOW_MS, isLive, latenessOf, latenessOfRecord, wasFunded } from './lateness'

const NOW = new Date('2026-08-18T12:00:00.000Z').getTime()
const DAY = 24 * 60 * 60 * 1000
const TERM_SECONDS = 30 * 24 * 60 * 60

/** A mapped loan, due `dueInMs` from `NOW` — negative for one already past. */
function loan(overrides: Partial<Loan> = {}, dueInMs = 10 * DAY): Loan {
  return {
    id: '31337-1-1',
    poolId: '1',
    borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: 5_000_000_000_000_000_000n,
    interestRate: 500,
    duration: TERM_SECONDS,
    status: LoanStatus.DISBURSED,
    amountRepaid: 0n,
    interestAccrued: 0n,
    requestedAt: new Date(NOW - DAY),
    dueDate: new Date(NOW + dueInMs),
    ...overrides,
  } as Loan
}

/** An indexed record whose term ends `dueInMs` from `NOW`. */
function record(overrides: Partial<LoanInfo> = {}, dueInMs = 10 * DAY): LoanInfo {
  return {
    id: '31337-1-1',
    loanId: 1,
    poolId: 1,
    poolAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '5000000000000000000',
    interestRate: 500,
    duration: TERM_SECONDS,
    startedAt: new Date(NOW + dueInMs - TERM_SECONDS * 1000).toISOString(),
    isRepaid: false,
    amountRepaid: '0',
    principalOutstanding: '5000000000000000000',
    interestOutstanding: '0',
    status: 'disbursed',
    chainId: 31337,
    transactionHash: `0x${'a'.repeat(64)}`,
    blockNumber: 120,
    ...overrides,
  }
}

describe('latenessOf', () => {
  it('says nothing about a loan with time left', () => {
    expect(latenessOf(loan(), NOW)).toBe('running')
  })

  it('warns inside the last day', () => {
    expect(latenessOf(loan({}, DUE_SOON_WINDOW_MS - 1000), NOW)).toBe('due-soon')
  })

  it('treats the window boundary as due soon', () => {
    expect(latenessOf(loan({}, DUE_SOON_WINDOW_MS), NOW)).toBe('due-soon')
  })

  it('is not late at the exact due moment', () => {
    // The contract refuses to declare a loan at the instant it comes due, and
    // the badge must not contradict it.
    expect(latenessOf(loan({}, 0), NOW)).toBe('due-soon')
  })

  it('is overdue a moment after', () => {
    expect(latenessOf(loan({}, -1000), NOW)).toBe('overdue')
  })

  it('reports a declaration in preference to the arithmetic', () => {
    // Both are true of a declared loan — the contract cannot declare one inside
    // its term — and the declaration is the stronger fact.
    expect(latenessOf(loan({ status: LoanStatus.DEFAULTED }, -5 * DAY), NOW)).toBe('defaulted')
  })

  it.each([LoanStatus.REPAID, LoanStatus.REQUESTED, LoanStatus.REJECTED])('says nothing about a %s loan', (status) => {
    expect(latenessOf(loan({ status }, -100 * DAY), NOW)).toBe('none')
  })

  it('does not accuse a loan on the strength of a missing date', () => {
    // A live loan the record could not date reads as running. Calling it
    // overdue would be an accusation made from a gap.
    expect(latenessOf(loan({ dueDate: undefined }), NOW)).toBe('running')
  })

  it('reads the clock itself when no moment is given', () => {
    expect(latenessOf(loan({}, -DAY))).toBe('overdue')
  })
})

describe('latenessOfRecord', () => {
  it('agrees with the mapped form about a loan with time left', () => {
    expect(latenessOfRecord(record(), NOW)).toBe('running')
  })

  it('derives the due date from the term rather than expecting one', () => {
    // Nothing on chain records a due date; it is `startedAt + duration`.
    expect(latenessOfRecord(record({}, -DAY), NOW)).toBe('overdue')
  })

  it('reports a declared loan as such', () => {
    expect(latenessOfRecord(record({ status: 'defaulted' }, -DAY), NOW)).toBe('defaulted')
  })

  it('says nothing about a debt that was settled', () => {
    // Including one settled after it was declared: the loan is closed, and a
    // closed loan has no due date to be late for.
    expect(latenessOfRecord(record({ status: 'defaulted', isRepaid: true }, -DAY), NOW)).toBe('none')
  })

  it('says nothing about a request nobody funded, however old', () => {
    expect(latenessOfRecord(record({ status: 'requested' }, -100 * DAY), NOW)).toBe('none')
  })
})

describe('isLive', () => {
  it('counts a declared loan as still owed', () => {
    // The single answer to "is this debt open", so `defaulted` cannot be
    // forgotten at one call site and remembered at another.
    expect(isLive(loan({ status: LoanStatus.DEFAULTED }))).toBe(true)
  })

  it('counts a disbursed loan as still owed', () => {
    expect(isLive(loan())).toBe(true)
  })

  it.each([LoanStatus.REPAID, LoanStatus.REQUESTED, LoanStatus.REJECTED])('does not count a %s loan', (status) => {
    expect(isLive(loan({ status }))).toBe(false)
  })
})

describe('wasFunded', () => {
  it.each([LoanStatus.DISBURSED, LoanStatus.DEFAULTED, LoanStatus.REPAID])('counts a %s loan as money that went out', (status) => {
    expect(wasFunded(loan({ status }))).toBe(true)
  })

  it.each([LoanStatus.REQUESTED, LoanStatus.REJECTED])('does not count a %s loan', (status) => {
    expect(wasFunded(loan({ status }))).toBe(false)
  })
})
