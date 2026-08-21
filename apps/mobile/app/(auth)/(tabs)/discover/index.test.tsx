import React from 'react'
import { mockFirebaseCallable, mockWagmiUseAccount } from '../../../../src/__tests__/mocks'
import { mockRouterPush } from '../../../../src/__tests__/setup'
import { LOCALHOST_CHAIN_ID } from '../../../../src/__tests__/fixtures/pendingTransaction'
import { act, fireEvent, render } from '../../../../src/__tests__/test-utils'
import { poolStore } from '../../../../src/stores/PoolStore'
import DiscoverScreen from './index'

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

describe('DiscoverScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockFirebaseCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: {} }))
    mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: LOCALHOST_CHAIN_ID })
    await poolStore.fetchPools()
  })

  // The mock user belongs to pools 1–4 and to neither 5 nor 6, which is what
  // makes the fixtures able to exercise this screen at all.
  it('lists the pools the user is not in', () => {
    const { getByTestId, queryByTestId } = render(<DiscoverScreen />)

    expect(getByTestId('discover-screen')).toBeTruthy()
    for (const pool of poolStore.discoverablePools) {
      expect(getByTestId(`discover-pool-card-${pool.poolId}`)).toBeTruthy()
    }
    for (const pool of poolStore.myPools) {
      expect(queryByTestId(`discover-pool-card-${pool.poolId}`)).toBeNull()
    }
  })

  it('counts what it is showing', () => {
    const { getByTestId } = render(<DiscoverScreen />)

    expect(getByTestId('discover-count')).toHaveTextContent(`${poolStore.discoverablePools.length} circles you have not joined`)
  })

  it('opens the pool detail screen when a card is pressed', () => {
    const target = poolStore.discoverablePools[0]

    const { getByTestId } = render(<DiscoverScreen />)

    fireEvent.press(getByTestId(`discover-pool-card-${target.poolId}`))

    expect(mockRouterPush).toHaveBeenCalledWith(`/(auth)/pool/${target.poolId}`)
  })

  // -------------------------------------------------------------------------
  // Search.
  // -------------------------------------------------------------------------

  describe('search', () => {
    it('narrows the list to what matches', () => {
      const { getByTestId, queryByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(getByTestId('discover-search'), 'harvest')

      expect(getByTestId('discover-pool-card-5')).toBeTruthy()
      expect(queryByTestId('discover-pool-card-6')).toBeNull()
    })

    it('matches the description as well as the name', () => {
      const { getByTestId, queryByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(getByTestId('discover-search'), 'riders')

      expect(getByTestId('discover-pool-card-6')).toBeTruthy()
      expect(queryByTestId('discover-pool-card-5')).toBeNull()
    })

    it('never surfaces a pool the user is already in', () => {
      // Searching must not become a back door into the other tab's list.
      const { queryByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(queryByTestId('discover-search')!, 'family')

      expect(queryByTestId('discover-pool-card-2')).toBeNull()
      expect(queryByTestId('discover-no-results')).toBeTruthy()
    })

    it('says so when nothing matches, and offers a way back', () => {
      const { getByTestId, queryByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(getByTestId('discover-search'), 'zzzzz')

      expect(getByTestId('discover-no-results')).toBeTruthy()
      // The "no circles at all" state would be a lie here.
      expect(queryByTestId('discover-empty')).toBeNull()

      fireEvent.press(getByTestId('discover-clear-search'))

      expect(queryByTestId('discover-no-results')).toBeNull()
      expect(getByTestId('discover-pool-card-5')).toBeTruthy()
    })

    it('clears the query from the field itself', () => {
      const { getByTestId, queryByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(getByTestId('discover-search'), 'harvest')
      fireEvent.press(getByTestId('discover-search-clear'))

      expect(getByTestId('discover-pool-card-6')).toBeTruthy()
      expect(queryByTestId('discover-search-clear')).toBeNull()
    })

    it('relabels the count as a search result', () => {
      const { getByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(getByTestId('discover-search'), 'harvest')

      expect(getByTestId('discover-count')).toHaveTextContent('1 circle found')
    })
  })

  // -------------------------------------------------------------------------
  // Sorting.
  // -------------------------------------------------------------------------

  describe('sorting', () => {
    it('starts on newest', () => {
      const { getByTestId } = render(<DiscoverScreen />)

      expect(getByTestId('discover-sort-newest').props.accessibilityState).toMatchObject({ selected: true })
    })

    it('reorders when another mode is chosen', () => {
      // Pool 6 is newer than 5, and pool 5 offers the bigger loans.
      const { getByTestId, getAllByTestId } = render(<DiscoverScreen />)

      const idsInOrder = () =>
        getAllByTestId(/^discover-pool-card-/).map((node) => Number(String(node.props.testID).replace('discover-pool-card-', '')))

      expect(idsInOrder()).toEqual([6, 5])

      fireEvent.press(getByTestId('discover-sort-size'))

      expect(idsInOrder()).toEqual([5, 6])
    })

    it('marks the chosen mode and unmarks the previous one', () => {
      const { getByTestId } = render(<DiscoverScreen />)

      fireEvent.press(getByTestId('discover-sort-rate'))

      expect(getByTestId('discover-sort-rate').props.accessibilityState).toMatchObject({ selected: true })
      expect(getByTestId('discover-sort-newest').props.accessibilityState).toMatchObject({ selected: false })
    })

    it('keeps the sort while searching', () => {
      const { getByTestId } = render(<DiscoverScreen />)

      fireEvent.press(getByTestId('discover-sort-size'))
      fireEvent.changeText(getByTestId('discover-search'), 'e')

      expect(getByTestId('discover-sort-size').props.accessibilityState).toMatchObject({ selected: true })
    })
  })

  // -------------------------------------------------------------------------
  // Nothing to discover.
  // -------------------------------------------------------------------------

  describe('empty', () => {
    it('says the user is in everything, rather than that nothing exists', () => {
      poolStore.pools = poolStore.myPools

      const { getByTestId, queryByTestId } = render(<DiscoverScreen />)

      expect(getByTestId('discover-empty')).toBeTruthy()
      expect(queryByTestId('discover-count')).toBeNull()
    })

    it('offers creating a pool as the way out', () => {
      poolStore.pools = poolStore.myPools

      const { getByTestId } = render(<DiscoverScreen />)

      fireEvent.press(getByTestId('discover-create'))

      expect(mockRouterPush).toHaveBeenCalledWith('/(auth)/pool/create')
    })

    it('names the chain it found nothing on', () => {
      poolStore.pools = poolStore.myPools

      const { getByText } = render(<DiscoverScreen />)

      expect(getByText('No other circles on Localhost')).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // Which chain the screen is showing.
  // -------------------------------------------------------------------------

  describe('the network', () => {
    it('names the connected chain', () => {
      const { getByTestId } = render(<DiscoverScreen />)

      expect(getByTestId('discover-network')).toBeTruthy()
    })

    it('follows the wallet rather than the default', () => {
      mockWagmiUseAccount.mockReturnValue({ isConnected: true, isConnecting: false, address: undefined, chainId: 80002 })

      const { getByText } = render(<DiscoverScreen />)

      expect(getByText('Polygon Amoy')).toBeTruthy()
    })

    it('stays on screen when a search found nothing', () => {
      // The user is looking at an empty result on a specific chain; which one
      // is part of why it is empty.
      const { getByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(getByTestId('discover-search'), 'nothing matches this')

      expect(getByTestId('discover-no-results')).toBeTruthy()
      expect(getByTestId('discover-network')).toBeTruthy()
    })
  })

  // -------------------------------------------------------------------------
  // Searching past the page the device holds.
  // -------------------------------------------------------------------------

  describe('searching past the loaded page', () => {
    /** A pool the fixtures never loaded, which is the whole point of asking. */
    const REMOTE_POOL = {
      poolId: 99,
      poolAddress: '0xB30dAf0240261Be564Cea33260F01213c47AAa0D',
      poolOwner: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      name: 'Builders Guild',
      description: 'Tools and rent',
      maxLoanAmount: '10000000000000000000',
      interestRate: 500,
      loanDuration: 2_592_000,
      chainId: LOCALHOST_CHAIN_ID,
      createdBy: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
      createdAt: '2026-08-10T07:10:36.642Z',
      transactionHash: '0xaaaa',
      isActive: true,
    }

    beforeEach(() => {
      // The backend is skipped entirely on mock pools, so the search path is
      // unreachable with them on.
      delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
      process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
      poolStore.clearPoolSearch()
    })

    it('asks the backend once for a word rather than once per keystroke', async () => {
      const search = jest.fn().mockResolvedValue({ data: { pools: [] } })
      mockFirebaseCallable.mockReturnValue(search)

      const { getByTestId } = render(<DiscoverScreen />)

      for (const term of ['g', 'gu', 'gui', 'guil', 'guild']) {
        fireEvent.changeText(getByTestId('discover-search'), term)
      }

      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      expect(search).toHaveBeenCalledTimes(1)
      expect(search).toHaveBeenCalledWith(expect.objectContaining({ searchTerm: 'guild' }))
    })

    it('does not ask while the user is still typing', () => {
      const search = jest.fn().mockResolvedValue({ data: { pools: [] } })
      mockFirebaseCallable.mockReturnValue(search)

      const { getByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(getByTestId('discover-search'), 'guild')

      act(() => {
        jest.advanceTimersByTime(200)
      })

      expect(search).not.toHaveBeenCalled()
    })

    it('shows a pool the loaded page never held', async () => {
      // The point of the feature: before this, a pool past the newest fifty was
      // unfindable no matter what the user typed.
      mockFirebaseCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: { pools: [REMOTE_POOL] } }))

      const { getByTestId, queryByTestId } = render(<DiscoverScreen />)

      expect(queryByTestId('discover-pool-card-99')).toBeNull()

      fireEvent.changeText(getByTestId('discover-search'), 'builders')

      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      expect(getByTestId('discover-pool-card-99')).toBeTruthy()
    })

    it('says it is looking rather than that nothing matches', async () => {
      // A search still in flight is not an answer. Saying "nothing matches"
      // before the result arrives tells the user their pool does not exist and
      // then contradicts itself a moment later.
      let release: (value: unknown) => void = () => {}
      mockFirebaseCallable.mockReturnValue(jest.fn().mockImplementation(() => new Promise((resolve) => (release = resolve))))

      const { getByTestId, queryByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(getByTestId('discover-search'), 'zzzzz')

      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      expect(getByTestId('discover-searching')).toBeTruthy()
      expect(queryByTestId('discover-no-results')).toBeNull()

      await act(async () => {
        release({ data: { pools: [] } })
      })

      expect(queryByTestId('discover-searching')).toBeNull()
      expect(getByTestId('discover-no-results')).toBeTruthy()
    })

    it('forgets the results when the box is emptied', async () => {
      mockFirebaseCallable.mockReturnValue(jest.fn().mockResolvedValue({ data: { pools: [REMOTE_POOL] } }))

      const { getByTestId, queryByTestId } = render(<DiscoverScreen />)

      fireEvent.changeText(getByTestId('discover-search'), 'builders')

      await act(async () => {
        jest.advanceTimersByTime(300)
      })

      expect(getByTestId('discover-pool-card-99')).toBeTruthy()

      fireEvent.press(getByTestId('discover-search-clear'))

      expect(queryByTestId('discover-pool-card-99')).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // Refreshing.
  // -------------------------------------------------------------------------

  it('reaches the chain on pull-to-refresh, not just Firestore', async () => {
    // This list is mostly other people's pools, so what it is missing is
    // precisely the events this device never had a reason to index. Mock pools
    // are off because the sweep is deliberately skipped on them.
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS
    mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => {
      if (name === 'listPools') {
        return jest.fn().mockResolvedValue({
          data: { pools: [], totalCount: 0, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
        })
      }
      if (name === 'listContributions') return jest.fn().mockResolvedValue({ data: { contributions: [], totalCount: 0, limit: 50 } })
      if (name === 'listWithdrawals') return jest.fn().mockResolvedValue({ data: { withdrawals: [], totalCount: 0, limit: 50 } })
      if (name === 'listMembers') return jest.fn().mockResolvedValue({ data: { members: [], totalCount: 0, limit: 50 } })

      return jest.fn().mockResolvedValue({ data: { caughtUp: true, pools: 0, contributions: 0, withdrawals: 0 } })
    })

    const { getByTestId } = render(<DiscoverScreen />)
    // Reached through the ScrollView's prop: a RefreshControl is not rendered
    // as a queryable node, so there is no testID to fire the event on.
    const { onRefresh } = getByTestId('discover-scroll').props.refreshControl.props

    await act(async () => {
      await onRefresh()
    })

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'syncPoolEventsNow')

    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
  })
})
