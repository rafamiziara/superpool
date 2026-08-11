import type { LoanInfo } from '@superpool/types'
import React from 'react'
import { fireEvent, render } from '../../__tests__/test-utils'
import { LoanRequestCard } from './LoanRequestCard'

const BORROWER = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'

function makeRequest(overrides: Partial<LoanInfo> = {}): LoanInfo {
  return {
    id: '31337-1-5',
    loanId: 5,
    poolId: 1,
    poolAddress: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    borrower: BORROWER,
    amount: '4000000000000000000',
    interestRate: 500,
    duration: 2_592_000,
    startedAt: '2026-08-11T09:00:00.000Z',
    isRepaid: false,
    status: 'requested',
    chainId: 31337,
    transactionHash: '0xaaa',
    blockNumber: 100,
    ...overrides,
  }
}

function renderCard(props: Partial<React.ComponentProps<typeof LoanRequestCard>> = {}) {
  return render(<LoanRequestCard request={makeRequest()} onApprove={jest.fn()} onReject={jest.fn()} {...props} />)
}

describe('LoanRequestCard', () => {
  it('names the borrower and the amount they asked for', () => {
    const { getByText, getByTestId } = renderCard()

    expect(getByText('4 POL')).toBeTruthy()
    expect(getByTestId('loan-request-borrower-5')).toBeTruthy()
  })

  it('shows what the borrower will owe in total', () => {
    // 4 POL at 500 bps = 4.2. The owner is deciding on the repayment as much as
    // on the principal.
    const { getByText } = renderCard()

    expect(getByText('4.2')).toBeTruthy()
  })

  it('warns when the pool cannot cover the request', () => {
    // `approveLoan` reverts with `InsufficientFunds`; the estimate would catch
    // it, but only after the owner has decided and reached for their wallet.
    const { getByTestId } = renderCard({ available: 1_000_000_000_000_000_000n })

    expect(getByTestId('loan-request-shortfall-5')).toBeTruthy()
  })

  it('stays quiet when the pool can cover it', () => {
    const { queryByTestId } = renderCard({ available: 10_000_000_000_000_000_000n })

    expect(queryByTestId('loan-request-shortfall-5')).toBeNull()
  })

  it('says nothing about liquidity it has not been told', () => {
    const { queryByTestId } = renderCard()

    expect(queryByTestId('loan-request-shortfall-5')).toBeNull()
  })

  it('still allows approval when the read says there is a shortfall', () => {
    // The read can lag a repayment landing in the same block, and the contract
    // is the authority — the warning is honest, blocking would not be.
    const onApprove = jest.fn()
    const { getByTestId } = renderCard({ available: 1n, onApprove })

    fireEvent.press(getByTestId('loan-request-approve-5'))

    expect(onApprove).toHaveBeenCalled()
  })

  it('reports each decision separately', () => {
    const onApprove = jest.fn()
    const onReject = jest.fn()
    const { getByTestId } = renderCard({ onApprove, onReject })

    fireEvent.press(getByTestId('loan-request-reject-5'))

    expect(onReject).toHaveBeenCalled()
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('locks both decisions while one is in flight', () => {
    const onApprove = jest.fn()
    const onReject = jest.fn()
    const { getByTestId } = renderCard({ isBusy: true, onApprove, onReject })

    fireEvent.press(getByTestId('loan-request-approve-5'))
    fireEvent.press(getByTestId('loan-request-reject-5'))

    expect(onApprove).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
  })
})
