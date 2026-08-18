import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { mockWagmiUseReadContract } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams, mockRouterDismissTo } from '../../../src/__tests__/setup'
import { poolStore } from '../../../src/stores/PoolStore'
import BorrowScreen from './borrow'

const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

/** Pool 1 exists in the mock data the store loads. */
const POOL_ID = '1'

const mockBorrow = jest.fn()
const mockRequestLoan = jest.fn()
const mockRepay = jest.fn()
const mockCancelLoanRequest = jest.fn()
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
    requestLoan: mockRequestLoan,
    repay: mockRepay,
    cancelLoanRequest: mockCancelLoanRequest,
    isSubmitting: false,
    error: mockLoanError,
    reset: mockReset,
  }),
}))

/**
 * Answers the screen's three chain reads.
 *
 * `poolConfig` is a five-member tuple and `requiresApproval` is the last of
 * them; the screen reads it positionally, so the fixture has to be the same
 * shape the ABI decodes to rather than an object.
 *
 * `loanBalance` returns the debt split in two, and the screen waits for it
 * rather than pricing the loan from the indexed record — interest accrues per
 * second, and only the chain knows what has accrued.
 */
function mockChainReads({
  requiresApproval = false,
  available = 100_000_000_000_000_000_000n,
  principal = 4_000_000_000_000_000_000n,
  interest = 200_000_000_000_000_000n,
  /** Leaves `loanBalance` unanswered, as it is on the first render. */
  balancePending = false,
}: { requiresApproval?: boolean; available?: bigint; principal?: bigint; interest?: bigint; balancePending?: boolean } = {}) {
  mockWagmiUseReadContract.mockImplementation((config?: { functionName?: string }) => {
    if (config?.functionName === 'poolConfig') {
      return { data: [10_000_000_000_000_000_000n, 500n, 2_592_000n, true, requiresApproval], refetch: jest.fn() }
    }

    if (config?.functionName === 'loanBalance') {
      return { data: balancePending ? undefined : [principal, interest], refetch: jest.fn() }
    }

    return { data: available, refetch: jest.fn() }
  })
}

jest.mock('../../../src/hooks/pools/useTransactionMonitoring', () => ({
  useTransactionMonitoring: () => ({ waitForTransaction: mockWaitForTransaction, isWaiting: false, error: null }),
}))

jest.mock('../../../src/hooks/pools/usePoolIndexing', () => ({
  usePoolIndexing: () => ({ triggerIndexing: mockTriggerIndexing, indexConfirmed: jest.fn(), isIndexing: false }),
}))

const mockWriteNote = jest.fn()
const mockNoteFor = jest.fn()

