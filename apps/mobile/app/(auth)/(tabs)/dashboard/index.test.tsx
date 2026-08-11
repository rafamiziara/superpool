import React from 'react'
import { LOCALHOST_CHAIN_ID, makePendingTransaction } from '../../../../src/__tests__/fixtures/pendingTransaction'
import { mockWagmiUseAccount } from '../../../../src/__tests__/mocks'
import { mockRouterPush, mockRouterReplace } from '../../../../src/__tests__/setup'
import { MOCK_LOANS } from '../../../../src/mocks/lending'
import { fireEvent, render } from '../../../../src/__tests__/test-utils'
import { pendingTransactionsStore } from '../../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../../src/stores/PoolStore'
import DashboardScreen from './index'

// Mock dependencies
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

describe('DashboardScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: LOCALHOST_CHAIN_ID })
    await pendingTransactionsStore.reset()
    await poolStore.fetchPools()
  })

  it('renders the dashboard structure', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('dashboard-screen')).toBeTruthy()
    expect(getByTestId('dashboard-hero')).toBeTruthy()
    expect(getByTestId('dashboard-pools')).toBeTruthy()
    expect(getByTestId('dashboard-actions')).toBeTruthy()
    expect(getByTestId('dashboard-activity')).toBeTruthy()
  })

  it('shows the total pool balance from the store', () => {
    const { getByText } = render(<DashboardScreen />)

    expect(getByText('601.6')).toBeTruthy()
    expect(getByText('+26.6 POL earned all-time')).toBeTruthy()
  })

  it('renders a macro-card per joined pool', () => {
    const { getByTestId } = render(<DashboardScreen />)

    for (const pool of poolStore.myPools) {
      expect(getByTestId(`pool-card-${pool.poolId}`)).toBeTruthy()
    }
  })

  it('shows the active loan with repay action', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('dashboard-loan')).toBeTruthy()
    expect(getByTestId('repay-button')).toBeTruthy()
  })

  it('renders thumb-zone quick actions', () => {
    const { getByTestId } = render(<DashboardScreen />)

    expect(getByTestId('contribute-button')).toBeTruthy()
    expect(getByTestId('request-loan-button')).toBeTruthy()
  })

  it('sends the contribute action to the pools list, which is where a pool is chosen', () => {
    // The dashboard has no single pool in mind, so it hands over rather than
    // guessing which one the user meant.
    const { getByTestId } = render(<DashboardScreen />)

    fireEvent.press(getByTestId('contribute-button'))

    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/(tabs)/pools')
  })

  it('opens the borrow screen for the pool the active loan came from', () => {
    // Both buttons lead to the same screen: with a loan open there is nothing
    // to choose between borrowing and repaying, so the screen decides.
    const { getByTestId } = render(<DashboardScreen />)
    const poolId = poolStore.activeLoan!.poolId

    fireEvent.press(getByTestId('repay-button'))
    expect(mockRouterPush).toHaveBeenCalledWith(`/(auth)/pool/borrow?poolId=${poolId}`)

    fireEvent.press(getByTestId('request-loan-button'))
    expect(mockRouterPush).toHaveBeenCalledWith(`/(auth)/pool/borrow?poolId=${poolId}`)
  })

  it('sends someone with no loan to the pools list to pick one', () => {
    poolStore.loanRecords = []
    const restore = MOCK_LOANS.splice(0, MOCK_LOANS.length)

    const { getByTestId } = render(<DashboardScreen />)

    fireEvent.press(getByTestId('request-loan-button'))
    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/(tabs)/pools')

    MOCK_LOANS.push(...restore)
  })

  it('navigates from the "see all" links to the matching tabs', () => {
    const { getByTestId } = render(<DashboardScreen />)

    fireEvent.press(getByTestId('see-all-pools'))
    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/(tabs)/pools')

    fireEvent.press(getByTestId('see-all-activity'))
    expect(mockRouterReplace).toHaveBeenCalledWith('/(auth)/(tabs)/activity')
  })

  it('opens the pool detail from a macro-card', () => {
    const { getByTestId } = render(<DashboardScreen />)

    fireEvent.press(getByTestId('pool-card-1'))

    expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/1')
  })

  it('hides the loan section when the user has no active loan', () => {
    // `loans` is derived now, so the fixtures behind it are what has to go.
    poolStore.loanRecords = []
    const restore = MOCK_LOANS.splice(0, MOCK_LOANS.length)

    const { queryByTestId } = render(<DashboardScreen />)

    expect(queryByTestId('dashboard-loan')).toBeNull()
    expect(queryByTestId('repay-button')).toBeNull()

    MOCK_LOANS.push(...restore)
  })

  describe('pending pool creations', () => {
    it('shows no banner when nothing is in flight', () => {
      const { queryByTestId } = render(<DashboardScreen />)

      expect(queryByTestId('pending-transaction-banner')).toBeNull()
    })

    it('reports a pool being created', async () => {
      // The dashboard has no pending pool card, so without this the pool is
      // invisible here until the backend catches up.
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

      const { getByText } = render(<DashboardScreen />)

      expect(getByText('1 pool being created')).toBeTruthy()
    })

    it('opens the status modal from the banner', async () => {
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

      const { getByTestId, getByText, queryByText } = render(<DashboardScreen />)

      expect(queryByText('Creating your pool')).toBeNull()

      fireEvent.press(getByTestId('pending-transaction-banner'))

      expect(getByText('Creating your pool')).toBeTruthy()
    })
  })
})
