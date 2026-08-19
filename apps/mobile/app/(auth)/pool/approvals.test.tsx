import type { LoanInfo } from '@superpool/types'
import type { RenderResult } from '@testing-library/react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import React from 'react'
import { mockWagmiUseReadContract } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams } from '../../../src/__tests__/setup'
import { MOCK_USER_ADDRESS } from '../../../src/mocks/lending'
import { authStore } from '../../../src/stores/AuthStore'
import { poolStore } from '../../../src/stores/PoolStore'
import ApprovalsScreen from './approvals'

const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

/** Pool 2 in the mock data is the one the mock user owns. */
const POOL_ID = '2'
/** Pool 1 belongs to someone else — the subject for the not-owner path. */
const POOL_I_DO_NOT_OWN = '1'
const STRANGER = '0x0000000000000000000000000000000000000042'

const mockApproveLoan = jest.fn()
const mockRejectLoan = jest.fn()
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
    approveLoan: mockApproveLoan,
    rejectLoan: mockRejectLoan,
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

const mockWriteNote = jest.fn()
const mockNoteFor = jest.fn()
const mockRefreshAssessment = jest.fn()
let mockAssessments: Record<string, unknown> = {}

jest.mock('../../../src/hooks/pools/useAssessment', () => ({
  useAssessments: () => ({
    assessments: mockAssessments,
    pending: {},
    unavailable: {},
    refresh: mockRefreshAssessment,
  }),
}))

jest.mock('../../../src/hooks/pools/useNotes', () => ({
  useNotes: () => ({ notes: [], isLoading: false, refresh: jest.fn(), noteFor: mockNoteFor, writeNote: mockWriteNote }),
}))

function makeRequest(overrides: Partial<LoanInfo> = {}): LoanInfo {
  return {
    id: '31337-2-5',
    loanId: 5,
    poolId: 2,
    poolAddress: poolStore.poolById(2)!.poolAddress,
    borrower: STRANGER,
    amount: '4000000000000000000',
    interestRate: 500,
    duration: 2_592_000,
    startedAt: '2026-08-11T09:00:00.000Z',
    isRepaid: false,
    amountRepaid: '0',
    principalOutstanding: '4000000000000000000',
    interestOutstanding: '0',
    status: 'requested',
    chainId: 31337,
    transactionHash: '0xaaa',
    blockNumber: 100,
    ...overrides,
  }
}

/**
 * Load loans the way the live app does.
 *
 * The suite runs on mock pools, where `PoolStore.loans` is a fixture list and
 * ignores `loanRecords` entirely — fine for the queue, which reads the records
 * directly, and wrong for a borrower's history, which is derived from `loans`
 * like every other analysis of them. Dropping out of mock mode needs a wallet
 * too, since the mock user is only the connected one while mocks are on.
 */
function withIndexedLoans(records: LoanInfo[]) {
  delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS
  authStore.walletAddress = MOCK_USER_ADDRESS
  poolStore.loanRecords = records
}

beforeEach(async () => {
  jest.clearAllMocks()
  mockLoanError = null
  mockLocalSearchParams.mockReturnValue({ poolId: POOL_ID })
  mockApproveLoan.mockResolvedValue(TX_HASH)
  mockRejectLoan.mockResolvedValue(TX_HASH)
  mockWaitForTransaction.mockResolvedValue({ loanId: 5, amount: '4000000000000000000' })
  mockTriggerIndexing.mockResolvedValue(undefined)
  mockWriteNote.mockResolvedValue(true)
  mockNoteFor.mockReturnValue(undefined)
  mockAssessments = {}
  mockWagmiUseReadContract.mockReturnValue({ data: 100_000_000_000_000_000_000n, refetch: jest.fn().mockResolvedValue({ data: 0n }) })
  authStore.walletAddress = null
  await poolStore.fetchPools()
  poolStore.loanRecords = []
})

afterEach(() => {
  process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
  poolStore.loanRecords = []
  authStore.walletAddress = null
})

