import type { LoanInfo } from '@superpool/types'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { mockWagmiUseReadContract } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams } from '../../../src/__tests__/setup'
import { MOCK_USER_ADDRESS } from '../../../src/mocks/lending'
import { authStore } from '../../../src/stores/AuthStore'
import { poolStore } from '../../../src/stores/PoolStore'
import OverdueLoansScreen from './overdue'

const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

/** Pool 2 in the mock data is the one the mock user owns. */
const POOL_ID = '2'
/** Pool 1 belongs to someone else — the subject for the not-owner path. */
const POOL_I_DO_NOT_OWN = '1'
const STRANGER = '0x0000000000000000000000000000000000000042'

const DAY = 24 * 60 * 60 * 1000
const TERM_SECONDS = 30 * 24 * 60 * 60

const mockMarkDefaulted = jest.fn()
const mockWaitForTransaction = jest.fn()
const mockTriggerIndexing = jest.fn()
const mockReset = jest.fn()
let mockLoanError: string | null = null

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

jest.mock('../../../src/hooks/pools/useLoan', () => ({
  ...jest.requireActual('../../../src/hooks/pools/useLoan'),
  useLoan: () => ({
    markDefaulted: mockMarkDefaulted,
    isSubmitting: false,
    error: mockLoanError,
    reset: mockReset,
  }),
}))

jest.mock('../../../src/hooks/pools/useTransactionMonitoring', () => ({
  useTransactionMonitoring: () => ({ waitForTransaction: mockWaitForTransaction, isWaiting: false, error: null }),
}))

jest.mock('../../../src/hooks/pools/usePoolIndexing', () => ({
  usePoolIndexing: () => ({ triggerIndexing: mockTriggerIndexing, indexConfirmed: jest.fn(), isIndexing: false }),
}))

/** A loan in pool 2 whose term ended `overdueBy` ago. */
function lateLoan(overrides: Partial<LoanInfo> = {}, overdueBy = 5 * DAY): LoanInfo {
  return {
    id: '31337-2-5',
    loanId: 5,
    poolId: 2,
    poolAddress: poolStore.poolById(2)!.poolAddress,
    borrower: STRANGER,
    amount: '4000000000000000000',
    interestRate: 500,
    duration: TERM_SECONDS,
    startedAt: new Date(Date.now() - overdueBy - TERM_SECONDS * 1000).toISOString(),
    isRepaid: false,
    amountRepaid: '0',
    principalOutstanding: '4000000000000000000',
    interestOutstanding: '0',
    status: 'disbursed',
    chainId: 31337,
    transactionHash: '0xaaa',
    blockNumber: 100,
    ...overrides,
  }
}

/** Load loans the way the live app does — see the note in `approvals.test.tsx`. */
function withIndexedLoans(records: LoanInfo[]) {
  delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS
  authStore.walletAddress = MOCK_USER_ADDRESS
  poolStore.loanRecords = records
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockLoanError = null
  mockLocalSearchParams.mockReturnValue({ poolId: POOL_ID })
  mockMarkDefaulted.mockResolvedValue(TX_HASH)
  mockWaitForTransaction.mockResolvedValue({ loanId: 5 })
  mockTriggerIndexing.mockResolvedValue(undefined)
  // The grace period and the outstanding balance both come through here.
  mockWagmiUseReadContract.mockReturnValue({ data: 0n, refetch: jest.fn() })
  authStore.walletAddress = null
  await poolStore.fetchPools()
  poolStore.loanRecords = []
})

afterEach(() => {
  process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
  authStore.walletAddress = null
  poolStore.loanRecords = []
})

