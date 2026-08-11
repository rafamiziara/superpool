import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { mockLocalSearchParams, mockRouterDismissTo } from '../../../src/__tests__/setup'
import { poolStore } from '../../../src/stores/PoolStore'
import BorrowScreen from './borrow'

const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

/** Pool 1 exists in the mock data the store loads. */
const POOL_ID = '1'

const mockBorrow = jest.fn()
const mockRepay = jest.fn()
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
    borrow: mockBorrow,
    repay: mockRepay,
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

/** An outstanding loan for pool 1, in the shape `listLoans` returns. */
function outstandingLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: '31337-1-3',
    loanId: 3,
    poolId: 1,
    poolAddress: poolStore.poolById(1)!.poolAddress,
    borrower: poolStore.userAddress,
    amount: '4000000000000000000',
    interestRate: 500,
    duration: 2_592_000,
    startedAt: '2026-08-01T00:00:00.000Z',
    isRepaid: false,
    chainId: 31337,
    transactionHash: '0xaaa',
    blockNumber: 100,
    ...overrides,
  }
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockLoanError = null
  mockLocalSearchParams.mockReturnValue({ poolId: POOL_ID })
  mockBorrow.mockResolvedValue(TX_HASH)
  mockRepay.mockResolvedValue(TX_HASH)
  mockWaitForTransaction.mockResolvedValue({ loanId: 3, amount: '5000000000000000000' })
  mockTriggerIndexing.mockResolvedValue(undefined)
  await poolStore.fetchPools()
  poolStore.loanRecords = []
})

afterEach(() => {
  poolStore.loanRecords = []
})

describe('BorrowScreen', () => {
  describe('borrowing', () => {
    it('shows the borrow form when nothing is outstanding', () => {
      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      expect(getByTestId('borrow-form')).toBeTruthy()
      expect(queryByTestId('repay-panel')).toBeNull()
    })

    it('sends the amount and reports success', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      await waitFor(() => expect(getByTestId('borrow-success')).toBeTruthy())
      expect(mockBorrow).toHaveBeenCalledWith(expect.objectContaining({ poolId: 1, amount: 5_000_000_000_000_000_000n }))
    })

    it('indexes the transaction so the loan appears without waiting for a sweep', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      await waitFor(() => expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'BORROW'))
    })

    it('returns to the form when the wallet refuses', async () => {
      mockBorrow.mockRejectedValue(new Error('Contribute to this pool before borrowing from it'))
      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      expect(queryByTestId('borrow-success')).toBeNull()
      expect(getByTestId('borrow-error')).toBeTruthy()
    })

    it('does not index a transaction it could not confirm', async () => {
      // The record in PendingTransactionsStore survives, so recovery finishes it.
      mockWaitForTransaction.mockRejectedValue(new Error('Timed out'))
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      expect(mockTriggerIndexing).not.toHaveBeenCalled()
      expect(getByTestId('borrow-error')).toBeTruthy()
    })

    it('pops back to the pool rather than stacking a second one', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })
      await waitFor(() => expect(getByTestId('borrow-view-pool')).toBeTruthy())

      fireEvent.press(getByTestId('borrow-view-pool'))

      expect(mockRouterDismissTo).toHaveBeenCalledWith('/(auth)/pool/1')
    })
  })

  describe('repaying', () => {
    beforeEach(() => {
      poolStore.loanRecords = [outstandingLoan()]
    })

    it('offers repayment instead of borrowing when a loan is open', () => {
      // The contract allows one open loan per member per pool, so there is
      // nothing to choose between.
      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      expect(getByTestId('repay-panel')).toBeTruthy()
      expect(queryByTestId('borrow-form')).toBeNull()
    })

    it('sends the principal plus fixed interest', async () => {
      // 4 POL at 500 bps = 4.2 POL, and `repayLoan` reverts on anything less.
      const { getByTestId } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('repay-submit'))
      })

      expect(mockRepay).toHaveBeenCalledWith(expect.objectContaining({ loanId: 3, amount: 4_200_000_000_000_000_000n }))
    })

    it('indexes the repayment through the same callable as a borrow', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('repay-submit'))
      })

      await waitFor(() => expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'REPAY'))
    })

    it('says the loan was repaid rather than disbursed', async () => {
      const { getByTestId, getByText } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('repay-submit'))
      })

      await waitFor(() => expect(getByTestId('borrow-success')).toBeTruthy())
      expect(getByText('Loan repaid')).toBeTruthy()
    })

    it('surfaces a failed repayment without leaving the panel', async () => {
      mockRepay.mockRejectedValue(new Error('That is less than the full amount due'))
      const { getByTestId } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('repay-submit'))
      })

      expect(getByTestId('repay-error')).toBeTruthy()
    })

    it('ignores a loan that has already been settled', async () => {
      poolStore.loanRecords = [outstandingLoan({ isRepaid: true })]

      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      expect(getByTestId('borrow-form')).toBeTruthy()
      expect(queryByTestId('repay-panel')).toBeNull()
    })

    it('ignores another wallet’s loan in the same pool', async () => {
      poolStore.loanRecords = [outstandingLoan({ borrower: '0x0000000000000000000000000000000000000042' })]

      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      expect(getByTestId('borrow-form')).toBeTruthy()
      expect(queryByTestId('repay-panel')).toBeNull()
    })
  })

  it('says so when the pool is not available', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })

    const { getByTestId } = render(<BorrowScreen />)

    expect(getByTestId('borrow-pool-not-found')).toBeTruthy()
  })
})