jest.mock('../../../src/hooks/pools/useNotes', () => ({
  useNotes: () => ({ notes: [], isLoading: false, refresh: jest.fn(), noteFor: mockNoteFor, writeNote: mockWriteNote }),
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
    amountRepaid: '0',
    principalOutstanding: '4000000000000000000',
    interestOutstanding: '0',
    status: 'disbursed' as const,
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
  mockRequestLoan.mockResolvedValue(TX_HASH)
  mockRepay.mockResolvedValue(TX_HASH)
  mockCancelLoanRequest.mockResolvedValue(TX_HASH)
  mockWaitForTransaction.mockResolvedValue({ loanId: 3, amount: '5000000000000000000' })
  mockTriggerIndexing.mockResolvedValue(undefined)
  mockWriteNote.mockResolvedValue(true)
  mockNoteFor.mockReturnValue(undefined)
  mockChainReads()
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

    // The loan does not exist yet — the contract assigns its id when this is
    // mined — so the purpose is staged under the transaction and the indexer
    // moves it, before the owner's queue notification goes out.
    it('stages the purpose under the transaction that asked for the loan', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      fireEvent.changeText(getByTestId('borrow-purpose-input'), 'School fees.')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      expect(mockWriteNote).toHaveBeenCalledWith({ kind: 'loan_purpose', txHash: TX_HASH, text: 'School fees.' })
    })

    // Written before indexing, so a phone that dies in the next few seconds
    // still gets its purpose across when the sweep reaches the loan.
    it('stages it before asking the backend to index anything', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      fireEvent.changeText(getByTestId('borrow-purpose-input'), 'School fees.')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      expect(mockWriteNote.mock.invocationCallOrder[0]).toBeLessThan(mockTriggerIndexing.mock.invocationCallOrder[0])
    })

    it('says nothing when the borrower would rather not', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      expect(mockWriteNote).not.toHaveBeenCalled()
    })

    it('does not stage a purpose for a transaction the wallet refused', async () => {
      mockBorrow.mockRejectedValue(new Error('nope'))
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      fireEvent.changeText(getByTestId('borrow-purpose-input'), 'School fees.')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      expect(mockWriteNote).not.toHaveBeenCalled()
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

    it('reminds the borrower what they said the money was for', () => {
      mockNoteFor.mockReturnValue({ text: 'School fees.' })

      const { getByTestId } = render(<BorrowScreen />)

      expect(mockNoteFor).toHaveBeenCalledWith('31337-1-3', 'loan_purpose')
      expect(getByTestId('repay-purpose-text')).toHaveTextContent('School fees.')
    })

    it('offers repayment instead of borrowing when a loan is open', () => {
      // The contract allows one open loan per member per pool, so there is
      // nothing to choose between.
      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      expect(getByTestId('repay-panel')).toBeTruthy()
      expect(queryByTestId('borrow-form')).toBeNull()
    })

    /**
     * Settling sends a shade more than the debt on purpose.
     *
     * Interest accrues per second, so a payment of exactly the balance lands a
     * block late and leaves the loan open — which looks like success. The
     * head-room is an hour of accrual and the excess is refunded.
     */
    it('offers the whole balance plus accrual head-room by default', async () => {
      // 4 POL principal + 0.2 accrued, plus an hour at 500bp over 30 days.
      const { getByTestId } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('repay-submit'))
      })

      expect(mockRepay).toHaveBeenCalledWith(expect.objectContaining({ loanId: 3, amount: 4_200_277_777_777_777_777n }))
    })

    /**
     * The balance comes from `loanBalance`, not from the indexed record.
     *
     * The record carries a snapshot the app projects with the *device* clock;
     * right for a figure in a list, wrong for one about to be signed for.
     */
    it('prices the loan from the chain rather than the indexed record', async () => {
      // The record still says nothing has been paid; the chain says otherwise,
      // and the chain wins.
      mockChainReads({ principal: 1_000_000_000_000_000_000n, interest: 50_000_000_000_000_000n })
      const { getByTestId } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('repay-submit'))
      })

      expect(mockRepay).toHaveBeenCalledWith(expect.objectContaining({ amount: 1_050_069_444_444_444_444n }))
    })

    it('waits for the chain before offering a figure', async () => {
      // A form pre-filled from the record would show a stale number and then
      // change under the borrower's hands.
      mockChainReads({ balancePending: true })
      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      expect(getByTestId('repay-loading')).toBeTruthy()
      expect(queryByTestId('repay-form')).toBeNull()
    })

    it('sends whatever the borrower asks for', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('repay-amount'), '1.5')
      await act(async () => {
        fireEvent.press(getByTestId('repay-submit'))
      })

      expect(mockRepay).toHaveBeenCalledWith(expect.objectContaining({ amount: 1_500_000_000_000_000_000n }))
    })

    /**
     * The one thing this screen must not do.
     *
     * A part payment leaves the debt open and the borrower's single slot in
     * this pool taken, so "Loan repaid" and "you can borrow from it again"
     * would both be false — and the second is a promise `createLoan` would
     * refuse a moment later with `LoanOutstanding`.
     */
    it('does not call a part payment a repaid loan', async () => {
      const { getByTestId, getByText, queryByText } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('repay-amount'), '1.5')
      await act(async () => {
        fireEvent.press(getByTestId('repay-submit'))
      })

      await waitFor(() => expect(getByTestId('borrow-success')).toBeTruthy())
      expect(getByText('Payment received')).toBeTruthy()
      expect(queryByText(/borrow from it again/)).toBeNull()
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
      mockRepay.mockRejectedValue(new Error('This loan belongs to another wallet'))
      const { getByTestId } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('repay-submit'))
      })

      expect(getByTestId('repay-error')).toBeTruthy()
    })

    it('ignores a loan that has already been settled', async () => {
      poolStore.loanRecords = [
        outstandingLoan({ isRepaid: true, amountRepaid: '4200000000000000000', principalOutstanding: '0', interestOutstanding: '0' }),
      ]

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

  // -------------------------------------------------------------------------
  // Pools whose owner reviews before lending.
  //
  // `requiresApproval` is read from the chain on every render, not from the
  // indexed pool record: the owner can flip it at any moment and nothing
  // indexes that, so a stale answer sends `createLoan` at a pool that now
  // reverts with `ApprovalRequired`.
  // -------------------------------------------------------------------------

  describe('requesting', () => {
    beforeEach(() => {
      mockChainReads({ requiresApproval: true })
    })

    it('sends requestLoan rather than createLoan', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      expect(mockRequestLoan).toHaveBeenCalledWith(expect.objectContaining({ poolId: 1, amount: 5_000_000_000_000_000_000n }))
      expect(mockBorrow).not.toHaveBeenCalled()
    })

    it('borrows directly when the pool does not review', async () => {
      mockChainReads({ requiresApproval: false })
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      expect(mockBorrow).toHaveBeenCalled()
      expect(mockRequestLoan).not.toHaveBeenCalled()
    })

    it('indexes it as a request, not a borrow', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      await waitFor(() => expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'REQUEST_LOAN'))
    })

    it('does not claim the funds are on their way', async () => {
      // Nothing moved. Saying otherwise is the one thing this screen must not do.
      const { getByTestId, getByText, queryByText } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })

      await waitFor(() => expect(getByTestId('borrow-success')).toBeTruthy())
      expect(getByText('Request sent')).toBeTruthy()
      expect(queryByText('Loan disbursed')).toBeNull()
    })

    it('does not block the form on liquidity the contract will not check', async () => {
      // `requestLoan` ignores the balance — what matters is whether the pool can
      // cover it when the owner decides — so refusing on today's figure would
      // turn away a request the contract would have taken.
      mockChainReads({ requiresApproval: true, available: 1n })
      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      fireEvent.changeText(getByTestId('borrow-amount'), '5')

      expect(queryByTestId('borrow-exceeds-available')).toBeNull()
      await act(async () => {
        fireEvent.press(getByTestId('borrow-submit'))
      })
      expect(mockRequestLoan).toHaveBeenCalled()
    })
  })

  describe('a request waiting on the owner', () => {
    beforeEach(() => {
      poolStore.loanRecords = [outstandingLoan({ loanId: 5, status: 'requested' })]
    })

    it('shows the waiting panel instead of the form', () => {
      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      expect(getByTestId('pending-request-panel')).toBeTruthy()
      expect(queryByTestId('borrow-form')).toBeNull()
    })

    it('does not offer to repay it', () => {
      // The regression `activeLoanFor` used to have: a request is not repaid,
      // but nothing was ever disbursed to repay.
      const { queryByTestId } = render(<BorrowScreen />)

      expect(queryByTestId('repay-panel')).toBeNull()
    })

    it('withdraws the request with its id', async () => {
      const { getByTestId } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('cancel-request-submit'))
      })

      expect(mockCancelLoanRequest).toHaveBeenCalledWith(expect.objectContaining({ loanId: 5, amount: 4_000_000_000_000_000_000n }))
      await waitFor(() => expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'CANCEL_LOAN_REQUEST'))
    })

    it('says the request was withdrawn, not that a loan was repaid', async () => {
      const { getByTestId, getByText } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('cancel-request-submit'))
      })

      await waitFor(() => expect(getByTestId('borrow-success')).toBeTruthy())
      expect(getByText('Request withdrawn')).toBeTruthy()
    })

    it('surfaces a failed cancellation without leaving the panel', async () => {
      mockCancelLoanRequest.mockRejectedValue(new Error('This request has already been decided'))
      const { getByTestId } = render(<BorrowScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('cancel-request-submit'))
      })

      expect(getByTestId('cancel-request-error')).toBeTruthy()
      expect(getByTestId('pending-request-panel')).toBeTruthy()
    })

    it('ignores another wallet’s request in the same pool', async () => {
      poolStore.loanRecords = [outstandingLoan({ status: 'requested', borrower: '0x0000000000000000000000000000000000000042' })]

      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      expect(getByTestId('borrow-form')).toBeTruthy()
      expect(queryByTestId('pending-request-panel')).toBeNull()
    })

    it('ignores a request that was turned down', async () => {
      // A rejection frees the borrower to ask again, so the form is what they
      // need — not a panel about a request that is over.
      poolStore.loanRecords = [outstandingLoan({ status: 'rejected' })]

      const { getByTestId, queryByTestId } = render(<BorrowScreen />)

      expect(getByTestId('borrow-form')).toBeTruthy()
      expect(queryByTestId('pending-request-panel')).toBeNull()
    })
  })

  it('says so when the pool is not available', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })

    const { getByTestId } = render(<BorrowScreen />)

    expect(getByTestId('borrow-pool-not-found')).toBeTruthy()
  })
})
