import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import type { PendingTransaction } from '../../stores/PendingTransactionsStore'
import { PendingPoolCard } from './PendingPoolCard'

const TX_HASH = '0xaaaa000000000000000000000000000000000000000000000000000000000001'

function makeTransaction(overrides: Partial<PendingTransaction> = {}): PendingTransaction {
  return {
    txHash: TX_HASH,
    chainId: 31337,
    type: 'CREATE_POOL',
    status: 'submitted',
    timestamp: 1_760_000_000_000,
    params: {
      name: 'Neighbourhood Fund',
      description: 'Micro-loans for the block',
      maxLoanAmount: '100000000000000000000',
      interestRate: 500,
      loanDuration: 2_592_000,
    },
    ...overrides,
  }
}

describe('PendingPoolCard', () => {
  it('shows the parameters the user entered, formatted as on a live pool', () => {
    render(<PendingPoolCard transaction={makeTransaction()} />)

    expect(screen.getByText('Neighbourhood Fund')).toBeTruthy()
    expect(screen.getByText('Micro-loans for the block')).toBeTruthy()
    expect(screen.getByText('100 POL')).toBeTruthy()
    expect(screen.getByText('5%')).toBeTruthy()
    expect(screen.getByText('30 days')).toBeTruthy()
  })

  describe('status', () => {
    it('reads as pending while the network has not confirmed', () => {
      render(<PendingPoolCard transaction={makeTransaction()} />)

      expect(screen.getByTestId('pending-pool-badge-submitted')).toBeTruthy()
      expect(screen.getByText('Pending')).toBeTruthy()
      expect(screen.getByTestId(`pending-pool-note-${TX_HASH}`)).toHaveTextContent(/Waiting for the network to confirm/)
    })

    it('reads as syncing once confirmed but not yet listed', () => {
      render(<PendingPoolCard transaction={makeTransaction({ status: 'confirmed' })} />)

      expect(screen.getByTestId('pending-pool-badge-confirmed')).toBeTruthy()
      expect(screen.getByText('Syncing')).toBeTruthy()
      expect(screen.getByTestId(`pending-pool-note-${TX_HASH}`)).toHaveTextContent(/Confirmed on chain/)
    })

    it('reads as failed when the transaction did not go through', () => {
      render(<PendingPoolCard transaction={makeTransaction({ status: 'failed' })} />)

      expect(screen.getByTestId('pending-pool-badge-failed')).toBeTruthy()
      expect(screen.getByTestId(`pending-pool-note-${TX_HASH}`)).toHaveTextContent(/did not go through/)
    })

    it('spins only while there is still something to wait for', () => {
      const { UNSAFE_queryAllByType, rerender } = render(<PendingPoolCard transaction={makeTransaction()} />)
      const ActivityIndicator = require('react-native').ActivityIndicator

      expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1)

      rerender(<PendingPoolCard transaction={makeTransaction({ status: 'failed' })} />)

      expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
    })
  })

  it('is keyed by transaction hash, so several can coexist', () => {
    render(<PendingPoolCard transaction={makeTransaction()} />)

    expect(screen.getByTestId(`pending-pool-card-${TX_HASH}`)).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    render(<PendingPoolCard transaction={makeTransaction()} onPress={onPress} />)

    fireEvent.press(screen.getByTestId(`pending-pool-card-${TX_HASH}`))

    expect(onPress).toHaveBeenCalled()
  })

  it('renders without an onPress handler', () => {
    render(<PendingPoolCard transaction={makeTransaction()} />)

    fireEvent.press(screen.getByTestId(`pending-pool-card-${TX_HASH}`))

    expect(screen.getByText('Neighbourhood Fund')).toBeTruthy()
  })
})
