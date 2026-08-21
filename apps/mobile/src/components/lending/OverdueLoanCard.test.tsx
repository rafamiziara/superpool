import type { BorrowerHistory, LoanInfo } from '@superpool/types'
import React from 'react'
import { mockWagmiUseReadContract } from '../../__tests__/mocks'
import { fireEvent, render } from '../../__tests__/test-utils'
import { OverdueLoanCard } from './OverdueLoanCard'

const DAY = 24 * 60 * 60 * 1000
const TERM_SECONDS = 30 * 24 * 60 * 60
const POOL_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const
const DENOMINATION = { symbol: 'POL', decimals: 18 }

function history(overrides: Partial<BorrowerHistory> = {}): BorrowerHistory {
  return { total: 1, repaid: 0, onTime: 0, late: 0, undated: 0, outstanding: 1, overdue: 1, defaulted: 0, isNew: false, ...overrides }
}

function record(overrides: Partial<LoanInfo> = {}, dueInMs = -5 * DAY): LoanInfo {
  return {
    id: '31337-1-1',
    loanId: 1,
    poolId: 1,
    poolAddress: POOL_ADDRESS,
    borrower: '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    amount: '5000000000000000000',
    interestRate: 500,
    duration: TERM_SECONDS,
    startedAt: new Date(Date.now() + dueInMs - TERM_SECONDS * 1000).toISOString(),
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

function renderCard(props: Partial<React.ComponentProps<typeof OverdueLoanCard>> = {}) {
  return render(
    <OverdueLoanCard
      loan={record()}
      denomination={DENOMINATION}
      poolAddress={POOL_ADDRESS}
      gracePeriod={0}
      history={history()}
      reason=""
      onChangeReason={jest.fn()}
      isConfirming={false}
      onAskToDeclare={jest.fn()}
      onCancelDeclare={jest.fn()}
      onDeclare={jest.fn()}
      {...props}
    />
  )
}

beforeEach(() => {
  mockWagmiUseReadContract.mockReturnValue({ data: 5_200_000_000_000_000_000n, refetch: jest.fn() })
})

describe('OverdueLoanCard', () => {
  it('leads with what is owed now, from the chain', () => {
    // The record's snapshot was taken at the last payment, which on a loan that
    // is late by definition is the one figure guaranteed to be stale — and this
    // number sits beside a button that puts a judgement on the record.
    const { getByTestId } = renderCard()

    expect(getByTestId('overdue-outstanding-1')).toHaveTextContent('5.2 POL')
  })

  it('shows a dash rather than a guess while the chain has not answered', () => {
    mockWagmiUseReadContract.mockReturnValue({ data: undefined, refetch: jest.fn() })

    const { getByTestId } = renderCard()

    expect(getByTestId('overdue-outstanding-1')).toHaveTextContent('—')
  })

  it('says that interest is still accruing', () => {
    // The fact that most changes what an owner does next: waiting costs them
    // nothing, because the extra time is already being charged for.
    const { getByText } = renderCard()

    expect(getByText(/Interest is still accruing/)).toBeTruthy()
  })

  describe('declaring a default', () => {
    it('does not declare on the first tap', () => {
      const onDeclare = jest.fn()
      const onAskToDeclare = jest.fn()
      const { getByTestId } = renderCard({ onDeclare, onAskToDeclare })

      fireEvent.press(getByTestId('overdue-ask-1'))

      expect(onAskToDeclare).toHaveBeenCalled()
      expect(onDeclare).not.toHaveBeenCalled()
    })

    it('says what a declaration does not do, before it is made', () => {
      // An owner reaching for this is usually looking for a way to get their
      // money back, and this is not that.
      const { getByTestId } = renderCard({ isConfirming: true })

      const confirm = getByTestId('overdue-confirm-1')

      expect(confirm).toHaveTextContent(/Nothing is recovered and nothing is seized/)
      expect(confirm).toHaveTextContent(/the debt stays/)
      expect(confirm).toHaveTextContent(/can still pay it off/)
      expect(confirm).toHaveTextContent(/cannot be undone/)
    })

    it('declares on the confirmation', () => {
      const onDeclare = jest.fn()
      const { getByTestId } = renderCard({ isConfirming: true, onDeclare })

      fireEvent.press(getByTestId('overdue-declare-1'))

      expect(onDeclare).toHaveBeenCalled()
    })

    it('lets the owner back out', () => {
      const onCancelDeclare = jest.fn()
      const { getByTestId } = renderCard({ isConfirming: true, onCancelDeclare })

      fireEvent.press(getByTestId('overdue-cancel-1'))

      expect(onCancelDeclare).toHaveBeenCalled()
    })
  })

  describe('the grace period the owner promised', () => {
    it('quotes the date back rather than offering a button that reverts', () => {
      // The owner set this. A disabled button with no explanation would read as
      // a bug; `markDefaulted` would revert with `LoanNotOverdue`.
      const { getByTestId, queryByTestId } = renderCard({ gracePeriod: 30 * 24 * 60 * 60 })

      expect(getByTestId('overdue-waiting-1')).toHaveTextContent(/You can mark this in default from/)
      expect(queryByTestId('overdue-ask-1')).toBeNull()
    })

    it('offers the action once the grace period has run out', () => {
      const { getByTestId } = renderCard({ gracePeriod: 24 * 60 * 60, loan: record({}, -5 * DAY) })

      expect(getByTestId('overdue-ask-1')).toBeTruthy()
    })
  })

  describe('a loan already declared', () => {
    it('offers no second declaration', () => {
      // `markDefaulted` reverts with `LoanAlreadyDefaulted`, and there is
      // nothing to add to a judgement already on the record.
      const { queryByTestId } = renderCard({ loan: record({ status: 'defaulted' }) })

      expect(queryByTestId('overdue-ask-1')).toBeNull()
    })

    it('says the mark stands and the debt does too', () => {
      const { getByTestId } = renderCard({ loan: record({ status: 'defaulted' }) })

      expect(getByTestId('overdue-declared-1')).toHaveTextContent(/cannot be unmarked, and it is still owed/)
    })
  })
})
