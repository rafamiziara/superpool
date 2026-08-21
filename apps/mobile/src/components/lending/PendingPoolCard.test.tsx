import { fireEvent, render, screen } from '@testing-library/react-native'
import React from 'react'
import { makePendingTransaction, TX_HASH } from '../../__tests__/fixtures/pendingTransaction'
import { PendingPoolCard } from './PendingPoolCard'

describe('PendingPoolCard', () => {
  it('shows the parameters the user entered, formatted as on a live pool', () => {
    render(<PendingPoolCard transaction={makePendingTransaction()} />)

    expect(screen.getByText('Neighbourhood Fund')).toBeTruthy()
    expect(screen.getByText('Micro-loans for the block')).toBeTruthy()
    expect(screen.getByText('100 POL')).toBeTruthy()
    expect(screen.getByText('5%')).toBeTruthy()
    expect(screen.getByText('30 days')).toBeTruthy()
  })

  describe('status', () => {
    it('reads as pending while the network has not confirmed', () => {
      render(<PendingPoolCard transaction={makePendingTransaction()} />)

      expect(screen.getByTestId('pending-pool-badge-submitted')).toBeTruthy()
      expect(screen.getByText('Pending')).toBeTruthy()
      expect(screen.getByTestId(`pending-pool-note-${TX_HASH}`)).toHaveTextContent(/Waiting for the network to confirm/)
    })

    it('reads as syncing once confirmed but not yet listed', () => {
      render(<PendingPoolCard transaction={makePendingTransaction({ status: 'confirmed' })} />)

      expect(screen.getByTestId('pending-pool-badge-confirmed')).toBeTruthy()
      expect(screen.getByText('Syncing')).toBeTruthy()
      expect(screen.getByTestId(`pending-pool-note-${TX_HASH}`)).toHaveTextContent(/Confirmed on chain/)
    })

    it('reads as failed when the transaction did not go through', () => {
      render(<PendingPoolCard transaction={makePendingTransaction({ status: 'failed' })} />)

      expect(screen.getByTestId('pending-pool-badge-failed')).toBeTruthy()
      expect(screen.getByTestId(`pending-pool-note-${TX_HASH}`)).toHaveTextContent(/did not go through/)
    })

    it('spins only while there is still something to wait for', () => {
      const { UNSAFE_queryAllByType, rerender } = render(<PendingPoolCard transaction={makePendingTransaction()} />)
      const ActivityIndicator = require('react-native').ActivityIndicator

      expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(1)

      rerender(<PendingPoolCard transaction={makePendingTransaction({ status: 'failed' })} />)

      expect(UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0)
    })
  })

  it('is keyed by transaction hash, so several can coexist', () => {
    render(<PendingPoolCard transaction={makePendingTransaction()} />)

    expect(screen.getByTestId(`pending-pool-card-${TX_HASH}`)).toBeTruthy()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    render(<PendingPoolCard transaction={makePendingTransaction()} onPress={onPress} />)

    fireEvent.press(screen.getByTestId(`pending-pool-card-${TX_HASH}`))

    expect(onPress).toHaveBeenCalled()
  })

  it('renders without an onPress handler', () => {
    render(<PendingPoolCard transaction={makePendingTransaction()} />)

    fireEvent.press(screen.getByTestId(`pending-pool-card-${TX_HASH}`))

    expect(screen.getByText('Neighbourhood Fund')).toBeTruthy()
  })
})
