import React from 'react'
import { Linking } from 'react-native'
import {
  BORROWER_ADDRESS,
  LOAN_PARAMS,
  makeLoanTransaction,
  makePendingTransaction,
  TX_HASH,
} from '../../__tests__/fixtures/pendingTransaction'
import { fireEvent, render } from '../../__tests__/test-utils'
import { TransactionStatusModal } from './TransactionStatusModal'

describe('TransactionStatusModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders nothing for a null transaction', () => {
    const { queryByText } = render(<TransactionStatusModal transaction={null} onClose={jest.fn()} />)

    expect(queryByText('Creating your pool')).toBeNull()
  })

  it('describes a transaction still in flight', () => {
    const { getByText, getAllByTestId } = render(<TransactionStatusModal transaction={makePendingTransaction()} onClose={jest.fn()} />)

    expect(getByText('Creating your pool')).toBeTruthy()
    expect(getByText('Sent to the network')).toBeTruthy()
    // Sent is done, confirming is active, listing has not started.
    expect(getAllByTestId('transaction-step-done')).toHaveLength(1)
    expect(getAllByTestId('transaction-step-active')).toHaveLength(1)
    expect(getAllByTestId('transaction-step-pending')).toHaveLength(1)
  })

  it('advances the steps once the transaction is confirmed', () => {
    const transaction = makePendingTransaction({ status: 'confirmed', result: { poolId: 7, poolAddress: '0xabc' } })

    const { getByText, getAllByTestId, queryByTestId } = render(<TransactionStatusModal transaction={transaction} onClose={jest.fn()} />)

    expect(getByText('Almost there')).toBeTruthy()
    expect(getAllByTestId('transaction-step-done')).toHaveLength(2)
    // Listing is now the active step, and nothing is left pending.
    expect(getAllByTestId('transaction-step-active')).toHaveLength(1)
    expect(queryByTestId('transaction-step-pending')).toBeNull()
  })

  it('shows the pool id once the receipt has been decoded', () => {
    const transaction = makePendingTransaction({ status: 'confirmed', result: { poolId: 7, poolAddress: '0xabc' } })

    const { getByText } = render(<TransactionStatusModal transaction={transaction} onClose={jest.fn()} />)

    expect(getByText('#7')).toBeTruthy()
  })

  it('marks the chain step as failed', () => {
    const { getByText, getByTestId } = render(
      <TransactionStatusModal transaction={makePendingTransaction({ status: 'failed' })} onClose={jest.fn()} />
    )

    expect(getByText('That transaction failed')).toBeTruthy()
    expect(getByText('Rejected on chain')).toBeTruthy()
    expect(getByTestId('transaction-step-failed')).toBeTruthy()
  })

  it('shows the pool terms in contract-agnostic units', () => {
    const { getByText } = render(<TransactionStatusModal transaction={makePendingTransaction()} onClose={jest.fn()} />)

    expect(getByText('Neighbourhood Fund')).toBeTruthy()
    expect(getByText('100 POL · 5% · 30 days')).toBeTruthy()
  })

  describe('explorer link', () => {
    it('is hidden on a chain without an explorer', () => {
      // The local Hardhat node has none — a link there would be dead.
      const { queryByTestId, getByTestId } = render(<TransactionStatusModal transaction={makePendingTransaction()} onClose={jest.fn()} />)

      expect(queryByTestId('transaction-explorer-link')).toBeNull()
      expect(getByTestId('transaction-hash')).toBeTruthy()
    })

    it('opens the explorer for a public chain', () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)

      const { getByTestId } = render(
        <TransactionStatusModal transaction={makePendingTransaction({ chainId: 80002 })} onClose={jest.fn()} />
      )

      fireEvent.press(getByTestId('transaction-explorer-link'))

      expect(openURL).toHaveBeenCalledWith(`https://amoy.polygonscan.com/tx/${TX_HASH}`)
    })
  })

  describe('the loan actions', () => {
    it.each([
      ['BORROW', 'Requesting your loan'],
      ['REPAY', 'Repaying your loan'],
      ['REQUEST_LOAN', 'Sending your request'],
      ['APPROVE_LOAN', 'Approving the request'],
      ['REJECT_LOAN', 'Turning down the request'],
      ['CANCEL_LOAN_REQUEST', 'Withdrawing your request'],
    ] as const)('has its own wording for %s', (type, headline) => {
      const { getByText } = render(<TransactionStatusModal transaction={makeLoanTransaction({ type })} onClose={jest.fn()} />)

      expect(getByText(headline)).toBeTruthy()
    })

    it('does not promise funds when a request only reaches the owner', () => {
      // Confirmation is not the outcome here: the answer comes later, from
      // someone else. Reusing the borrow copy would say the money is on its way.
      const transaction = makeLoanTransaction({ type: 'REQUEST_LOAN', status: 'confirmed', result: { loanId: 4, amount: '1' } })

      const { getByText } = render(<TransactionStatusModal transaction={transaction} onClose={jest.fn()} />)

      expect(getByText('Waiting on the pool owner')).toBeTruthy()
    })

    it('shows the pool and the amount', () => {
      const { getByText } = render(<TransactionStatusModal transaction={makeLoanTransaction()} onClose={jest.fn()} />)

      expect(getByText('Neighbourhood Fund')).toBeTruthy()
      expect(getByText('5 POL')).toBeTruthy()
    })

    it('names the borrower on an owner’s decision', () => {
      // The sender is the owner, so without this the card names the wrong person.
      const transaction = makeLoanTransaction({ type: 'APPROVE_LOAN', params: { ...LOAN_PARAMS, loanId: 7, borrower: BORROWER_ADDRESS } })

      const { getByText } = render(<TransactionStatusModal transaction={transaction} onClose={jest.fn()} />)

      expect(getByText('Borrower')).toBeTruthy()
    })

    it('omits the borrower row on the borrower’s own call', () => {
      const { queryByText } = render(<TransactionStatusModal transaction={makeLoanTransaction()} onClose={jest.fn()} />)

      expect(queryByText('Borrower')).toBeNull()
    })

    it('shows no loan id until the chain has assigned one', () => {
      const { queryByText } = render(<TransactionStatusModal transaction={makeLoanTransaction()} onClose={jest.fn()} />)

      expect(queryByText('Loan ID')).toBeNull()
    })

    it('shows the loan id once the receipt has been decoded', () => {
      const transaction = makeLoanTransaction({ status: 'confirmed', result: { loanId: 12, amount: '5000000000000000000' } })

      const { getByText } = render(<TransactionStatusModal transaction={transaction} onClose={jest.fn()} />)

      expect(getByText('#12')).toBeTruthy()
    })
  })

  describe('dismissal', () => {
    it('closes from the done button', () => {
      const onClose = jest.fn()

      const { getByTestId } = render(<TransactionStatusModal transaction={makePendingTransaction()} onClose={onClose} />)

      fireEvent.press(getByTestId('transaction-status-close'))

      expect(onClose).toHaveBeenCalled()
    })

    it('closes from the backdrop', () => {
      const onClose = jest.fn()

      const { getByTestId } = render(<TransactionStatusModal transaction={makePendingTransaction()} onClose={onClose} />)

      fireEvent.press(getByTestId('transaction-status-backdrop'))

      expect(onClose).toHaveBeenCalled()
    })

    it('offers removal only when the caller allows it', () => {
      const onDismiss = jest.fn()

      const { queryByTestId } = render(<TransactionStatusModal transaction={makePendingTransaction()} onClose={jest.fn()} />)
      expect(queryByTestId('transaction-status-dismiss')).toBeNull()

      const { getByTestId } = render(
        <TransactionStatusModal transaction={makePendingTransaction({ status: 'failed' })} onClose={jest.fn()} onDismiss={onDismiss} />
      )
      fireEvent.press(getByTestId('transaction-status-dismiss'))

      expect(onDismiss).toHaveBeenCalled()
    })
  })
})
