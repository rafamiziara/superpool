import React from 'react'
import { Linking } from 'react-native'
import { fireEvent, render } from '../../__tests__/test-utils'
import type { PendingTransaction } from '../../stores/PendingTransactionsStore'
import { TransactionStatusModal } from './TransactionStatusModal'

const TX_HASH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'

const buildTransaction = (overrides: Partial<PendingTransaction> = {}): PendingTransaction => ({
  txHash: TX_HASH,
  chainId: 31337,
  type: 'CREATE_POOL',
  status: 'submitted',
  timestamp: Date.now(),
  params: {
    name: 'Weekend Circle',
    description: 'A pool for the weekend crew',
    maxLoanAmount: '1000000000000000000',
    interestRate: 500,
    loanDuration: 2_592_000,
  },
  ...overrides,
})

describe('TransactionStatusModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders nothing for a null transaction', () => {
    const { queryByText } = render(<TransactionStatusModal transaction={null} onClose={jest.fn()} />)

    expect(queryByText('Creating your pool')).toBeNull()
  })

  it('describes a transaction still in flight', () => {
    const { getByText, getAllByTestId } = render(<TransactionStatusModal transaction={buildTransaction()} onClose={jest.fn()} />)

    expect(getByText('Creating your pool')).toBeTruthy()
    expect(getByText('Sent to the network')).toBeTruthy()
    // Sent is done, confirming is active, listing has not started.
    expect(getAllByTestId('transaction-step-done')).toHaveLength(1)
    expect(getAllByTestId('transaction-step-active')).toHaveLength(1)
    expect(getAllByTestId('transaction-step-pending')).toHaveLength(1)
  })

  it('advances the steps once the transaction is confirmed', () => {
    const transaction = buildTransaction({ status: 'confirmed', result: { poolId: 7, poolAddress: '0xabc' } })

    const { getByText, getAllByTestId, queryByTestId } = render(<TransactionStatusModal transaction={transaction} onClose={jest.fn()} />)

    expect(getByText('Almost there')).toBeTruthy()
    expect(getAllByTestId('transaction-step-done')).toHaveLength(2)
    // Listing is now the active step, and nothing is left pending.
    expect(getAllByTestId('transaction-step-active')).toHaveLength(1)
    expect(queryByTestId('transaction-step-pending')).toBeNull()
  })

  it('shows the pool id once the receipt has been decoded', () => {
    const transaction = buildTransaction({ status: 'confirmed', result: { poolId: 7, poolAddress: '0xabc' } })

    const { getByText } = render(<TransactionStatusModal transaction={transaction} onClose={jest.fn()} />)

    expect(getByText('#7')).toBeTruthy()
  })

  it('marks the chain step as failed', () => {
    const { getByText, getByTestId } = render(
      <TransactionStatusModal transaction={buildTransaction({ status: 'failed' })} onClose={jest.fn()} />
    )

    expect(getByText('That transaction failed')).toBeTruthy()
    expect(getByText('Rejected on chain')).toBeTruthy()
    expect(getByTestId('transaction-step-failed')).toBeTruthy()
  })

  it('shows the pool terms in contract-agnostic units', () => {
    const { getByText } = render(<TransactionStatusModal transaction={buildTransaction()} onClose={jest.fn()} />)

    expect(getByText('Weekend Circle')).toBeTruthy()
    expect(getByText('1 POL · 5% · 30 days')).toBeTruthy()
  })

  describe('explorer link', () => {
    it('is hidden on a chain without an explorer', () => {
      // The local Hardhat node has none — a link there would be dead.
      const { queryByTestId, getByTestId } = render(<TransactionStatusModal transaction={buildTransaction()} onClose={jest.fn()} />)

      expect(queryByTestId('transaction-explorer-link')).toBeNull()
      expect(getByTestId('transaction-hash')).toBeTruthy()
    })

    it('opens the explorer for a public chain', () => {
      const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)

      const { getByTestId } = render(<TransactionStatusModal transaction={buildTransaction({ chainId: 80002 })} onClose={jest.fn()} />)

      fireEvent.press(getByTestId('transaction-explorer-link'))

      expect(openURL).toHaveBeenCalledWith(`https://amoy.polygonscan.com/tx/${TX_HASH}`)
    })
  })

  describe('dismissal', () => {
    it('closes from the done button', () => {
      const onClose = jest.fn()

      const { getByTestId } = render(<TransactionStatusModal transaction={buildTransaction()} onClose={onClose} />)

      fireEvent.press(getByTestId('transaction-status-close'))

      expect(onClose).toHaveBeenCalled()
    })

    it('closes from the backdrop', () => {
      const onClose = jest.fn()

      const { getByTestId } = render(<TransactionStatusModal transaction={buildTransaction()} onClose={onClose} />)

      fireEvent.press(getByTestId('transaction-status-backdrop'))

      expect(onClose).toHaveBeenCalled()
    })

    it('offers removal only when the caller allows it', () => {
      const onDismiss = jest.fn()

      const { queryByTestId } = render(<TransactionStatusModal transaction={buildTransaction()} onClose={jest.fn()} />)
      expect(queryByTestId('transaction-status-dismiss')).toBeNull()

      const { getByTestId } = render(
        <TransactionStatusModal transaction={buildTransaction({ status: 'failed' })} onClose={jest.fn()} onDismiss={onDismiss} />
      )
      fireEvent.press(getByTestId('transaction-status-dismiss'))

      expect(onDismiss).toHaveBeenCalled()
    })
  })
})
