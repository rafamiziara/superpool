import React from 'react'
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
    await poolStore.fetchPools()
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
    // myPools counts membership *or* ownership, so both have to be trimmed to
    // leave exactly one: mock pool 2 is owned by the mock user.
    poolStore.pools = poolStore.pools.slice(0, 1)
    poolStore.memberships = poolStore.memberships.slice(0, 1)

    const { getByText } = render(<PoolsScreen />)

    expect(getByText("1 circle you're part of")).toBeTruthy()
  })

  it('navigates to the pool detail screen when a card is pressed', () => {
    const { getByTestId } = render(<PoolsScreen />)

    fireEvent.press(getByTestId('pool-card-1'))

    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/1')
  })

  it('opens the create-pool screen from the create-pool card', () => {
    const { getByTestId } = render(<PoolsScreen />)

    fireEvent.press(getByTestId('create-pool-card'))

    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/create')
  })
})
