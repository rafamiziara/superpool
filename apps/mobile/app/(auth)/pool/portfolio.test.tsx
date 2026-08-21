import type { LoanDecisionInfo, LoanInfo } from '@superpool/types'
import { render } from '@testing-library/react-native'
import React from 'react'
import { mockWagmiUseReadContract } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams } from '../../../src/__tests__/setup'
import { authStore } from '../../../src/stores/AuthStore'
import { poolStore } from '../../../src/stores/PoolStore'
import PortfolioScreen from './portfolio'

/** Pool 2 in the mock data is the one the mock user owns. */
const POOL_ID = '2'
const POOL_I_DO_NOT_OWN = '1'
const BORROWER = '0x0000000000000000000000000000000000000042'
const OWNER = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'

const DAY = 24 * 60 * 60 * 1000

let mockDecisions: LoanDecisionInfo[] = []
let mockLoadingDecisions = false

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('../../../src/hooks/pools/useLoanDecisions', () => ({
  useLoanDecisions: () => ({ decisions: mockDecisions, isLoading: mockLoadingDecisions, refresh: jest.fn() }),
}))

function makeLoan(overrides: Partial<LoanInfo> = {}): LoanInfo {
  return {
    id: '31337-2-1',
    loanId: 1,
    poolId: 2,
    poolAddress: poolStore.poolById(2)!.poolAddress,
    borrower: BORROWER,
    amount: '1000000000000000000',
    interestRate: 500,
    duration: 2_592_000,
    startedAt: new Date(Date.now() - 10 * DAY).toISOString(),
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
    poolId: 2,
    poolAddress: poolStore.poolById(2)!.poolAddress,
    borrower: BORROWER,
    amount: '1000000000000000000',
    outcome: 'approved',
    decidedBy: OWNER,
    chainId: 31337,
    transactionHash: '0xaaa',
    logIndex: 0,
    blockNumber: 100,
    decidedAt: new Date(Date.now() - DAY).toISOString(),
    ...overrides,
  }
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockDecisions = []
  mockLoadingDecisions = false
  mockLocalSearchParams.mockReturnValue({ poolId: POOL_ID })
  mockWagmiUseReadContract.mockReturnValue({ data: 4_000_000_000_000_000_000n, refetch: jest.fn() })
  authStore.walletAddress = null
  await poolStore.fetchPools()
  poolStore.loanRecords = []
})

afterEach(() => {
  process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
  poolStore.loanRecords = []
  authStore.walletAddress = null
})

