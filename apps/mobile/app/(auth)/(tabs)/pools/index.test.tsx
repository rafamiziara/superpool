import React from 'react'
import { mockToast } from '../../../../src/__tests__/mocks'
import { mockRouterPush } from '../../../../src/__tests__/setup'
import { fireEvent, render } from '../../../../src/__tests__/test-utils'
import { poolStore } from '../../../../src/stores/PoolStore'
import PoolsScreen from './index'

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

describe('PoolsScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    await poolStore.loadPools()
  })

  it('renders a card for every pool the user belongs to', () => {
    const { getByTestId } = render(<PoolsScreen />)

    expect(getByTestId('pools-screen')).toBeTruthy()
    for (const pool of poolStore.myPools) {
      expect(getByTestId(`pool-card-${pool.poolId}`)).toBeTruthy()
    }
  })

  it('pluralises the membership count', () => {
    const { getByText } = render(<PoolsScreen />)

    expect(getByText(`${poolStore.myPools.length} circles you're part of`)).toBeTruthy()
  })

  it('uses the singular form for a single pool', () => {
    poolStore.memberships = poolStore.memberships.slice(0, 1)

    const { getByText } = render(<PoolsScreen />)

    expect(getByText("1 circle you're part of")).toBeTruthy()
  })

  it('navigates to the pool detail screen when a card is pressed', () => {
    const { getByTestId } = render(<PoolsScreen />)

    fireEvent.press(getByTestId('pool-card-1'))

    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/1')
  })

  it('shows a coming-soon toast from the create-pool card', () => {
    const { getByTestId } = render(<PoolsScreen />)

    fireEvent.press(getByTestId('create-pool-card'))

    expect(mockToast.show).toHaveBeenCalledWith({ type: 'info', text1: 'Pool creation is coming soon' })
  })
})
