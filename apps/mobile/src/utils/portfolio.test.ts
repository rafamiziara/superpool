import type { LoanDecisionInfo, LoanInfo } from '@superpool/types'
import { decisionSummary, loanPortfolio } from './portfolio'

const NOW = new Date('2026-08-19T12:00:00.000Z').getTime()
const DAY = 24 * 60 * 60 * 1000

function makeLoan(overrides: Partial<LoanInfo> = {}): LoanInfo {
  return {
    id: '31337-1-1',
    loanId: 1,
    poolId: 1,
    poolAddress: '0x3b9Fab925D36946000F2636a49808cD5CF56F290',
    borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '1000000000000000000',
    interestRate: 500,
    // 30 days, so a loan started 10 days ago is comfortably inside its term.
    duration: 2_592_000,
    startedAt: new Date(NOW - 10 * DAY).toISOString(),
    isRepaid: false,
    amountRepaid: '0',
    principalOutstanding: '1000000000000000000',
    interestOutstanding: '0',
    status: 'disbursed',
    chainId: 31337,
    transactionHash: '0xaaa',
    blockNumber: 100,
    ...overrides,
  }
}

function makeDecision(overrides: Partial<LoanDecisionInfo> = {}): LoanDecisionInfo {
  return {
    id: '31337-0xaaa-0',
    loanId: 1,
    poolId: 1,
    poolAddress: '0x3b9Fab925D36946000F2636a49808cD5CF56F290',
    borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '1000000000000000000',
    outcome: 'approved',
    decidedBy: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    chainId: 31337,
    transactionHash: '0xaaa',
    logIndex: 0,
    blockNumber: 100,
    decidedAt: new Date(NOW - DAY).toISOString(),
    ...overrides,
  }
}

describe('loanPortfolio', () => {
  it('counts nothing for a pool that has lent nothing', () => {
    // Act
    const portfolio = loanPortfolio([], NOW)

    // Assert
    expect(portfolio).toEqual({
      pending: 0,
      active: 0,
      overdue: 0,
      defaulted: 0,
      settled: 0,
      recovered: 0,
      lentToDate: 0n,
      repaidToDate: 0n,
    })
  })

  it('separates a request from a loan', () => {
    // Arrange — nothing has moved on a request, so it owes nothing and was
    // never lent.
    const loans = [makeLoan({ status: 'requested', amount: '5000000000000000000' }), makeLoan({ id: '31337-1-2', loanId: 2 })]

    // Act
    const portfolio = loanPortfolio(loans, NOW)

    // Assert
    expect(portfolio.pending).toBe(1)
    expect(portfolio.active).toBe(1)
    expect(portfolio.lentToDate).toBe(1000000000000000000n)
  })

  it('leaves a refusal out of every count that involves money', () => {
    // Arrange — a rejected request is a record of something that did not
    // happen. It is counted in the decisions instead.
    const loans = [makeLoan({ status: 'rejected', amount: '5000000000000000000' })]

    // Act
    const portfolio = loanPortfolio(loans, NOW)

    // Assert
    expect(portfolio.lentToDate).toBe(0n)
    expect(portfolio).toMatchObject({ pending: 0, active: 0, settled: 0 })
  })

  it('tells a running loan from one past its term', () => {
    // Arrange
    const loans = [
      makeLoan({ id: '31337-1-1', loanId: 1 }),
      makeLoan({ id: '31337-1-2', loanId: 2, startedAt: new Date(NOW - 60 * DAY).toISOString() }),
    ]

    // Act
    const portfolio = loanPortfolio(loans, NOW)

    // Assert
    expect(portfolio).toMatchObject({ active: 1, overdue: 1, defaulted: 0 })
  })

  it('counts a declared default as declared, not merely as late', () => {
    // Arrange — overdue is arithmetic anyone can do; a default is the owner
    // saying so, and the screen must not report one as the other.
    const loans = [makeLoan({ status: 'defaulted', startedAt: new Date(NOW - 60 * DAY).toISOString() })]

    // Act
    const portfolio = loanPortfolio(loans, NOW)

    // Assert
    expect(portfolio).toMatchObject({ defaulted: 1, overdue: 0, active: 0 })
  })

  it('counts a loan repaid after a default as recovered, and as settled', () => {
    // Arrange — the pair `defaulted` + `isRepaid` is what recovered means.
    // The money came back, so it belongs in `settled` too; what it is not is
    // a loan that was never late.
    const loans = [
      makeLoan({
        status: 'defaulted',
        isRepaid: true,
        amountRepaid: '1050000000000000000',
        principalOutstanding: '0',
        startedAt: new Date(NOW - 60 * DAY).toISOString(),
      }),
    ]

    // Act
    const portfolio = loanPortfolio(loans, NOW)

    // Assert
    expect(portfolio).toMatchObject({ recovered: 1, settled: 1, defaulted: 0 })
  })

  it('sums what was lent and what came back, as bigints', () => {
    // Arrange — two loans, one paid down in part. Wei figures pass
    // MAX_SAFE_INTEGER, so a numeric sum would drift.
    const loans = [
      makeLoan({ id: '31337-1-1', loanId: 1, amount: '1000000000000000001', amountRepaid: '400000000000000000' }),
      makeLoan({ id: '31337-1-2', loanId: 2, amount: '2000000000000000002', amountRepaid: '0' }),
    ]

    // Act
    const portfolio = loanPortfolio(loans, NOW)

    // Assert
    expect(portfolio.lentToDate).toBe(3000000000000000003n)
    expect(portfolio.repaidToDate).toBe(400000000000000000n)
  })

  it('counts instalments towards what came back before the loan closes', () => {
    // Arrange — a loan can be paid down in parts, so "repaid to date" cannot
    // wait for settlement.
    const loans = [makeLoan({ amountRepaid: '250000000000000000' })]

    // Act
    const portfolio = loanPortfolio(loans, NOW)

    // Assert
    expect(portfolio.repaidToDate).toBe(250000000000000000n)
    expect(portfolio.settled).toBe(0)
  })
})

