import React from 'react'
import { LOCALHOST_CHAIN_ID, makePendingTransaction, TX_HASH } from '../../../../src/__tests__/fixtures/pendingTransaction'
import { mockFirebaseCallable, mockWagmiUseAccount } from '../../../../src/__tests__/mocks'
import { mockRouterPush } from '../../../../src/__tests__/setup'
import { act, fireEvent, render, waitFor } from '../../../../src/__tests__/test-utils'
import { pendingTransactionsStore } from '../../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../../src/stores/PoolStore'
import PoolsScreen from './index'

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

/** Makes every callable reject, so a confirmed record survives the drain. */
const failIndexing = () => {
  mockFirebaseCallable.mockReturnValue(jest.fn().mockRejectedValue(new Error('emulator offline')))
}

describe('PoolsScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    // Restored per test rather than reset: `mockFirebaseCallable` is shared by
    // every suite, and resetting it would strip the implementation for good.
    mockFirebaseCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: { poolId: 99, alreadyIndexed: false, stored: true } }))
    mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: LOCALHOST_CHAIN_ID })
    await pendingTransactionsStore.reset()
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
    // leave exactly one: mock pool 2 is owned by the mock user. Memberships are
    // derived from contributions now, so trimming those is what shortens them.
    poolStore.pools = poolStore.pools.slice(0, 1)
    poolStore.contributions = []

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

  describe('pending pools', () => {
    it('shows a pending card for a submitted transaction', async () => {
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

      const { getByTestId } = render(<PoolsScreen />)

      expect(getByTestId(`pending-pool-card-${TX_HASH}`)).toBeTruthy()
      expect(getByTestId('pending-pool-badge-submitted')).toBeTruthy()
    })

    it('shows the syncing state while a confirmed transaction is unindexed', async () => {
      failIndexing()
      await pendingTransactionsStore.addPendingTransaction(
        makePendingTransaction({ status: 'confirmed', result: { poolId: 99, poolAddress: '0xdef' } })
      )

      const { getByTestId } = render(<PoolsScreen />)

      await waitFor(() => expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'indexPool'))
      expect(getByTestId('pending-pool-badge-confirmed')).toBeTruthy()
    })

    it('hides a confirmed transaction once its pool is listed', async () => {
      // The record is deliberately still in the store — indexing fails here — so
      // this proves the screen dedupes rather than the drain having removed it.
      failIndexing()
      const listed = poolStore.pools[0].poolId
      await pendingTransactionsStore.addPendingTransaction(
        makePendingTransaction({ status: 'confirmed', result: { poolId: listed, poolAddress: '0xdef' } })
      )

      const { queryByTestId, getByTestId } = render(<PoolsScreen />)

      await waitFor(() => expect(mockFirebaseCallable).toHaveBeenCalled())
      expect(queryByTestId(`pending-pool-card-${TX_HASH}`)).toBeNull()
      expect(getByTestId(`pool-card-${listed}`)).toBeTruthy()
    })

    it('ignores pending transactions from another chain', async () => {
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ chainId: 80002 }))

      const { queryByTestId } = render(<PoolsScreen />)

      expect(queryByTestId(`pending-pool-card-${TX_HASH}`)).toBeNull()
    })

    it('asks the backend to index transactions confirmed while the app was closed', async () => {
      await pendingTransactionsStore.addPendingTransaction(
        makePendingTransaction({ status: 'confirmed', result: { poolId: 99, poolAddress: '0xdef' } })
      )

      render(<PoolsScreen />)

      await waitFor(() => expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'indexPool'))
      // A successful index drops the local record; the listed pool replaces it.
      await waitFor(() => expect(pendingTransactionsStore.transactions).toHaveLength(0))
    })

    it('dismisses a failed transaction', async () => {
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ status: 'failed' }))

      const { getByTestId, queryByTestId } = render(<PoolsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId(`pending-pool-dismiss-${TX_HASH}`))
      })

      expect(queryByTestId(`pending-pool-card-${TX_HASH}`)).toBeNull()
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })

    it('offers no dismiss action while a transaction is still in flight', async () => {
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

      const { queryByTestId } = render(<PoolsScreen />)

      expect(queryByTestId(`pending-pool-dismiss-${TX_HASH}`)).toBeNull()
    })

    it('opens the status modal from a pending card', async () => {
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction())

      const { getByTestId, getByText, queryByText } = render(<PoolsScreen />)

      expect(queryByText('Creating your pool')).toBeNull()

      fireEvent.press(getByTestId(`pending-pool-card-${TX_HASH}`))

      expect(getByText('Creating your pool')).toBeTruthy()
      expect(getByText('Sent to the network')).toBeTruthy()
    })

    it('removes the transaction when the modal dismisses it', async () => {
      await pendingTransactionsStore.addPendingTransaction(makePendingTransaction({ status: 'failed' }))

      const { getByTestId, queryByTestId } = render(<PoolsScreen />)

      fireEvent.press(getByTestId(`pending-pool-card-${TX_HASH}`))
      await act(async () => {
        fireEvent.press(getByTestId('transaction-status-dismiss'))
      })

      expect(queryByTestId(`pending-pool-card-${TX_HASH}`)).toBeNull()
      expect(pendingTransactionsStore.transactions).toHaveLength(0)
    })
  })

  describe('load states', () => {
    it('shows a loading state on the first load', () => {
      poolStore.reset()
      poolStore.isLoading = true

      const { getByTestId } = render(<PoolsScreen />)

      expect(getByTestId('pools-loading')).toBeTruthy()
    })

    it('keeps the list on screen while a refresh runs', () => {
      poolStore.isRefreshing = true

      const { getByTestId, queryByTestId } = render(<PoolsScreen />)

      expect(queryByTestId('pools-loading')).toBeNull()
      expect(getByTestId('pool-card-1')).toBeTruthy()

      poolStore.isRefreshing = false
    })

    it('refreshes pools and drains confirmed transactions on pull-to-refresh', async () => {
      // Indexing fails on mount so the record is still there to retry, which is
      // the case pull-to-refresh exists for.
      failIndexing()
      poolStore.lastFetchedAt = null
      await pendingTransactionsStore.addPendingTransaction(
        makePendingTransaction({ status: 'confirmed', result: { poolId: 99, poolAddress: '0xdef' } })
      )

      const { getByTestId } = render(<PoolsScreen />)
      // Reached through the ScrollView's prop: a RefreshControl is not rendered
      // as a queryable node, so there is no testID to fire the event on.
      const { onRefresh } = getByTestId('pools-scroll').props.refreshControl.props

      await waitFor(() => expect(mockFirebaseCallable).toHaveBeenCalled())
      mockFirebaseCallable.mockClear()
      await act(async () => {
        await onRefresh()
      })

      expect(poolStore.lastFetchedAt).not.toBeNull()
      expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'indexPool')
    })

    it('shows an empty state when there is nothing to list', () => {
      poolStore.reset()

      const { getByTestId, queryByText } = render(<PoolsScreen />)

      expect(getByTestId('pools-empty')).toBeTruthy()
      expect(getByTestId('create-pool-card')).toBeTruthy()
      // The count line would only say "0 circles" — the empty state says it better.
      expect(queryByText("0 circles you're part of")).toBeNull()
    })
  })

  describe('errors', () => {
    it('takes over the screen when the load failed with nothing cached', () => {
      poolStore.reset()
      poolStore.error = 'Could not reach SuperPool'

      const { getByTestId, getByText } = render(<PoolsScreen />)

      expect(getByTestId('pools-error')).toBeTruthy()
      expect(getByText('Could not reach SuperPool')).toBeTruthy()
    })

    it('retries the load from the error state', async () => {
      poolStore.reset()
      poolStore.error = 'Could not reach SuperPool'

      const { getByTestId } = render(<PoolsScreen />)

      await act(async () => {
        fireEvent.press(getByTestId('pools-error-retry'))
      })

      expect(getByTestId('pools-screen')).toBeTruthy()
      expect(poolStore.error).toBeNull()
    })

    it('degrades to a banner when pools are already on screen', () => {
      poolStore.error = 'Could not reach SuperPool'

      const { getByTestId, queryByTestId } = render(<PoolsScreen />)

      expect(getByTestId('pools-error-banner')).toBeTruthy()
      expect(queryByTestId('pools-error')).toBeNull()
      expect(getByTestId('pool-card-1')).toBeTruthy()
    })
  })
})