describe('PortfolioScreen', () => {
  it('says so when the pool is not available', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })
    poolStore.isLoading = false

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-pool-not-found')).toBeTruthy()
  })

  it('reads as loading, not as missing, while the pools are still arriving', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })
    poolStore.isLoading = true

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-loading')).toBeTruthy()

    poolStore.isLoading = false
  })

  it('turns away anyone who is not the pool owner', () => {
    // Nothing here is secret — every figure comes from public logs — but this
    // is a management view, and a member wants their own position instead.
    mockLocalSearchParams.mockReturnValue({ poolId: POOL_I_DO_NOT_OWN })

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-not-owner')).toBeTruthy()
  })

  it('reports what is out on loan and what is still in the pool', () => {
    poolStore.loanRecords = [makeLoan()]

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-outstanding')).toHaveTextContent(/1 POL/)
    expect(getByTestId('portfolio-available')).toHaveTextContent(/4 POL/)
    // One out of five is working.
    expect(getByTestId('portfolio-utilisation')).toHaveTextContent(/20%/)
  })

  it('counts a late loan as overdue and a declared one as in default', () => {
    // Overdue is arithmetic anyone can do; a default is the owner saying so.
    // A screen that reported one as the other would accuse a borrower of
    // something nobody decided.
    poolStore.loanRecords = [
      makeLoan({ id: '31337-2-1', loanId: 1 }),
      makeLoan({ id: '31337-2-2', loanId: 2, startedAt: new Date(Date.now() - 60 * DAY).toISOString() }),
      makeLoan({ id: '31337-2-3', loanId: 3, status: 'defaulted', startedAt: new Date(Date.now() - 60 * DAY).toISOString() }),
    ]

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-active')).toHaveTextContent(/Running1/)
    expect(getByTestId('portfolio-overdue')).toHaveTextContent(/Overdue1/)
    expect(getByTestId('portfolio-defaulted')).toHaveTextContent(/In default1/)
  })

  it('says when a defaulted loan was paid back after all', () => {
    poolStore.loanRecords = [
      makeLoan({
        status: 'defaulted',
        isRepaid: true,
        amountRepaid: '1050000000000000000',
        principalOutstanding: '0',
        startedAt: new Date(Date.now() - 60 * DAY).toISOString(),
      }),
    ]

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-recovered')).toBeTruthy()
    expect(getByTestId('portfolio-settled')).toHaveTextContent(/Settled1/)
  })

  it('counts what was lent, never what was asked for', () => {
    // A request and a refusal moved no money; counting either as lending
    // would report a pool as having paid out what it turned down.
    poolStore.loanRecords = [
      makeLoan({ id: '31337-2-1', loanId: 1, amount: '1000000000000000000' }),
      makeLoan({ id: '31337-2-2', loanId: 2, status: 'requested', amount: '9000000000000000000' }),
      makeLoan({ id: '31337-2-3', loanId: 3, status: 'rejected', amount: '5000000000000000000' }),
    ]

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-lent-to-date')).toHaveTextContent(/^1 POL lent/)
  })

  it('says nothing has been decided when nothing has', () => {
    // The ordinary case for a pool that lends on demand, and an answer rather
    // than a gap.
    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-decisions-empty')).toBeTruthy()
  })

  it('counts approvals and refusals, and keeps withdrawals out of both', () => {
    mockDecisions = [
      makeDecision({ id: 'a', loanId: 1, outcome: 'approved' }),
      makeDecision({ id: 'b', loanId: 2, outcome: 'rejected' }),
      makeDecision({ id: 'c', loanId: 3, outcome: 'cancelled' }),
    ]

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-approved')).toHaveTextContent(/Approved1/)
    expect(getByTestId('portfolio-declined')).toHaveTextContent(/Declined1/)
    expect(getByTestId('portfolio-withdrawn')).toBeTruthy()
  })

  it('names a withdrawal as the borrower’s, not as a refusal', () => {
    // The same event on chain, told apart by who sent the transaction.
    mockDecisions = [makeDecision({ outcome: 'cancelled' })]

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-decision-1-cancelled')).toHaveTextContent(/Withdrawn by borrower/)
  })

  it('lists a loan’s approval and its later default as two entries', () => {
    // The loan record can only say what the loan is now. Both decisions were
    // real, and the approval is the one that would otherwise disappear.
    mockDecisions = [
      makeDecision({ id: 'b', loanId: 1, outcome: 'defaulted', decidedAt: new Date(Date.now() - DAY).toISOString() }),
      makeDecision({ id: 'a', loanId: 1, outcome: 'approved', decidedAt: new Date(Date.now() - 30 * DAY).toISOString() }),
    ]

    const { getByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-decision-1-approved')).toBeTruthy()
    expect(getByTestId('portfolio-decision-1-defaulted')).toBeTruthy()
  })

  it('stops the history at ten and says how many there were', () => {
    mockDecisions = Array.from({ length: 12 }, (_, index) => makeDecision({ id: `d${index}`, loanId: index + 1 }))

    const { getByTestId, queryByTestId } = render(<PortfolioScreen />)

    expect(getByTestId('portfolio-decision-10-approved')).toBeTruthy()
    expect(queryByTestId('portfolio-decision-11-approved')).toBeNull()
    expect(getByTestId('portfolio-history-truncated')).toBeTruthy()
  })
})