describe('decisionSummary', () => {
  it('counts nothing for a pool that decides nothing', () => {
    // Arrange — a pool that lends on demand never produces a decision, and
    // that is an answer rather than a gap.
    // Act
    const summary = decisionSummary([])

    // Assert
    expect(summary).toEqual({ approved: 0, declined: 0, withdrawn: 0, declaredInDefault: 0, answered: 0 })
  })

  it('keeps a refusal and a withdrawal apart', () => {
    // Arrange — the same event on chain, told apart by who sent it. Counting
    // them together would credit an owner with declining a request nobody
    // ever put to them.
    const decisions = [
      makeDecision({ id: 'a', outcome: 'rejected' }),
      makeDecision({ id: 'b', outcome: 'cancelled' }),
      makeDecision({ id: 'c', outcome: 'cancelled' }),
    ]

    // Act
    const summary = decisionSummary(decisions)

    // Assert
    expect(summary).toMatchObject({ declined: 1, withdrawn: 2 })
  })

  it('leaves withdrawals out of what the owner answered', () => {
    // Arrange
    const decisions = [
      makeDecision({ id: 'a', outcome: 'approved' }),
      makeDecision({ id: 'b', outcome: 'rejected' }),
      makeDecision({ id: 'c', outcome: 'defaulted' }),
      makeDecision({ id: 'd', outcome: 'cancelled' }),
    ]

    // Act
    const summary = decisionSummary(decisions)

    // Assert
    expect(summary.answered).toBe(3)
  })

  it('counts a declaration of default as a decision', () => {
    // Arrange — it is a judgement the owner made and can be asked about,
    // which is exactly what this collection records.
    // Act
    const summary = decisionSummary([makeDecision({ outcome: 'defaulted' })])

    // Assert
    expect(summary).toMatchObject({ declaredInDefault: 1, answered: 1 })
  })
})