describe('OverdueLoansScreen', () => {
  it('says nothing is late when nothing is', async () => {
    withIndexedLoans([])

    const { getByTestId } = render(<OverdueLoansScreen />)

    expect(getByTestId('overdue-empty')).toBeTruthy()
  })

  it('lists a loan past its due date', async () => {
    withIndexedLoans([lateLoan()])

    const { getByTestId } = render(<OverdueLoansScreen />)

    expect(getByTestId('overdue-card-5')).toBeTruthy()
  })

  it('leaves out a loan still inside its term', async () => {
    withIndexedLoans([lateLoan({}, -10 * DAY)])

    const { queryByTestId, getByTestId } = render(<OverdueLoansScreen />)

    expect(queryByTestId('overdue-card-5')).toBeNull()
    expect(getByTestId('overdue-empty')).toBeTruthy()
  })

  it('separates being late from being in default, in as many words', async () => {
    // The whole risk of the screen is the two being read as one. Most loans
    // here should never be declared.
    withIndexedLoans([lateLoan()])

    const { getByText } = render(<OverdueLoansScreen />)

    expect(getByText(/Being late is not the same as defaulting/)).toBeTruthy()
  })

  it('shows only the owner', async () => {
    // `markDefaulted` is `onlyOwner`, so anyone else would be offered a
    // transaction that reverts.
    mockLocalSearchParams.mockReturnValue({ poolId: POOL_I_DO_NOT_OWN })
    withIndexedLoans([lateLoan({ poolId: 1, poolAddress: poolStore.poolById(1)!.poolAddress })])

    const { getByTestId } = render(<OverdueLoansScreen />)

    expect(getByTestId('overdue-not-owner')).toBeTruthy()
  })

  it('declares a default and indexes it', async () => {
    withIndexedLoans([lateLoan()])

    const { getByTestId } = render(<OverdueLoansScreen />)

    // Two taps: the action, then the confirmation.
    fireEvent.press(getByTestId('overdue-ask-5'))
    fireEvent.press(getByTestId('overdue-declare-5'))

    await waitFor(() => expect(mockMarkDefaulted).toHaveBeenCalledWith(expect.objectContaining({ loanId: 5, borrower: STRANGER })))
    await waitFor(() => expect(mockWaitForTransaction).toHaveBeenCalledWith(TX_HASH, 'MARK_DEFAULTED'))
    await waitFor(() => expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'MARK_DEFAULTED'))
  })

  it('does not send anything on the first tap', async () => {
    withIndexedLoans([lateLoan()])

    const { getByTestId } = render(<OverdueLoansScreen />)

    fireEvent.press(getByTestId('overdue-ask-5'))

    expect(mockMarkDefaulted).not.toHaveBeenCalled()
  })

  it('reports a wallet rejection without leaving the screen busy', async () => {
    mockMarkDefaulted.mockRejectedValue(new Error('User rejected the request'))
    withIndexedLoans([lateLoan()])

    const { getByTestId } = render(<OverdueLoansScreen />)

    fireEvent.press(getByTestId('overdue-ask-5'))
    fireEvent.press(getByTestId('overdue-declare-5'))

    await waitFor(() => expect(getByTestId('overdue-error')).toHaveTextContent('User rejected the request'))
    expect(mockWaitForTransaction).not.toHaveBeenCalled()
  })

  it('leaves the record alone when the confirmation never lands', async () => {
    // On chain, outcome unresolved. The pending record survives, so startup
    // recovery finishes it and the sweep indexes it either way.
    mockWaitForTransaction.mockRejectedValue(new Error('Timed out'))
    withIndexedLoans([lateLoan()])

    const { getByTestId } = render(<OverdueLoansScreen />)

    fireEvent.press(getByTestId('overdue-ask-5'))
    fireEvent.press(getByTestId('overdue-declare-5'))

    await waitFor(() => expect(getByTestId('overdue-error')).toHaveTextContent('Timed out'))
    expect(mockTriggerIndexing).not.toHaveBeenCalled()
  })

  it('quotes the grace period the owner set', async () => {
    mockWagmiUseReadContract.mockReturnValue({ data: BigInt(7 * 24 * 60 * 60), refetch: jest.fn() })
    withIndexedLoans([lateLoan()])

    const { getByTestId } = render(<OverdueLoansScreen />)

    expect(getByTestId('overdue-grace-period')).toHaveTextContent(/7 days/)
  })

  it('says nothing about a grace period nobody set', async () => {
    // Zero is the default, and "you said you would wait 0 seconds" is noise.
    withIndexedLoans([lateLoan()])

    const { queryByTestId } = render(<OverdueLoansScreen />)

    expect(queryByTestId('overdue-grace-period')).toBeNull()
  })
})