describe('ApprovalsScreen', () => {
  it('says so when the pool is not available', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })

    const { getByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('approvals-pool-not-found')).toBeTruthy()
  })

  // A notification tap can open this screen on a cold start, where the auth
  // group has only just kicked off `fetchPools`. Answering "that pool is not
  // available" — or worse, "only the owner can decide" — to the owner who just
  // tapped a notification about their own pool is a definitive answer to a
  // question nothing has resolved yet.
  it('reads as loading, not as missing, while the pools are still arriving', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })
    poolStore.isLoading = true

    const { getByTestId, queryByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('approvals-loading')).toBeTruthy()
    expect(queryByTestId('approvals-pool-not-found')).toBeNull()

    poolStore.isLoading = false
  })

  it('says the pool is missing once the load has finished', () => {
    mockLocalSearchParams.mockReturnValue({ poolId: '9999' })
    poolStore.isLoading = false

    const { getByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('approvals-pool-not-found')).toBeTruthy()
  })

  it('turns away anyone who is not the pool owner', () => {
    // `approveLoan` and `rejectLoan` are `onlyOwner`, so showing the queue would
    // invite a transaction that reverts.
    mockLocalSearchParams.mockReturnValue({ poolId: POOL_I_DO_NOT_OWN })
    poolStore.loanRecords = [makeRequest({ id: '31337-1-5', poolId: 1 })]

    const { getByTestId, queryByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('approvals-not-owner')).toBeTruthy()
    expect(queryByTestId('loan-request-card-5')).toBeNull()
  })

  it('lets the owner in whatever case their wallet reports', () => {
    // Indexed addresses are lowercased; a connected wallet is checksummed. A
    // strict compare would lock an owner out of their own pool.
    authStore.walletAddress = MOCK_USER_ADDRESS.toLowerCase()

    const { getByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('approvals-screen')).toBeTruthy()
  })

  it('says there is nothing to decide when the queue is empty', () => {
    const { getByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('approvals-empty')).toBeTruthy()
  })

  it('shows what the borrower has done with money before', () => {
    // The decision the screen exists for is a judgement about a person, and
    // until this landed the only thing on the card about them was an address.
    withIndexedLoans([
      makeRequest(),
      // Their history, in a different pool: settled well inside its term.
      {
        ...makeRequest({ id: '31337-3-1', loanId: 1, poolId: 3, status: 'disbursed' }),
        isRepaid: true,
        // 4 POL at 500bp, settled in full.
        amountRepaid: '4200000000000000000',
        principalOutstanding: '0',
        interestOutstanding: '0',
        startedAt: '2026-07-20T09:00:00.000Z',
        repaidAt: '2026-08-10T09:00:00.000Z',
      },
    ])

    const { getByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('loan-request-history-5-total')).toHaveTextContent('1')
    expect(getByTestId('loan-request-history-5-on-time')).toHaveTextContent('1')
  })

  it('does not hold a borrower’s first request against them', () => {
    withIndexedLoans([makeRequest()])

    const { getByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('loan-request-history-5-new')).toBeTruthy()
  })

  it('lists every member’s request, not just the owner’s own', () => {
    // The whole point of the screen: the owner is deciding on other people's
    // requests, so filtering by the connected wallet would empty it.
    poolStore.loanRecords = [makeRequest(), makeRequest({ id: '31337-2-6', loanId: 6 })]

    const { getByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('loan-request-card-5')).toBeTruthy()
    expect(getByTestId('loan-request-card-6')).toBeTruthy()
  })

  it('leaves out loans that are already disbursed or decided', () => {
    poolStore.loanRecords = [
      makeRequest(),
      makeRequest({ id: '31337-2-7', loanId: 7, status: 'disbursed' }),
      makeRequest({ id: '31337-2-8', loanId: 8, status: 'rejected' }),
    ]

    const { getByTestId, queryByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('loan-request-card-5')).toBeTruthy()
    expect(queryByTestId('loan-request-card-7')).toBeNull()
    expect(queryByTestId('loan-request-card-8')).toBeNull()
  })

  it('leaves out another pool’s requests', () => {
    poolStore.loanRecords = [makeRequest({ id: '31337-3-5', poolId: 3 })]

    const { getByTestId } = render(<ApprovalsScreen />)

    expect(getByTestId('approvals-empty')).toBeTruthy()
  })

  describe('ordering', () => {
    /*
      Three requests, made a day apart, in an order that is neither.

      Built per test rather than once: `makeRequest` reads the pool's address
      from the store, and the store is loaded in `beforeEach`.
    */
    const queue = () => [
      makeRequest({ id: '31337-2-5', loanId: 5, amount: '500000000000000000', startedAt: '2026-08-05T09:00:00.000Z' }),
      makeRequest({ id: '31337-2-6', loanId: 6, amount: '1000000000000000000', startedAt: '2026-08-02T09:00:00.000Z' }),
      makeRequest({ id: '31337-2-7', loanId: 7, amount: '9000000000000000000', startedAt: '2026-08-08T09:00:00.000Z' }),
    ]

    // Taken from `render`'s own result rather than hand-written: the shape it
    // described stopped matching the library's `GetAllByQuery`, which failed
    // type-check while the test itself kept passing.
    const renderedOrder = (getAllByTestId: RenderResult['getAllByTestId']) =>
      getAllByTestId(/^loan-request-card-/).map((card) => String(card.props.testID))

    it('answers the longest wait first', () => {
      // The default, and the reason it is the default: served newest-first,
      // whoever asked earliest is pushed down every time somebody new asks.
      poolStore.loanRecords = queue()

      const { getAllByTestId } = render(<ApprovalsScreen />)

      expect(renderedOrder(getAllByTestId)).toEqual(['loan-request-card-6', 'loan-request-card-5', 'loan-request-card-7'])
    })

    it('reorders by amount when the owner asks', () => {
      // Deliberately not the waiting order: the smallest request here is also
      // the middle one by age, so an order that did nothing would still pass
      // the default case above.
      poolStore.loanRecords = queue()

      const { getAllByTestId, getByTestId } = render(<ApprovalsScreen />)
      fireEvent.press(getByTestId('approvals-order-largest'))

      expect(renderedOrder(getAllByTestId)).toEqual(['loan-request-card-7', 'loan-request-card-6', 'loan-request-card-5'])

      fireEvent.press(getByTestId('approvals-order-smallest'))

      expect(renderedOrder(getAllByTestId)).toEqual(['loan-request-card-5', 'loan-request-card-6', 'loan-request-card-7'])
    })

    it('offers only orders that are facts about the request', () => {
      // Nothing here ranks borrowers. An order by assessment band or by
      // borrowing history is a score with the arithmetic hidden, and this
      // project refused to build a score.
      poolStore.loanRecords = queue()

      const { getByTestId, queryByTestId } = render(<ApprovalsScreen />)

      expect(getByTestId('approvals-order-waiting')).toBeTruthy()
      expect(getByTestId('approvals-order-largest')).toBeTruthy()
      expect(getByTestId('approvals-order-smallest')).toBeTruthy()
      expect(queryByTestId('approvals-order-risk')).toBeNull()
    })

    it('hides the control when there is nothing to order', () => {
      // One request has no order, and the row would read as a setting to
      // understand before deciding anything.
      poolStore.loanRecords = [makeRequest()]

      const { queryByTestId } = render(<ApprovalsScreen />)

      expect(queryByTestId('approvals-order')).toBeNull()
    })
  })

  describe('deciding', () => {
    beforeEach(() => {
      poolStore.loanRecords = [makeRequest()]
    })

    it('approves with the loan id and names the borrower', async () => {
      // The sender is the owner, so without the borrower every card in this
      // queue would report the decider as the person who asked.
      const { getByTestId } = render(<ApprovalsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-approve-5'))
      })

      expect(mockApproveLoan).toHaveBeenCalledWith(
        expect.objectContaining({ poolId: 2, loanId: 5, amount: 4_000_000_000_000_000_000n, borrower: STRANGER })
      )
    })

    // Saved before the transaction, which is what lets the borrower's push
    // carry it. Afterwards would send the refusal bare.
    it('writes the reason before sending the decision', async () => {
      const { getByTestId } = render(<ApprovalsScreen />)

      fireEvent.changeText(getByTestId('loan-request-reason-5-input'), 'The pool is fully lent out until March.')

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-reject-5'))
      })

      expect(mockWriteNote).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'loan_rejected', recordId: '31337-2-5', text: 'The pool is fully lent out until March.' })
      )
      expect(mockWriteNote.mock.invocationCallOrder[0]).toBeLessThan(mockRejectLoan.mock.invocationCallOrder[0])
    })

    // One box serves both answers: the kind follows the button pressed, so a
    // reason typed while hesitating becomes the reason for whichever was given.
    it('files the reason under the decision that was actually made', async () => {
      const { getByTestId } = render(<ApprovalsScreen />)

      fireEvent.changeText(getByTestId('loan-request-reason-5-input'), 'Glad to help.')

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-approve-5'))
      })

      expect(mockWriteNote).toHaveBeenCalledWith(expect.objectContaining({ kind: 'loan_approved' }))
    })

    it('writes nothing when the owner said nothing', async () => {
      const { getByTestId } = render(<ApprovalsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-approve-5'))
      })

      expect(mockWriteNote).not.toHaveBeenCalled()
    })

    // Advisory throughout: it sits between the purpose and the record, and it
    // gates neither button below it.
    it('shows the assistant’s reading, named as one', async () => {
      mockAssessments = {
        '31337-2-5': {
          id: '31337-2-5',
          chainId: 31337,
          poolId: 2,
          loanId: 5,
          risk: 'low',
          summary: 'A modest ask against a clean record.',
          observations: [],
          questions: [],
          limitations: ['No purpose was stated.'],
          inputs: { amount: 4, liquidity: 100, symbol: 'POL', hadPurpose: false, borrower: poolStore.borrowerHistory(STRANGER) },
          createdAt: new Date().toISOString(),
        },
      }

      const { getByTestId, getByText } = render(<ApprovalsScreen />)

      expect(getByTestId('loan-request-assessment-5-summary')).toHaveTextContent(/modest ask/)
      expect(getByText('Assistant’s reading')).toBeTruthy()
    })

    it('leaves the decisions working when there is no reading at all', async () => {
      const { getByTestId, queryByTestId } = render(<ApprovalsScreen />)

      expect(queryByTestId('loan-request-assessment-5')).toBeNull()

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-approve-5'))
      })

      expect(mockApproveLoan).toHaveBeenCalled()
    })

    it('shows the borrower’s stated purpose above the decision', async () => {
      mockNoteFor.mockReturnValue({ id: 'n', recordId: '31337-2-5', kind: 'loan_purpose', text: 'School fees.' })

      const { getByTestId } = render(<ApprovalsScreen />)

      expect(getByTestId('loan-request-purpose-5-text')).toHaveTextContent('School fees.')
    })

    it('indexes an approval as an approval', async () => {
      const { getByTestId } = render(<ApprovalsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-approve-5'))
      })

      await waitFor(() => expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'APPROVE_LOAN'))
    })

    it('sends a decline through rejectLoan', async () => {
      const { getByTestId } = render(<ApprovalsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-reject-5'))
      })

      expect(mockRejectLoan).toHaveBeenCalledWith(expect.objectContaining({ loanId: 5 }))
      expect(mockApproveLoan).not.toHaveBeenCalled()
      await waitFor(() => expect(mockTriggerIndexing).toHaveBeenCalledWith(TX_HASH, 'REJECT_LOAN'))
    })

    it('re-reads the pool balance after a decision', async () => {
      // An approval moves money out, so the figure the remaining cards are
      // judged against has just changed.
      const refetch = jest.fn().mockResolvedValue({ data: 0n })
      mockWagmiUseReadContract.mockReturnValue({ data: 100_000_000_000_000_000_000n, refetch })
      const { getByTestId } = render(<ApprovalsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-approve-5'))
      })

      await waitFor(() => expect(refetch).toHaveBeenCalled())
    })

    it('surfaces a refused signature and leaves the queue in place', async () => {
      mockApproveLoan.mockRejectedValue(new Error('This request has already been decided'))
      const { getByTestId } = render(<ApprovalsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-approve-5'))
      })

      expect(getByTestId('approvals-error')).toBeTruthy()
      expect(getByTestId('loan-request-card-5')).toBeTruthy()
    })

    it('does not index a decision it could not confirm', async () => {
      // The pending record survives, so startup recovery finishes it.
      mockWaitForTransaction.mockRejectedValue(new Error('Timed out'))
      const { getByTestId } = render(<ApprovalsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('loan-request-approve-5'))
      })

      expect(mockTriggerIndexing).not.toHaveBeenCalled()
      expect(getByTestId('approvals-error')).toBeTruthy()
    })
  })
})
