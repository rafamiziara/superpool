import React from 'react'
import { mockToast } from '../../../src/__tests__/mocks'
import { mockLocalSearchParams, mockRouterBack } from '../../../src/__tests__/setup'
import { fireEvent, render } from '../../../src/__tests__/test-utils'
import { poolStore } from '../../../src/stores/PoolStore'
import PoolDetailScreen from './[id]'

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

/** Pool 1 is owned by someone else; pool 2 is owned by the mock user. */
const OTHER_OWNED = '1'
const SELF_OWNED = '2'

describe('PoolDetailScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockLocalSearchParams.mockReturnValue({ id: OTHER_OWNED })
    await poolStore.fetchPools()
  })

  it('renders the pool detail for the route param', () => {
    const { getByTestId, getByText } = render(<PoolDetailScreen />)

    // The pool name is header config (`Stack.Screen options`), so assert on body copy.
    expect(getByTestId('pool-detail-screen')).toBeTruthy()
    expect(getByText(poolStore.poolById(Number(OTHER_OWNED))!.description)).toBeTruthy()
  })

  it('shows the contract-derived stats', () => {
    const { getByText } = render(<PoolDetailScreen />)

    expect(getByText('500 POL')).toBeTruthy() // max loan
    expect(getByText('4.5%')).toBeTruthy() // 450 bps
    expect(getByText('30 days')).toBeTruthy()
    expect(getByText('Polygon Amoy')).toBeTruthy()
  })

  it('shows the abbreviated owner address when the user is not the owner', () => {
    const { getByText, queryByText } = render(<PoolDetailScreen />)

    expect(getByText('Managed by')).toBeTruthy()
    expect(getByText('0x3F8a…b9a0')).toBeTruthy()
    expect(queryByText('Managed by you')).toBeNull()
  })

  it('shows the admin badge when the user owns the pool', () => {
    mockLocalSearchParams.mockReturnValue({ id: SELF_OWNED })

    const { getByText } = render(<PoolDetailScreen />)

    expect(getByText('Managed by you')).toBeTruthy()
    expect(getByText('Admin')).toBeTruthy()
  })

  it('shows the membership position card', () => {
    const { getByText } = render(<PoolDetailScreen />)

    expect(getByText('Your position')).toBeTruthy()
    expect(getByText('195.4 POL')).toBeTruthy() // current balance
    expect(getByText('180 POL')).toBeTruthy() // total contributed
  })

  it('renders the pool activity feed', () => {
    const { getByText, getByTestId } = render(<PoolDetailScreen />)

    expect(getByText('Pool activity')).toBeTruthy()
    for (const tx of poolStore.transactionsFor(Number(OTHER_OWNED))) {
      expect(getByTestId(`activity-row-${tx.id}`)).toBeTruthy()
    }
  })

  it('shows coming-soon toasts from the action bar', () => {
    const { getByTestId } = render(<PoolDetailScreen />)

    fireEvent.press(getByTestId('pool-contribute-button'))
    expect(mockToast.show).toHaveBeenCalledWith({ type: 'info', text1: 'Contributing is coming soon' })

    fireEvent.press(getByTestId('pool-request-loan-button'))
    expect(mockToast.show).toHaveBeenCalledWith({ type: 'info', text1: 'Loan request is coming soon' })
  })

  it('falls back to a not-found state for an unknown pool', () => {
    mockLocalSearchParams.mockReturnValue({ id: '9999' })

    const { getByTestId, queryByTestId } = render(<PoolDetailScreen />)

    expect(getByTestId('pool-not-found')).toBeTruthy()
    expect(queryByTestId('pool-detail-screen')).toBeNull()
  })

  it('goes back from the not-found state', () => {
    mockLocalSearchParams.mockReturnValue({ id: '9999' })

    const { getByText } = render(<PoolDetailScreen />)
    fireEvent.press(getByText('Go back'))

    expect(mockRouterBack).toHaveBeenCalled()
  })
})
