import type { LoanInfo, LoanRepaymentInfo, MemberInfo, PoolInfo } from '@superpool/types'
import { LoanStatus, MemberStatus, TransactionStatus, TransactionType } from '@superpool/types'
import { parseEther } from 'viem'
import { mockFirebaseCallable } from '../__tests__/mocks'
import { MOCK_USER_ADDRESS } from '../mocks/lending'
import { authStore } from './AuthStore'
import { createPoolStore, type PoolStoreApi } from './PoolStore'

describe('PoolStore', () => {
  let store: PoolStoreApi

  beforeEach(async () => {
    store = createPoolStore()
    await store.getState().fetchPools()
  })

  it('starts empty before loading', () => {
    expect(createPoolStore().getState().pools).toHaveLength(0)
  })

  it('loads pools, memberships, loans and transactions', () => {
    expect(store.getState().pools.length).toBeGreaterThan(0)
    expect(store.getState().memberships().length).toBeGreaterThan(0)
    expect(store.getState().loans().length).toBeGreaterThan(0)
    expect(store.getState().transactions.length).toBeGreaterThan(0)
    expect(store.getState().isLoading).toBe(false)
  })

  it('exposes the pools the user belongs to', () => {
    expect(
      store
        .getState()
        .myPools()
        .map((pool) => pool.poolId)
    ).toEqual([1, 2, 3, 4, 7])
  })

  it('sums balances of active memberships only, in the chain’s own coin', () => {
    // 195.4 + 331.2 + 75 (pending membership excluded). Pool 7 is denominated
    // in USDC and is deliberately not in this figure: adding 1,214 USDC to a
    // POL total would be wrong by whatever the exchange rate happens to be.
    expect(store.getState().totalBalance()).toBe(parseEther('601.6'))
  })

  it('reports a balance per unit rather than one impossible total', () => {
    const balances = store.getState().balancesByDenomination()

    expect(balances).toEqual([
      { denomination: { symbol: 'POL', decimals: 18 }, total: parseEther('601.6') },
      { denomination: expect.objectContaining({ symbol: 'USDC', decimals: 6 }), total: 1_214_500_000n },
    ])
  })

  it('keeps the chain’s own coin first and present even with nothing in it', () => {
    // The dashboard's headline figure. A headline that vanishes because the
    // user holds no POL reads as having lost the money.
    const empty = createPoolStore()

    expect(empty.getState().balancesByDenomination()).toEqual([{ denomination: { symbol: 'POL', decimals: 18 }, total: 0n }])
    expect(empty.getState().totalBalance()).toBe(0n)
  })

  it('keeps lifetime earnings in the unit the headline is in', () => {
    // Interest is paid in whatever the pool lends, so a claim from a USDC pool
    // cannot be added to one from a POL pool — the same reason `totalBalance`
    // is native-only. The dashboard shows this figure beside the native
    // headline, so native is the unit it has to be in.
    store.getState().claimableByPool = { 1: parseEther('2').toString(), 7: '5000000' }

    expect(store.getState().claimableInterest()).toBe(parseEther('2'))
  })

  it('reports no earnings until something says otherwise', () => {
    // Interest is no longer inferred from a balance exceeding what was
    // contributed — that was a stand-in for accounting the contract did not
    // have. It is claims plus what the chain says is still claimable, and the
    // mock fixtures carry neither.
    expect(store.getState().totalEarned()).toBe(0n)
  })

  it('adds what is still claimable to what has already been claimed', () => {
    // The two must be added, not chosen between: claiming moves an amount from
    // one to the other, so reporting either alone would make lifetime earnings
    // drop the moment someone takes their money.
    store.getState().interestClaims = [
      {
        id: '31337-0xaaa-0',
        poolId: 1,
        poolAddress: '0xPool',
        account: MOCK_USER_ADDRESS.toLowerCase(),
        amount: parseEther('2').toString(),
        chainId: 31337,
        transactionHash: '0xaaa',
        logIndex: 0,
        blockNumber: 1,
        claimedAt: '2026-08-12T00:00:00.000Z',
      },
    ]
    store.getState().setClaimable(1, parseEther('3'))

    expect(store.getState().claimedInterest()).toBe(parseEther('2'))
    expect(store.getState().claimableInterest()).toBe(parseEther('3'))
    expect(store.getState().totalEarned()).toBe(parseEther('5'))
  })

  it("ignores another wallet's claims", () => {
    store.getState().interestClaims = [
      {
        id: '31337-0xbbb-0',
        poolId: 1,
        poolAddress: '0xPool',
        account: '0x000000000000000000000000000000000000dead',
        amount: parseEther('9').toString(),
        chainId: 31337,
        transactionHash: '0xbbb',
        logIndex: 0,
        blockNumber: 1,
        claimedAt: '2026-08-12T00:00:00.000Z',
      },
    ]

    expect(store.getState().totalEarned()).toBe(0n)
  })

  it('finds the active (disbursed) loan for the user', () => {
    const loan = store.getState().activeLoan()
    expect(loan?.status).toBe(LoanStatus.DISBURSED)
    expect(loan?.borrower).toBe(MOCK_USER_ADDRESS)
  })

  it('finds the pending loan request', () => {
    expect(store.getState().pendingLoan()?.status).toBe(LoanStatus.REQUESTED)
  })

  it('looks up pools and memberships by id', () => {
    expect(store.getState().poolById(2)?.name).toBe('Family Circle')
    expect(store.getState().poolById(99)).toBeUndefined()
    expect(store.getState().membershipFor(4)?.status).toBe(MemberStatus.PENDING)
  })

  it('sorts recent transactions newest first', () => {
    const times = store
      .getState()
      .recentTransactions()
      .map((tx) => tx.createdAt.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('filters transactions by pool', () => {
    expect(
      store
        .getState()
        .transactionsFor(2)
        .every((tx) => tx.poolId === '2')
    ).toBe(true)
    expect(store.getState().transactionsFor(2).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// The `listPools` path. Screens run on mock pools (see __tests__/setup), so
// these opt out for the duration of the suite.
// ---------------------------------------------------------------------------

const LIVE_POOL = {
  poolId: 12,
  poolAddress: '0xB30dAf0240261Be564Cea33260F01213c47AAa0D',
  poolOwner: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  name: 'Live Pool',
  description: 'From the backend',
  maxLoanAmount: '10000000000000000000',
  interestRate: 500,
  loanDuration: 2_592_000,
  chainId: 31337,
  createdBy: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  // Callables serialise dates to strings; the store has to revive them.
  createdAt: '2026-08-10T07:10:36.642Z',
  transactionHash: '0xaaaa',
  isActive: true,
}

/** One deposit into `LIVE_POOL`, as `listContributions` returns it. */
const LIVE_CONTRIBUTION = {
  id: '31337-0xbbbb-0',
  poolId: 12,
  poolAddress: LIVE_POOL.poolAddress,
  // Lowercased, as the indexer stores it.
  contributor: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  amount: '2000000000000000000',
  chainId: 31337,
  transactionHash: '0xbbbb',
  logIndex: 0,
  blockNumber: 101,
  contributedAt: '2026-08-10T08:00:00.000Z',
}

/** One membership in `LIVE_POOL`, as `listMembers` returns it. */
const LIVE_MEMBER = {
  id: '31337-12-0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  poolId: 12,
  poolAddress: LIVE_POOL.poolAddress,
  // Lowercased, as the indexer stores it.
  account: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  status: 'active' as const,
  joinedAt: '2026-08-10T07:30:00.000Z',
  chainId: 31337,
  transactionHash: '0xcccc',
  blockNumber: 100,
}

/** One withdrawal out of `LIVE_POOL`, as `listWithdrawals` returns it. */
const LIVE_WITHDRAWAL = {
  id: '31337-0xcccc-0',
  poolId: 12,
  poolAddress: LIVE_POOL.poolAddress,
  // Lowercased, as the indexer stores it.
  member: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  amount: '500000000000000000',
  chainId: 31337,
  transactionHash: '0xcccc',
  logIndex: 0,
  blockNumber: 102,
  withdrawnAt: '2026-08-10T09:00:00.000Z',
}

describe('PoolStore against listPools', () => {
  let store: PoolStoreApi
  let listPoolsCallable: jest.Mock
  let listContributionsCallable: jest.Mock
  let listWithdrawalsCallable: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: 31337 })

    store = createPoolStore()
    listPoolsCallable = jest.fn().mockResolvedValue({
      data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
    })
    listContributionsCallable = jest.fn().mockResolvedValue({
      data: { contributions: [], totalCount: 0, limit: 50 },
    })
    listWithdrawalsCallable = jest.fn().mockResolvedValue({
      data: { withdrawals: [], totalCount: 0, limit: 50 },
    })
    // A load calls all three callables, so the mock has to answer by name — a
    // single stub would hand the pools response to the contributions request.
    mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => {
      if (name === 'listContributions') return listContributionsCallable
      if (name === 'listWithdrawals') return listWithdrawalsCallable
      return listPoolsCallable
    })
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: null })
  })

  it('asks the backend for the connected chain', async () => {
    await store.getState().fetchPools()

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'listPools')
    expect(listPoolsCallable).toHaveBeenCalledWith({ chainId: 31337, activeOnly: true, limit: 50 })
  })

  it('lets the caller override the defaults', async () => {
    await store.getState().fetchPools({ activeOnly: false, limit: 10, ownerAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' })

    expect(listPoolsCallable).toHaveBeenCalledWith({
      chainId: 31337,
      activeOnly: false,
      limit: 10,
      ownerAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    })
  })

  describe('searching for pools beyond the loaded page', () => {
    /** A pool the page never held, which is the whole point of asking. */
    const REMOTE_POOL = { ...LIVE_POOL, poolId: 99, name: 'Builders Guild', description: 'Tools and rent' }

    it('sends the term as typed, on the connected chain', async () => {
      // Raw rather than normalised: the backend folds it the same way it built
      // the tokens, so there is one implementation rather than two.
      await store.getState().searchPools('Builders')

      expect(listPoolsCallable).toHaveBeenCalledWith({ chainId: 31337, activeOnly: true, limit: 50, searchTerm: 'Builders' })
    })

    it('keeps the results apart from the loaded pools', async () => {
      // `pools` is what every balance, liquidity figure and `myPools` derives
      // from. Replacing it with a search result would empty the Pools tab while
      // somebody typed in Discover.
      await store.getState().fetchPools()
      listPoolsCallable.mockResolvedValue({
        data: { pools: [REMOTE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
      })

      await store.getState().searchPools('builders')

      expect(store.getState().pools.map((pool) => pool.poolId)).toEqual([12])
      expect(store.getState().poolSearchResults.map((pool) => pool.poolId)).toEqual([99])
    })

    it('offers the loaded page and the results together, without repeating one', async () => {
      await store.getState().fetchPools()
      listPoolsCallable.mockResolvedValue({
        data: {
          pools: [LIVE_POOL, REMOTE_POOL],
          totalCount: 2,
          page: 1,
          limit: 50,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })

      await store.getState().searchPools('pool')

      expect(
        store
          .getState()
          .discoverableMatches()
          .map((pool) => pool.poolId)
      ).toEqual([12, 99])
    })

    it('never surfaces a pool the user is already in', async () => {
      // The partition Discover and Pools are defined by. A search is exactly
      // how a pool the user belongs to would otherwise leak into a list of
      // strangers.
      authStore.setState({ walletAddress: LIVE_POOL.poolOwner })
      await store.getState().fetchPools()
      listPoolsCallable.mockResolvedValue({
        data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
      })

      await store.getState().searchPools('live')

      expect(
        store
          .getState()
          .myPools()
          .map((pool) => pool.poolId)
      ).toEqual([12])
      expect(store.getState().discoverableMatches()).toEqual([])
    })

    it('keeps the previous results when a search fails', async () => {
      // The screen is still showing the cached page filtered locally, which is
      // what it showed before search existed. Degrading to that beats putting
      // an error where results were.
      listPoolsCallable.mockResolvedValue({
        data: { pools: [REMOTE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
      })
      await store.getState().searchPools('builders')

      listPoolsCallable.mockRejectedValue(new Error('functions/unavailable'))
      await store.getState().searchPools('builder')

      expect(store.getState().poolSearchResults.map((pool) => pool.poolId)).toEqual([99])
      expect(store.getState().error).toBeNull()
    })

    it('forgets the results when the box is emptied', async () => {
      listPoolsCallable.mockResolvedValue({
        data: { pools: [REMOTE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
      })
      await store.getState().searchPools('builders')

      store.getState().clearPoolSearch()

      expect(store.getState().poolSearchResults).toEqual([])
    })

    it('reports when a search is in flight, without blanking the list', async () => {
      let release: (value: unknown) => void = () => {}
      listPoolsCallable.mockImplementation(() => new Promise((resolve) => (release = resolve)))

      const pending = store.getState().searchPools('builders')

      expect(store.getState().isSearchingPools).toBe(true)
      expect(store.getState().isLoading).toBe(false)

      release({ data: { pools: [], totalCount: 0, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false } })
      await pending

      expect(store.getState().isSearchingPools).toBe(false)
    })
  })

  it('stores what the backend returned', async () => {
    await store.getState().fetchPools()

    expect(store.getState().pools).toHaveLength(1)
    expect(store.getState().pools[0].name).toBe('Live Pool')
    expect(store.getState().poolCount()).toBe(1)
    expect(store.getState().isEmpty()).toBe(false)
    expect(store.getState().lastFetchedAt).toBeInstanceOf(Date)
  })

  it('keeps createdAt as the ISO string the callable sends', async () => {
    await store.getState().fetchPools()

    // Not a Date: a Date returned from a callable serialises to `{}`, so the
    // wire type is a string and stays one.
    expect(store.getState().pools[0].createdAt).toBe(LIVE_POOL.createdAt)
    expect(new Date(store.getState().pools[0].createdAt).getTime()).not.toBeNaN()
  })

  it('reports a failure instead of throwing at the screen', async () => {
    listPoolsCallable.mockRejectedValue(new Error('functions/unavailable'))

    await expect(store.getState().fetchPools()).resolves.toBeUndefined()

    expect(store.getState().error).toBe('functions/unavailable')
    expect(store.getState().hasError()).toBe(true)
    expect(store.getState().isLoading).toBe(false)
    expect(store.getState().pools).toHaveLength(0)
    expect(store.getState().isEmpty()).toBe(true)
  })

  it('clears a previous failure on the next attempt', async () => {
    listPoolsCallable.mockRejectedValueOnce(new Error('functions/unavailable'))
    await store.getState().fetchPools()
    expect(store.getState().hasError()).toBe(true)

    await store.getState().fetchPools()

    expect(store.getState().hasError()).toBe(false)
    expect(store.getState().pools).toHaveLength(1)
  })

  it('keeps the list on screen while refreshing', async () => {
    await store.getState().fetchPools()
    let seenDuringRefresh: { pools: number; isRefreshing: boolean; isLoading: boolean } | null = null
    listPoolsCallable.mockImplementation(() => {
      seenDuringRefresh = {
        pools: store.getState().pools.length,
        isRefreshing: store.getState().isRefreshing,
        isLoading: store.getState().isLoading,
      }
      return Promise.resolve({
        data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
      })
    })

    await store.getState().refreshPools()

    expect(seenDuringRefresh).toEqual({ pools: 1, isRefreshing: true, isLoading: false })
  })

  it('counts a pool the connected wallet owns as one of mine, whatever the casing', async () => {
    authStore.setState({ walletAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' })

    await store.getState().fetchPools()

    expect(
      store
        .getState()
        .myPools()
        .map((pool) => pool.poolId)
    ).toEqual([12])
  })

  it('does not claim pools owned by someone else', async () => {
    authStore.setState({ walletAddress: '0x0000000000000000000000000000000000000001' })

    await store.getState().fetchPools()

    expect(store.getState().myPools()).toHaveLength(0)
  })

  it('claims nothing when no wallet is connected', async () => {
    await store.getState().fetchPools()

    expect(store.getState().userAddress()).toBe('')
    expect(store.getState().myPools()).toHaveLength(0)
  })

  it('reset clears everything', async () => {
    await store.getState().fetchPools()

    store.getState().reset()

    expect(store.getState().pools).toHaveLength(0)
    expect(store.getState().memberships()).toHaveLength(0)
    expect(store.getState().lastFetchedAt).toBeNull()
    expect(store.getState().error).toBeNull()
  })

  it('falls back to the default chain when the wallet reports none', async () => {
    authStore.setState({ chainId: null })

    await store.getState().fetchPools()

    expect(listPoolsCallable).toHaveBeenCalledWith(expect.objectContaining({ chainId: 31337 }))
  })

  it('handles an empty backend response', async () => {
    listPoolsCallable.mockResolvedValue({
      data: { pools: [] as PoolInfo[], totalCount: 0, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
    })

    await store.getState().fetchPools()

    expect(store.getState().isEmpty()).toBe(true)
    expect(store.getState().hasError()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Contributions, and the memberships derived from them.
// ---------------------------------------------------------------------------

describe('PoolStore contributions', () => {
  const CONTRIBUTOR = LIVE_CONTRIBUTION.contributor
  const OTHER_WALLET = '0x0000000000000000000000000000000000000009'

  let store: PoolStoreApi
  let listContributionsCallable: jest.Mock
  let listWithdrawalsCallable: jest.Mock
  let listMembersCallable: jest.Mock

  /** Seeds the backend with `contributions` (and optionally withdrawals) and loads. */
  async function loadWith(contributions: (typeof LIVE_CONTRIBUTION)[], withdrawals: (typeof LIVE_WITHDRAWAL)[] = []) {
    listContributionsCallable.mockResolvedValue({
      data: { contributions, totalCount: contributions.length, limit: 50 },
    })
    listWithdrawalsCallable.mockResolvedValue({
      data: { withdrawals, totalCount: withdrawals.length, limit: 50 },
    })
    await store.getState().fetchPools()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: 31337 })

    store = createPoolStore()
    const listPoolsCallable = jest.fn().mockResolvedValue({
      data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
    })
    listContributionsCallable = jest.fn().mockResolvedValue({ data: { contributions: [], totalCount: 0, limit: 50 } })
    listWithdrawalsCallable = jest.fn().mockResolvedValue({ data: { withdrawals: [], totalCount: 0, limit: 50 } })
    listMembersCallable = jest.fn().mockResolvedValue({ data: { members: [], totalCount: 0, limit: 50 } })
    mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => {
      if (name === 'listContributions') return listContributionsCallable
      if (name === 'listWithdrawals') return listWithdrawalsCallable
      if (name === 'listMembers') return listMembersCallable
      return listPoolsCallable
    })
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: null })
  })

  it('asks the backend for the connected chain', async () => {
    await store.getState().fetchPools()

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'listContributions')
    expect(listContributionsCallable).toHaveBeenCalledWith({ chainId: 31337, limit: 50 })
  })

  it('does not filter by wallet, so other members count towards pool liquidity', async () => {
    // A pool's liquidity is what everyone put in, and it is shown on pools the
    // user has not contributed to.
    await store.getState().fetchPools()

    expect(listContributionsCallable).toHaveBeenCalledWith(expect.not.objectContaining({ contributor: expect.anything() }))
  })

  it('sums a pool’s liquidity across contributors', async () => {
    await loadWith([
      LIVE_CONTRIBUTION,
      { ...LIVE_CONTRIBUTION, id: '31337-0xcccc-0', transactionHash: '0xcccc', contributor: OTHER_WALLET, amount: '3000000000000000000' },
    ])

    expect(store.getState().poolLiquidity(12)).toBe(parseEther('5'))
  })

  it('reports zero liquidity for a pool nobody has funded', async () => {
    await loadWith([])

    expect(store.getState().poolLiquidity(12)).toBe(0n)
  })

  it('lists the contributions into one pool', async () => {
    await loadWith([LIVE_CONTRIBUTION, { ...LIVE_CONTRIBUTION, id: 'other', poolId: 99 }])

    expect(store.getState().contributionsFor(12)).toHaveLength(1)
    expect(store.getState().contributionsFor(12)[0].id).toBe(LIVE_CONTRIBUTION.id)
  })

  it('derives a membership from a contribution', async () => {
    // There is no membership register on chain, so funding a pool is what makes
    // someone a member of it.
    authStore.setState({ walletAddress: CONTRIBUTOR })
    await loadWith([LIVE_CONTRIBUTION])

    const membership = store.getState().membershipFor(12)
    expect(membership?.totalContributed).toBe(parseEther('2'))
    expect(membership?.currentBalance).toBe(parseEther('2'))
    expect(membership?.status).toBe(MemberStatus.ACTIVE)
  })

  it('sums repeat deposits into one membership', async () => {
    authStore.setState({ walletAddress: CONTRIBUTOR })
    await loadWith([
      LIVE_CONTRIBUTION,
      { ...LIVE_CONTRIBUTION, id: '31337-0xdddd-0', transactionHash: '0xdddd', amount: '1000000000000000000' },
    ])

    expect(store.getState().memberships()).toHaveLength(1)
    expect(store.getState().membershipFor(12)?.totalContributed).toBe(parseEther('3'))
  })

  it('dates a membership from the first deposit, not the most recent', async () => {
    authStore.setState({ walletAddress: CONTRIBUTOR })
    await loadWith([
      LIVE_CONTRIBUTION,
      { ...LIVE_CONTRIBUTION, id: 'earlier', transactionHash: '0xeeee', contributedAt: '2026-01-01T00:00:00.000Z' },
    ])

    expect(store.getState().membershipFor(12)?.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('keeps one membership per wallet per pool', async () => {
    await loadWith([LIVE_CONTRIBUTION, { ...LIVE_CONTRIBUTION, id: 'other-wallet', contributor: OTHER_WALLET }])

    expect(store.getState().memberships()).toHaveLength(2)
  })

  it('matches the connected wallet case-insensitively', async () => {
    // The indexer stores addresses lowercased; wallets report them checksummed.
    authStore.setState({ walletAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' })
    await loadWith([LIVE_CONTRIBUTION])

    expect(store.getState().membershipFor(12)).toBeDefined()
  })

  it('marks the pool owner as an admin of their own pool', async () => {
    // LIVE_POOL's owner is the contributor in this fixture.
    await loadWith([LIVE_CONTRIBUTION])

    expect(store.getState().memberships()[0].isAdmin).toBe(true)
  })

  it('does not mark an ordinary contributor as an admin', async () => {
    await loadWith([{ ...LIVE_CONTRIBUTION, contributor: OTHER_WALLET }])

    expect(store.getState().memberships()[0].isAdmin).toBe(false)
  })

  it('shows a contribution as activity instead of a fixture', async () => {
    // Activity used to be MOCK_TRANSACTIONS regardless of what was indexed.
    await loadWith([LIVE_CONTRIBUTION])

    expect(store.getState().recentTransactions()).toHaveLength(1)
    const [activity] = store.getState().recentTransactions()
    expect(activity.id).toBe(LIVE_CONTRIBUTION.id)
    expect(activity.type).toBe(TransactionType.CONTRIBUTION)
    expect(activity.status).toBe(TransactionStatus.CONFIRMED)
    expect(activity.amount).toBe(parseEther('2'))
    expect(activity.from).toBe(CONTRIBUTOR)
    expect(activity.poolId).toBe('12')
    expect(activity.txHash).toBe(LIVE_CONTRIBUTION.transactionHash)
    expect(activity.createdAt).toEqual(new Date(LIVE_CONTRIBUTION.contributedAt))
  })

  it('shows no activity when nothing has been indexed', async () => {
    await loadWith([])

    expect(store.getState().recentTransactions()).toEqual([])
  })

  it('sorts derived activity newest first', async () => {
    await loadWith([
      LIVE_CONTRIBUTION,
      { ...LIVE_CONTRIBUTION, id: 'earlier', transactionHash: '0xeeee', contributedAt: '2026-01-01T00:00:00.000Z' },
    ])

    expect(
      store
        .getState()
        .recentTransactions()
        .map((tx) => tx.id)
    ).toEqual([LIVE_CONTRIBUTION.id, 'earlier'])
  })

  it('filters derived activity by pool', async () => {
    await loadWith([LIVE_CONTRIBUTION, { ...LIVE_CONTRIBUTION, id: 'other-pool', poolId: 99 }])

    expect(
      store
        .getState()
        .transactionsFor(12)
        .map((tx) => tx.id)
    ).toEqual([LIVE_CONTRIBUTION.id])
  })

  // -------------------------------------------------------------------------
  // Withdrawals, and the positions they reduce.
  // -------------------------------------------------------------------------

  it('asks for withdrawals on the same chain as the contributions', async () => {
    await store.getState().fetchPools()

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'listWithdrawals')
    expect(listWithdrawalsCallable).toHaveBeenCalledWith({ chainId: 31337, limit: 50 })
  })

  it('subtracts a withdrawal from the balance but not from what was contributed', async () => {
    // The two are kept apart so a member who took everything out still reads as
    // one, and so earnings are not confused with a withdrawal.
    authStore.setState({ walletAddress: CONTRIBUTOR })
    await loadWith([LIVE_CONTRIBUTION], [LIVE_WITHDRAWAL])

    const membership = store.getState().membershipFor(12)
    expect(membership?.totalContributed).toBe(parseEther('2'))
    expect(membership?.currentBalance).toBe(parseEther('1.5'))
  })

  it('subtracts withdrawals from a pool’s liquidity', async () => {
    await loadWith([LIVE_CONTRIBUTION], [LIVE_WITHDRAWAL])

    expect(store.getState().poolLiquidity(12)).toBe(parseEther('1.5'))
  })

  it('never reports negative liquidity when a deposit has fallen off the page', async () => {
    // The two lists are paged independently, so a withdrawal can arrive without
    // the deposit that funded it. A low figure beats a negative one.
    await loadWith([], [LIVE_WITHDRAWAL])

    expect(store.getState().poolLiquidity(12)).toBe(0n)
  })

  it('ignores a withdrawal with no matching membership rather than inventing one', async () => {
    await loadWith([], [LIVE_WITHDRAWAL])

    expect(store.getState().memberships()).toHaveLength(0)
  })

  it('never lets a balance go below zero', async () => {
    await loadWith([LIVE_CONTRIBUTION], [{ ...LIVE_WITHDRAWAL, amount: '99000000000000000000' }])

    expect(store.getState().memberships()[0].currentBalance).toBe(0n)
  })

  it('matches a withdrawal to its member case-insensitively', async () => {
    // The indexer lowercases, but a fixture or a future writer may not.
    authStore.setState({ walletAddress: CONTRIBUTOR })
    await loadWith([LIVE_CONTRIBUTION], [{ ...LIVE_WITHDRAWAL, member: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' }])

    expect(store.getState().membershipFor(12)?.currentBalance).toBe(parseEther('1.5'))
  })

  it('reports no earnings rather than negative ones after a withdrawal', async () => {
    // Interest reaches the pool but the contract cannot distribute it, so there
    // is nothing to credit — and a withdrawal must not read as a loss.
    authStore.setState({ walletAddress: CONTRIBUTOR })
    await loadWith([LIVE_CONTRIBUTION], [LIVE_WITHDRAWAL])

    expect(store.getState().totalBalance()).toBe(parseEther('1.5'))
    expect(store.getState().totalEarned()).toBe(0n)
  })

  it('shows a withdrawal as activity, distinct from a contribution', async () => {
    await loadWith([LIVE_CONTRIBUTION], [LIVE_WITHDRAWAL])

    const activity = store.getState().recentTransactions()
    expect(activity).toHaveLength(2)
    // Newest first: the withdrawal is an hour after the deposit.
    expect(activity[0].type).toBe(TransactionType.WITHDRAWAL)
    expect(activity[0].amount).toBe(parseEther('0.5'))
    expect(activity[0].txHash).toBe(LIVE_WITHDRAWAL.transactionHash)
    expect(activity[1].type).toBe(TransactionType.CONTRIBUTION)
  })

  it('survives a response with no withdrawals field', async () => {
    listContributionsCallable.mockResolvedValue({ data: { contributions: [LIVE_CONTRIBUTION], totalCount: 1, limit: 50 } })
    listWithdrawalsCallable.mockResolvedValue({ data: { totalCount: 0, limit: 50 } })

    await store.getState().fetchPools()

    expect(store.getState().withdrawals).toEqual([])
    expect(store.getState().poolLiquidity(12)).toBe(parseEther('2'))
  })

  it('counts a pool the user contributed to as one of mine', async () => {
    authStore.setState({ walletAddress: OTHER_WALLET })
    await loadWith([{ ...LIVE_CONTRIBUTION, contributor: OTHER_WALLET }])

    expect(
      store
        .getState()
        .myPools()
        .map((pool) => pool.poolId)
    ).toEqual([12])
  })

  it('adds the user’s balance to the dashboard total', async () => {
    authStore.setState({ walletAddress: OTHER_WALLET })
    await loadWith([{ ...LIVE_CONTRIBUTION, contributor: OTHER_WALLET }])

    expect(store.getState().totalBalance()).toBe(parseEther('2'))
    // No interest accrues yet, so a balance is exactly what was put in.
    expect(store.getState().totalEarned()).toBe(0n)
  })

  // -------------------------------------------------------------------------
  // The register supplies standing; the events supply money. Both halves have
  // to survive the other being absent.
  // -------------------------------------------------------------------------

  it('takes a member’s standing from the register, not from having deposited', async () => {
    listMembersCallable.mockResolvedValue({
      data: { members: [{ ...LIVE_MEMBER, status: 'removed' }], totalCount: 1, limit: 50 },
    })
    await loadWith([LIVE_CONTRIBUTION])

    expect(store.getState().memberships()).toHaveLength(1)
    expect(store.getState().memberships()[0].status).toBe(MemberStatus.SUSPENDED)
    // Removal takes away what you may do next, never what you already put in.
    expect(store.getState().memberships()[0].currentBalance).toBe(parseEther('2'))
  })

  it('keeps a removed member’s balance on their own dashboard', async () => {
    // Filtering positions on ACTIVE alone would hide money they can still
    // withdraw, which is the worst thing that getter could do.
    authStore.setState({ walletAddress: CONTRIBUTOR })
    listMembersCallable.mockResolvedValue({
      data: { members: [{ ...LIVE_MEMBER, status: 'removed' }], totalCount: 1, limit: 50 },
    })
    await loadWith([LIVE_CONTRIBUTION])

    expect(store.getState().totalBalance()).toBe(parseEther('2'))
  })

  it('lists a member the owner admitted who has not funded anything', async () => {
    // Only reachable through the register: there is no contribution to derive
    // this person from.
    authStore.setState({ walletAddress: OTHER_WALLET })
    listMembersCallable.mockResolvedValue({
      data: { members: [{ ...LIVE_MEMBER, account: OTHER_WALLET, status: 'active' }], totalCount: 1, limit: 50 },
    })
    await loadWith([])

    expect(store.getState().membershipFor(12)?.currentBalance).toBe(0n)
    expect(store.getState().membershipFor(12)?.status).toBe(MemberStatus.ACTIVE)
  })

  it('maps each register status to the app’s enum', async () => {
    for (const [chain, expected] of [
      ['requested', MemberStatus.PENDING],
      ['active', MemberStatus.ACTIVE],
      ['rejected', MemberStatus.REJECTED],
      ['removed', MemberStatus.SUSPENDED],
      ['left', MemberStatus.LEFT],
    ] as const) {
      listMembersCallable.mockResolvedValue({ data: { members: [{ ...LIVE_MEMBER, status: chain }], totalCount: 1, limit: 50 } })
      await loadWith([])

      expect(store.getState().memberships()[0].status).toBe(expected)
    }
  })

  it('falls back to ACTIVE for a contributor the register has not reached', async () => {
    // A pool indexed before the register shipped, or one whose membership log
    // the sweep has not swept yet. Depositing has always meant membership.
    await loadWith([LIVE_CONTRIBUTION])

    expect(store.getState().memberships()[0].status).toBe(MemberStatus.ACTIVE)
  })

  it('matches the register to its contributions case-insensitively', async () => {
    listMembersCallable.mockResolvedValue({
      data: { members: [{ ...LIVE_MEMBER, account: LIVE_MEMBER.account.toUpperCase().replace('0X', '0x') }], totalCount: 1, limit: 50 },
    })
    await loadWith([LIVE_CONTRIBUTION])

    // One member, not two: a case mismatch would double them.
    expect(store.getState().memberships()).toHaveLength(1)
    expect(store.getState().memberships()[0].currentBalance).toBe(parseEther('2'))
  })

  it('survives a response with no members field', async () => {
    listMembersCallable.mockResolvedValue({ data: { totalCount: 0, limit: 50 } })

    await store.getState().fetchPools()

    expect(store.getState().memberRecords).toEqual([])
    expect(store.getState().hasError()).toBe(false)
  })

  it('survives a response with no contributions field', async () => {
    // `memberships` derives from this and runs during render, so a malformed
    // response must not take the screen down.
    listContributionsCallable.mockResolvedValue({ data: { totalCount: 0, limit: 50 } })

    await store.getState().fetchPools()

    expect(store.getState().contributions).toEqual([])
    expect(store.getState().memberships()).toEqual([])
    expect(store.getState().hasError()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Sweeping the chain on pull-to-refresh.
// ---------------------------------------------------------------------------

const SWEEP_RESULT = {
  chainId: 31337,
  fromBlock: 60,
  toBlock: 64,
  currentBlock: 64,
  caughtUp: true,
  pools: 1,
  contributions: 2,
  withdrawals: 0,
}

describe('PoolStore chain sync', () => {
  let store: PoolStoreApi
  let listPoolsCallable: jest.Mock
  let syncCallable: jest.Mock
  /** Every callable invoked, in order, so ordering can be asserted. */
  let calls: string[]

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: 31337 })
    calls = []

    store = createPoolStore()
    listPoolsCallable = jest.fn().mockImplementation(() => {
      calls.push('listPools')
      return Promise.resolve({
        data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
      })
    })
    syncCallable = jest.fn().mockImplementation(() => {
      calls.push('syncPoolEventsNow')
      return Promise.resolve({ data: SWEEP_RESULT })
    })

    mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => {
      if (name === 'syncPoolEventsNow') return syncCallable
      if (name === 'listContributions') return jest.fn().mockResolvedValue({ data: { contributions: [], totalCount: 0, limit: 50 } })
      if (name === 'listWithdrawals') return jest.fn().mockResolvedValue({ data: { withdrawals: [], totalCount: 0, limit: 50 } })
      if (name === 'listInterestClaims') return jest.fn().mockResolvedValue({ data: { claims: [], totalCount: 0, limit: 50 } })
      if (name === 'listLoanRepayments') return jest.fn().mockResolvedValue({ data: { repayments: [], totalCount: 0, limit: 50 } })
      if (name === 'listLoans') return jest.fn().mockResolvedValue({ data: { loans: [], totalCount: 0, limit: 50 } })
      if (name === 'listMembers') return jest.fn().mockResolvedValue({ data: { members: [], totalCount: 0, limit: 50 } })
      return listPoolsCallable
    })
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: null })
  })

  it('sweeps the chain before listing, so one pull is enough', async () => {
    // Listing first would show what Firestore already had and only surface the
    // swept events on the next pull.
    await store.getState().syncAndRefresh()

    expect(calls[0]).toBe('syncPoolEventsNow')
    expect(calls).toContain('listPools')
  })

  it('sweeps the connected chain', async () => {
    await store.getState().syncAndRefresh()

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'syncPoolEventsNow')
    expect(syncCallable).toHaveBeenCalledWith({ chainId: 31337 })
  })

  it('falls back to the default chain when the wallet reports none', async () => {
    authStore.setState({ chainId: null })

    await store.getState().syncAndRefresh()

    expect(syncCallable).toHaveBeenCalledWith({ chainId: 31337 })
  })

  it('shows the refresh spinner for the sweep too, not just the reload', async () => {
    // Without this the control snaps back and the screen sits still through the
    // slower half of the refresh.
    let refreshingDuringSweep: boolean | null = null
    syncCallable.mockImplementation(() => {
      refreshingDuringSweep = store.getState().isRefreshing
      return Promise.resolve({ data: SWEEP_RESULT })
    })

    await store.getState().syncAndRefresh()

    expect(refreshingDuringSweep).toBe(true)
    expect(store.getState().isRefreshing).toBe(false)
  })

  it('still lists what is indexed when the sweep fails', async () => {
    // A sweep that could not reach the chain is not a problem the user can act
    // on; the pools already in Firestore are still worth showing.
    syncCallable.mockRejectedValue(new Error('functions/internal'))

    await expect(store.getState().syncAndRefresh()).resolves.toBeUndefined()

    expect(store.getState().pools).toHaveLength(1)
    expect(store.getState().hasError()).toBe(false)
    expect(store.getState().isRefreshing).toBe(false)
  })

  it('leaves the list on screen while it sweeps', async () => {
    await store.getState().fetchPools()
    let poolsDuringSweep: number | null = null
    syncCallable.mockImplementation(() => {
      poolsDuringSweep = store.getState().pools.length
      return Promise.resolve({ data: SWEEP_RESULT })
    })

    await store.getState().syncAndRefresh()

    expect(poolsDuringSweep).toBe(1)
  })

  it('does not sweep on mock pools', async () => {
    // Mock mode exists to work on the UI with no emulators running.
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'

    await store.getState().syncAndRefresh()

    expect(syncCallable).not.toHaveBeenCalled()
  })

  it('does not sweep on an ordinary refresh', async () => {
    // `refreshPools` also runs straight after a transaction the app indexed
    // itself, where a sweep is a slow way to re-fetch finished work.
    await store.getState().refreshPools()

    expect(syncCallable).not.toHaveBeenCalled()
    expect(calls).toEqual(['listPools'])
  })
})

// ---------------------------------------------------------------------------
// Whose pools count as "mine".
//
// `memberships` deliberately covers every depositor, because pool liquidity is
// summed across all of them. `myPools` has to narrow that to the connected
// wallet, and the failure mode is silent: with only one depositor indexed, an
// unfiltered version looks exactly right.
// ---------------------------------------------------------------------------

const USER_WALLET = '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65'
const STRANGER_WALLET = '0x0000000000000000000000000000000000000042'

/** Owned by the user, with nothing deposited into it yet. */
const POOL_I_OWN = { ...LIVE_POOL, poolId: 30, name: 'Mine By Ownership', poolOwner: USER_WALLET, createdBy: USER_WALLET }
/** Someone else's pool that the user has put money into. */
const POOL_I_FUNDED = { ...LIVE_POOL, poolId: 31, name: 'Mine By Deposit', poolOwner: STRANGER_WALLET, createdBy: STRANGER_WALLET }
/** Someone else's pool, funded only by them. */
const POOL_THEIRS = { ...LIVE_POOL, poolId: 32, name: 'Not Mine', poolOwner: STRANGER_WALLET, createdBy: STRANGER_WALLET }

describe('PoolStore myPools', () => {
  let store: PoolStoreApi
  let listContributionsCallable: jest.Mock

  async function loadWithContributions(contributions: (typeof LIVE_CONTRIBUTION)[]) {
    listContributionsCallable.mockResolvedValue({
      data: { contributions, totalCount: contributions.length, limit: 50 },
    })
    await store.getState().fetchPools()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.setState({ walletAddress: USER_WALLET })
    authStore.setState({ chainId: 31337 })

    store = createPoolStore()
    const listPoolsCallable = jest.fn().mockResolvedValue({
      data: {
        pools: [POOL_I_OWN, POOL_I_FUNDED, POOL_THEIRS],
        totalCount: 3,
        page: 1,
        limit: 50,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    })
    listContributionsCallable = jest.fn().mockResolvedValue({ data: { contributions: [], totalCount: 0, limit: 50 } })
    const listWithdrawalsCallable = jest.fn().mockResolvedValue({ data: { withdrawals: [], totalCount: 0, limit: 50 } })
    mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => {
      if (name === 'listContributions') return listContributionsCallable
      if (name === 'listWithdrawals') return listWithdrawalsCallable
      return listPoolsCallable
    })
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: null })
  })

  it('does not claim a pool just because someone else funded it', async () => {
    // The regression. `memberships` spans every depositor, so mapping it
    // wholesale turns this list into every funded pool on the chain.
    await loadWithContributions([
      { ...LIVE_CONTRIBUTION, poolId: 31, contributor: USER_WALLET },
      { ...LIVE_CONTRIBUTION, id: '31337-0xdddd-0', poolId: 32, contributor: STRANGER_WALLET },
    ])

    expect(
      store
        .getState()
        .myPools()
        .map((pool) => pool.poolId)
    ).toEqual([30, 31])
  })

  it('claims a pool the user owns even with no deposits in it', async () => {
    // A pool you just created is yours to see before any membership exists.
    await loadWithContributions([])

    expect(
      store
        .getState()
        .myPools()
        .map((pool) => pool.poolId)
    ).toEqual([30])
  })

  it('claims a pool the user funded but does not own', async () => {
    await loadWithContributions([{ ...LIVE_CONTRIBUTION, poolId: 31, contributor: USER_WALLET }])

    expect(
      store
        .getState()
        .myPools()
        .map((pool) => pool.poolId)
    ).toEqual([30, 31])
  })

  it('matches the depositor case-insensitively', async () => {
    // Contributions are stored lowercased; a connected wallet is checksummed.
    authStore.setState({ walletAddress: '0x15D34AAf54267DB7D7c367839AAf71A00a2C6A65' })
    await loadWithContributions([{ ...LIVE_CONTRIBUTION, poolId: 31, contributor: USER_WALLET }])

    expect(
      store
        .getState()
        .myPools()
        .map((pool) => pool.poolId)
    ).toEqual([30, 31])
  })

  it('claims nothing when every pool belongs to someone else', async () => {
    authStore.setState({ walletAddress: '0x0000000000000000000000000000000000000099' })
    await loadWithContributions([
      { ...LIVE_CONTRIBUTION, poolId: 31, contributor: STRANGER_WALLET },
      { ...LIVE_CONTRIBUTION, id: '31337-0xdddd-0', poolId: 32, contributor: STRANGER_WALLET },
    ])

    expect(store.getState().myPools()).toEqual([])
  })

  it('still counts every depositor towards pool liquidity', async () => {
    // The filter belongs in `myPools`, not in `memberships` — narrowing the
    // source would make other people's pools read as empty.
    await loadWithContributions([{ ...LIVE_CONTRIBUTION, poolId: 32, contributor: STRANGER_WALLET, amount: parseEther('7').toString() }])

    expect(store.getState().poolLiquidity(32)).toBe(parseEther('7'))
    expect(
      store
        .getState()
        .myPools()
        .map((pool) => pool.poolId)
    ).toEqual([30])
  })
})

// ---------------------------------------------------------------------------
// What Discover offers.
//
// The complement of `myPools`, so the two tabs partition the chain's pools and
// nothing shows up in both. The cases worth pinning are the standings that are
// not membership: a pending request, a rejection and a removal all leave a
// record, and all of them belong on the tab that can explain what happened
// rather than in a list of strangers.
// ---------------------------------------------------------------------------

describe('PoolStore discoverablePools', () => {
  let store: PoolStoreApi
  let listContributionsCallable: jest.Mock
  let listMembersCallable: jest.Mock

  async function loadWith(contributions: (typeof LIVE_CONTRIBUTION)[], members: MemberInfo[] = []) {
    listContributionsCallable.mockResolvedValue({
      data: { contributions, totalCount: contributions.length, limit: 50 },
    })
    listMembersCallable.mockResolvedValue({ data: { members, totalCount: members.length, limit: 50 } })
    await store.getState().fetchPools()
  }

  function member(poolId: number, account: string, status: MemberInfo['status']): MemberInfo {
    return {
      id: `31337-${poolId}-${account}`,
      poolId,
      poolAddress: LIVE_POOL.poolAddress,
      account,
      status,
      joinedAt: '2026-08-10T08:00:00.000Z',
      chainId: 31337,
      transactionHash: '0xcccc',
      blockNumber: 102,
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.setState({ walletAddress: USER_WALLET })
    authStore.setState({ chainId: 31337 })

    store = createPoolStore()
    const listPoolsCallable = jest.fn().mockResolvedValue({
      data: {
        pools: [POOL_I_OWN, POOL_I_FUNDED, POOL_THEIRS],
        totalCount: 3,
        page: 1,
        limit: 50,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    })
    listContributionsCallable = jest.fn().mockResolvedValue({ data: { contributions: [], totalCount: 0, limit: 50 } })
    listMembersCallable = jest.fn().mockResolvedValue({ data: { members: [], totalCount: 0, limit: 50 } })
    const listWithdrawalsCallable = jest.fn().mockResolvedValue({ data: { withdrawals: [], totalCount: 0, limit: 50 } })
    mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => {
      if (name === 'listContributions') return listContributionsCallable
      if (name === 'listWithdrawals') return listWithdrawalsCallable
      if (name === 'listMembers') return listMembersCallable
      return listPoolsCallable
    })
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: null })
  })

  it('offers the pools the user has no standing in', async () => {
    await loadWith([{ ...LIVE_CONTRIBUTION, poolId: 31, contributor: USER_WALLET }])

    expect(
      store
        .getState()
        .discoverablePools()
        .map((pool) => pool.poolId)
    ).toEqual([32])
  })

  it('never offers a pool the user owns', async () => {
    await loadWith([])

    expect(
      store
        .getState()
        .discoverablePools()
        .map((pool) => pool.poolId)
    ).toEqual([31, 32])
  })

  // The partition. Anything in one list must be absent from the other, or a
  // pool shows up twice under two different framings.
  it('partitions the chain with myPools', async () => {
    await loadWith([{ ...LIVE_CONTRIBUTION, poolId: 31, contributor: USER_WALLET }])

    const mine = store
      .getState()
      .myPools()
      .map((pool) => pool.poolId)
    const theirs = store
      .getState()
      .discoverablePools()
      .map((pool) => pool.poolId)

    expect([...mine, ...theirs].sort()).toEqual([30, 31, 32])
    expect(mine.filter((poolId) => theirs.includes(poolId))).toEqual([])
  })

  it('drops a pool the user has asked to join', async () => {
    // Discover cannot say "waiting to be let in"; the Pools tab can.
    await loadWith([], [member(32, USER_WALLET, 'requested')])

    expect(
      store
        .getState()
        .discoverablePools()
        .map((pool) => pool.poolId)
    ).toEqual([31])
  })

  it('drops a pool that turned the user down', async () => {
    // A rejected applicant is not a stranger — the pool screen offers "Ask
    // again", which only makes sense where the rejection is visible.
    await loadWith([], [member(32, USER_WALLET, 'rejected')])

    expect(
      store
        .getState()
        .discoverablePools()
        .map((pool) => pool.poolId)
    ).toEqual([31])
  })

  it('drops a pool the user was removed from', async () => {
    await loadWith([], [member(32, USER_WALLET, 'removed')])

    expect(
      store
        .getState()
        .discoverablePools()
        .map((pool) => pool.poolId)
    ).toEqual([31])
  })

  it('ignores other people’s standings', async () => {
    // The register spans every member of every pool, so an unfiltered version
    // hides pools because a stranger joined them.
    await loadWith([], [member(31, STRANGER_WALLET, 'active'), member(32, STRANGER_WALLET, 'active')])

    expect(
      store
        .getState()
        .discoverablePools()
        .map((pool) => pool.poolId)
    ).toEqual([31, 32])
  })

  it('matches the user case-insensitively', async () => {
    authStore.setState({ walletAddress: USER_WALLET.toUpperCase().replace('0X', '0x') })
    await loadWith([], [member(32, USER_WALLET, 'active')])

    expect(
      store
        .getState()
        .discoverablePools()
        .map((pool) => pool.poolId)
    ).toEqual([31])
  })

  it('offers nothing when the user is in every pool', async () => {
    await loadWith(
      [
        { ...LIVE_CONTRIBUTION, poolId: 31, contributor: USER_WALLET },
        { ...LIVE_CONTRIBUTION, id: '31337-0xdddd-0', poolId: 32, contributor: USER_WALLET },
      ],
      []
    )

    expect(store.getState().discoverablePools()).toEqual([])
  })

  describe('memberCountFor', () => {
    it('counts the active members of a pool the user is not in', async () => {
      await loadWith([], [member(32, STRANGER_WALLET, 'active'), member(32, '0x00000000000000000000000000000000000000aa', 'active')])

      expect(store.getState().memberCountFor(32)).toBe(2)
    })

    it('counts a depositor with no register entry, which is what depositing has always meant', async () => {
      await loadWith([{ ...LIVE_CONTRIBUTION, poolId: 32, contributor: STRANGER_WALLET }])

      expect(store.getState().memberCountFor(32)).toBe(1)
    })

    it('does not count an applicant who has not been let in', async () => {
      await loadWith([], [member(32, STRANGER_WALLET, 'requested')])

      expect(store.getState().memberCountFor(32)).toBe(0)
    })

    it('does not count someone rejected, removed or gone', async () => {
      await loadWith(
        [],
        [
          member(32, STRANGER_WALLET, 'rejected'),
          member(32, '0x00000000000000000000000000000000000000aa', 'removed'),
          member(32, '0x00000000000000000000000000000000000000bb', 'left'),
        ]
      )

      expect(store.getState().memberCountFor(32)).toBe(0)
    })

    it('counts only the pool asked about', async () => {
      await loadWith([], [member(31, STRANGER_WALLET, 'active'), member(32, STRANGER_WALLET, 'active')])

      expect(store.getState().memberCountFor(32)).toBe(1)
    })

    it('is zero for a pool nobody has joined', async () => {
      await loadWith([])

      expect(store.getState().memberCountFor(32)).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// Loan states.
//
// A request that is still waiting on the pool owner has `isRepaid === false`,
// exactly like a live loan, because repayment is the only thing that field
// describes. Anything that reads it without first checking `status` treats a
// request as a debt: the repay panel offers to settle money that never left the
// pool, and the pool reports liquidity as lent while it is still sitting there.
// ---------------------------------------------------------------------------

const LIVE_LOAN: LoanInfo = {
  id: '31337-12-1',
  loanId: 1,
  poolId: 12,
  poolAddress: LIVE_POOL.poolAddress,
  // Lowercased, as the indexer stores it.
  borrower: USER_WALLET,
  amount: parseEther('3').toString(),
  interestRate: 500,
  duration: 2_592_000,
  startedAt: '2026-08-11T09:00:00.000Z',
  isRepaid: false,
  amountRepaid: '0',
  // Untouched: the whole principal is still out and nothing has accrued yet.
  principalOutstanding: parseEther('3').toString(),
  interestOutstanding: '0',
  status: 'disbursed',
  chainId: 31337,
  transactionHash: '0xeeee',
  blockNumber: 110,
}

/** The same borrower's request in a pool whose owner reviews before funding. */
const REQUESTED_LOAN: LoanInfo = { ...LIVE_LOAN, id: '31337-12-2', loanId: 2, status: 'requested' }
const REJECTED_LOAN: LoanInfo = { ...LIVE_LOAN, id: '31337-12-3', loanId: 3, status: 'rejected' }
/** 3 POL at 500bp, settled: the whole 3.15 came back. */
const REPAID_LOAN: LoanInfo = {
  ...LIVE_LOAN,
  id: '31337-12-4',
  loanId: 4,
  isRepaid: true,
  amountRepaid: parseEther('3.15').toString(),
  principalOutstanding: '0',
  interestOutstanding: '0',
}

/**
 * The same loan, past its term and declared in default by the pool's owner.
 *
 * Note what is unchanged from `LIVE_LOAN`: `isRepaid` is still false and the
 * principal is still outstanding. A declaration is a judgement on a debt, not a
 * settlement of one, and everything the store derives has to keep agreeing.
 */
const DEFAULTED_LOAN: LoanInfo = {
  ...LIVE_LOAN,
  id: '31337-12-6',
  loanId: 6,
  status: 'defaulted',
  defaultedAt: '2026-09-20T09:00:00.000Z',
}

/** Thirty days after `LIVE_LOAN` started, which is exactly its term. */
const DUE_AT = new Date(new Date(LIVE_LOAN.startedAt).getTime() + LIVE_LOAN.duration * 1000)

function settled(overrides: { id: string; loanId: number; repaidAt?: Date; borrower?: string }): LoanInfo {
  return {
    ...LIVE_LOAN,
    ...overrides,
    isRepaid: true,
    amountRepaid: parseEther('3.15').toString(),
    principalOutstanding: '0',
    interestOutstanding: '0',
    repaidAt: overrides.repaidAt?.toISOString(),
  }
}

describe('PoolStore loan states', () => {
  let store: PoolStoreApi
  let listLoansCallable: jest.Mock
  let listContributionsCallable: jest.Mock
  let listLoanRepaymentsCallable: jest.Mock
  let listBorrowerHistoriesCallable: jest.Mock

  async function loadWithLoans(loans: LoanInfo[]) {
    listLoansCallable.mockResolvedValue({ data: { loans, totalCount: loans.length, limit: 50 } })
    await store.getState().fetchPools()
  }

  async function loadWithRepayments(loans: LoanInfo[], repayments: LoanRepaymentInfo[]) {
    listLoansCallable.mockResolvedValue({ data: { loans, totalCount: loans.length, limit: 50 } })
    listLoanRepaymentsCallable.mockResolvedValue({ data: { repayments, totalCount: repayments.length, limit: 50 } })
    await store.getState().fetchPools()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.setState({ walletAddress: USER_WALLET })
    authStore.setState({ chainId: 31337 })

    store = createPoolStore()
    listLoansCallable = jest.fn().mockResolvedValue({ data: { loans: [], totalCount: 0, limit: 50 } })
    listContributionsCallable = jest.fn().mockResolvedValue({ data: { contributions: [], totalCount: 0, limit: 50 } })
    listLoanRepaymentsCallable = jest.fn().mockResolvedValue({ data: { repayments: [], totalCount: 0, limit: 50 } })
    listBorrowerHistoriesCallable = jest.fn().mockResolvedValue({ data: { histories: {}, asOf: '2026-08-18T09:00:00.000Z' } })
    mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => {
      if (name === 'listLoans') return listLoansCallable
      if (name === 'listContributions') return listContributionsCallable
      if (name === 'listWithdrawals') return jest.fn().mockResolvedValue({ data: { withdrawals: [], totalCount: 0, limit: 50 } })
      if (name === 'listInterestClaims') return jest.fn().mockResolvedValue({ data: { claims: [], totalCount: 0, limit: 50 } })
      if (name === 'listLoanRepayments') return listLoanRepaymentsCallable
      if (name === 'listBorrowerHistories') return listBorrowerHistoriesCallable
      return jest.fn().mockResolvedValue({
        data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
      })
    })
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: null })
  })

  it('does not offer to repay a request that was never funded', async () => {
    // The regression: a pending request has `isRepaid === false` too.
    await loadWithLoans([REQUESTED_LOAN])

    expect(store.getState().activeLoanFor(12)).toBeUndefined()
  })

  it('finds the disbursed loan to repay', async () => {
    await loadWithLoans([LIVE_LOAN])

    expect(store.getState().activeLoanFor(12)?.loanId).toBe(1)
  })

  it('leaves a repaid loan out of the repay panel', async () => {
    await loadWithLoans([REPAID_LOAN])

    expect(store.getState().activeLoanFor(12)).toBeUndefined()
  })

  it('leaves a rejected request out of both panels', async () => {
    await loadWithLoans([REJECTED_LOAN])

    expect(store.getState().activeLoanFor(12)).toBeUndefined()
    expect(store.getState().pendingLoanFor(12)).toBeUndefined()
  })

  it('finds the request waiting on the owner, with its id to cancel', async () => {
    await loadWithLoans([REQUESTED_LOAN])

    expect(store.getState().pendingLoanFor(12)?.loanId).toBe(2)
  })

  it('matches the borrower case-insensitively', async () => {
    // Loans are stored lowercased; a connected wallet is checksummed.
    authStore.setState({ walletAddress: '0x15D34AAf54267DB7D7c367839AAf71A00a2C6A65' })
    await loadWithLoans([LIVE_LOAN, REQUESTED_LOAN])

    expect(store.getState().activeLoanFor(12)?.loanId).toBe(1)
    expect(store.getState().pendingLoanFor(12)?.loanId).toBe(2)
  })

  it('does not claim another wallet’s loan', async () => {
    await loadWithLoans([{ ...LIVE_LOAN, borrower: STRANGER_WALLET }])

    expect(store.getState().activeLoanFor(12)).toBeUndefined()
  })

  it('counts only disbursed loans as owed', async () => {
    // A request has moved nothing. Counting it would report liquidity as lent
    // while it is still in the pool.
    //
    // The principal still out plus whatever has accrued on it — this fixture
    // has accrued nothing, so it is the 3 POL borrowed.
    await loadWithLoans([LIVE_LOAN, REQUESTED_LOAN, REJECTED_LOAN, REPAID_LOAN])

    expect(store.getState().outstandingDebt(12)).toBe(parseEther('3'))
  })

  it('nets off what a borrower has already paid back', async () => {
    // The figure sits beside the pool's liquidity, which `totalFunds` has
    // already grown by. Summing the whole debt after two POL came back would
    // have the two describe different worlds.
    //
    // Interest first, then principal: 2 POL against 0.15 accrued leaves 1.15
    // of principal, which is what the chain reports and what this reads.
    await loadWithLoans([
      {
        ...LIVE_LOAN,
        amountRepaid: parseEther('2').toString(),
        principalOutstanding: parseEther('1.15').toString(),
        interestOutstanding: '0',
      },
    ])

    expect(store.getState().outstandingDebt(12)).toBe(parseEther('1.15'))
  })

  /**
   * The figure the flat model could not produce: a debt that grows.
   *
   * The record carries a snapshot and the moment it was taken; the store
   * projects it forward the way the contract does — on the principal still
   * out, at the loan's rate over its term, uncapped once the term has passed.
   */
  it('grows the debt as interest accrues against the principal still out', async () => {
    const accruedAt = new Date('2026-08-11T09:00:00.000Z')
    // Half of a thirty-day term at 500bp on 3 POL: 0.075 POL.
    const halfway = new Date(accruedAt.getTime() + 15 * 24 * 60 * 60 * 1000)
    jest.spyOn(Date, 'now').mockReturnValue(halfway.getTime())

    await loadWithLoans([{ ...LIVE_LOAN, accruedAt: accruedAt.toISOString() }])

    expect(store.getState().outstandingDebt(12)).toBe(parseEther('3.075'))

    jest.spyOn(Date, 'now').mockRestore()
  })

  it('keeps a loan that predates accrual at the price it was made', async () => {
    // No `accruedAt` means the figures are static, not that they are unknown:
    // such a loan does not accrue until its first payment converts it, so
    // projecting it forward would show interest the contract will not charge.
    const later = new Date('2027-01-01T00:00:00.000Z')
    jest.spyOn(Date, 'now').mockReturnValue(later.getTime())

    await loadWithLoans([{ ...LIVE_LOAN, interestOutstanding: parseEther('0.15').toString() }])

    expect(store.getState().outstandingDebt(12)).toBe(parseEther('3.15'))

    jest.spyOn(Date, 'now').mockRestore()
  })

  it('never accrues backwards when the device clock lags the chain', async () => {
    const accruedAt = new Date('2026-08-11T09:00:00.000Z')
    jest.spyOn(Date, 'now').mockReturnValue(accruedAt.getTime() - 60_000)

    await loadWithLoans([{ ...LIVE_LOAN, accruedAt: accruedAt.toISOString() }])

    expect(store.getState().outstandingDebt(12)).toBe(parseEther('3'))

    jest.spyOn(Date, 'now').mockRestore()
  })

  it('lists every borrower’s pending request for the pool owner', async () => {
    // The approvals screen is not filtered by the connected wallet: the owner
    // is deciding on other people's requests.
    await loadWithLoans([REQUESTED_LOAN, { ...REQUESTED_LOAN, id: '31337-12-5', loanId: 5, borrower: STRANGER_WALLET }, LIVE_LOAN])

    expect(
      store
        .getState()
        .pendingLoansFor(12)
        .map((loan) => loan.loanId)
    ).toEqual([2, 5])
  })

  it('maps each chain state to the app’s status', async () => {
    await loadWithLoans([LIVE_LOAN, REQUESTED_LOAN, REJECTED_LOAN, REPAID_LOAN])

    expect(
      store
        .getState()
        .loans()
        .map((loan) => loan.status)
    ).toEqual([LoanStatus.DISBURSED, LoanStatus.REQUESTED, LoanStatus.REJECTED, LoanStatus.REPAID])
  })

  it('dates approval and disbursement only once funds have moved', async () => {
    await loadWithLoans([REQUESTED_LOAN])

    const [loan] = store.getState().loans()
    expect(loan.requestedAt).toEqual(new Date(REQUESTED_LOAN.startedAt))
    expect(loan.approvedAt).toBeUndefined()
    expect(loan.disbursedAt).toBeUndefined()
    // Nothing is due on a request that may never be funded.
    expect(loan.dueDate).toBeUndefined()
  })

  it('reports nothing repaid on a request', async () => {
    // `isRepaid` is false either way; only a disbursed loan can be settled.
    await loadWithLoans([REQUESTED_LOAN])

    expect(store.getState().loans()[0].amountRepaid).toBe(0n)
  })

  it('surfaces the request as the user’s pending loan', async () => {
    await loadWithLoans([REQUESTED_LOAN])

    expect(store.getState().pendingLoan()?.id).toBe(REQUESTED_LOAN.id)
    expect(store.getState().activeLoan()).toBeUndefined()
  })

  it('carries the chain’s repayment stamp into the app’s loan', async () => {
    const repaidAt = new Date('2026-08-15T09:00:00.000Z')
    await loadWithLoans([settled({ id: '31337-12-9', loanId: 9, repaidAt })])

    expect(store.getState().loans()[0].repaidAt).toEqual(repaidAt)
  })

  // -------------------------------------------------------------------------
  // Borrower history.
  //
  // What a pool owner is actually deciding on. Counts, not a score: "borrowed
  // three, repaid three, none late" is what an owner asks for, and it is made
  // of one fact the chain did not record until now — when a repayment landed.
  // -------------------------------------------------------------------------

  describe('borrowerHistory', () => {
    it('reads a wallet nobody has lent to as new, not as bad', async () => {
      // The one that quietly makes a lending product unusable for the people it
      // exists for: zero of zero is a first-time borrower, not the worst kind.
      await loadWithLoans([])

      const history = store.getState().borrowerHistory(USER_WALLET)

      expect(history.isNew).toBe(true)
      expect(history).toMatchObject({ total: 0, repaid: 0, late: 0, overdue: 0 })
    })

    it('counts a repayment inside the term as on time', async () => {
      const repaidAt = new Date(DUE_AT.getTime() - 24 * 60 * 60 * 1000)
      await loadWithLoans([settled({ id: '31337-12-9', loanId: 9, repaidAt })])

      expect(store.getState().borrowerHistory(USER_WALLET)).toMatchObject({ total: 1, repaid: 1, onTime: 1, late: 0, isNew: false })
    })

    it('counts a repayment after the term as late', async () => {
      // The distinction the whole milestone turns on, and the one that was not
      // derivable at all before the contract stamped a repayment.
      const repaidAt = new Date(DUE_AT.getTime() + 24 * 60 * 60 * 1000)
      await loadWithLoans([settled({ id: '31337-12-9', loanId: 9, repaidAt })])

      expect(store.getState().borrowerHistory(USER_WALLET)).toMatchObject({ total: 1, repaid: 1, onTime: 0, late: 1 })
    })

    it('refuses to call an undated repayment on time', async () => {
      // A loan settled before the contract recorded a stamp. Counting it as on
      // time would invent a fact; counting it late would slander a borrower.
      await loadWithLoans([settled({ id: '31337-12-9', loanId: 9 })])

      expect(store.getState().borrowerHistory(USER_WALLET)).toMatchObject({ repaid: 1, undated: 1, onTime: 0, late: 0 })
    })

    it('separates what is still owed from what is overdue', async () => {
      const longSinceDue: LoanInfo = { ...LIVE_LOAN, id: '31337-12-8', loanId: 8, startedAt: '2020-01-01T00:00:00.000Z' }
      const freshlyBorrowed: LoanInfo = { ...LIVE_LOAN, id: '31337-12-7', loanId: 7, startedAt: new Date().toISOString() }
      await loadWithLoans([longSinceDue, freshlyBorrowed])

      expect(store.getState().borrowerHistory(USER_WALLET)).toMatchObject({ total: 2, outstanding: 2, overdue: 1 })
    })

    it('ignores requests and rejections entirely', async () => {
      // Neither is borrowing. A request that was turned down says something
      // about the owner who turned it down, not about the borrower.
      await loadWithLoans([REQUESTED_LOAN, REJECTED_LOAN])

      expect(store.getState().borrowerHistory(USER_WALLET)).toMatchObject({ total: 0, isNew: true })
    })

    it('does not mix two borrowers together', async () => {
      await loadWithLoans([LIVE_LOAN, settled({ id: '31337-12-6', loanId: 6, borrower: STRANGER_WALLET, repaidAt: DUE_AT })])

      expect(store.getState().borrowerHistory(USER_WALLET)).toMatchObject({ total: 1, outstanding: 1, repaid: 0 })
      expect(store.getState().borrowerHistory(STRANGER_WALLET)).toMatchObject({ total: 1, repaid: 1, onTime: 1 })
    })

    it('matches the borrower case-insensitively', async () => {
      // The owner's queue hands over a checksummed address from the wallet,
      // while the indexer stores it lowercased.
      await loadWithLoans([REPAID_LOAN])

      expect(store.getState().borrowerHistory('0x15D34AAf54267DB7D7c367839AAf71A00a2C6A65')).toMatchObject({ total: 1, repaid: 1 })
    })

    it('reports the connected wallet’s own record', async () => {
      await loadWithLoans([REPAID_LOAN])

      expect(store.getState().myBorrowingHistory()).toMatchObject({ total: 1, repaid: 1, isNew: false })
    })
  })

  // -------------------------------------------------------------------------
  // Borrower history, summarised by the backend.
  //
  // The derivation above runs over `loans`, which is one page of the chain's
  // newest — so a wallet with more loans than that page is judged on part of
  // its record, on the panel a pool owner reads before lending. The backend
  // filters by borrower first and summarises the whole of it, and judges
  // lateness on chain time, which this store cannot read.
  // -------------------------------------------------------------------------

  describe('loadBorrowerHistories', () => {
    const SUMMARISED = { total: 9, repaid: 8, onTime: 7, late: 1, undated: 0, outstanding: 1, overdue: 1, defaulted: 0, isNew: false }

    async function summarise(histories: Record<string, unknown>) {
      listBorrowerHistoriesCallable.mockResolvedValue({ data: { histories, asOf: '2026-08-18T09:00:00.000Z' } })
      await store.getState().loadBorrowerHistories([USER_WALLET])
    }

    it('asks the backend for the wallets it was given', async () => {
      await store.getState().loadBorrowerHistories([USER_WALLET, STRANGER_WALLET])

      expect(listBorrowerHistoriesCallable).toHaveBeenCalledWith({
        chainId: 31337,
        borrowers: [USER_WALLET.toLowerCase(), STRANGER_WALLET.toLowerCase()],
      })
    })

    it('prefers the summary over the page it could derive', async () => {
      await loadWithLoans([REPAID_LOAN])
      expect(store.getState().borrowerHistory(USER_WALLET)).toMatchObject({ total: 1 })

      await summarise({ [USER_WALLET.toLowerCase()]: SUMMARISED })

      expect(store.getState().borrowerHistory(USER_WALLET)).toEqual(SUMMARISED)
    })

    it('matches the summary case-insensitively, as every address here is', async () => {
      await summarise({ [USER_WALLET.toLowerCase()]: SUMMARISED })

      expect(store.getState().borrowerHistory(USER_WALLET.toUpperCase())).toEqual(SUMMARISED)
    })

    // Nothing waits on this: the derivation is on screen until it answers, and
    // stays there if it never does.
    it('keeps the derived figure for a wallet the backend did not summarise', async () => {
      await loadWithLoans([REPAID_LOAN])

      await summarise({ [STRANGER_WALLET.toLowerCase()]: SUMMARISED })

      expect(store.getState().borrowerHistory(USER_WALLET)).toMatchObject({ total: 1, repaid: 1 })
    })

    // Silent like `triggerIndexing`: the fallback is the figure the app showed
    // before any of this existed, and an error about a summary nobody asked
    // for is worse than a slightly narrower one.
    it('falls back rather than surfacing a failure', async () => {
      await loadWithLoans([REPAID_LOAN])
      listBorrowerHistoriesCallable.mockRejectedValue(new Error('offline'))

      await store.getState().loadBorrowerHistories([USER_WALLET])

      expect(store.getState().borrowerHistory(USER_WALLET)).toMatchObject({ total: 1 })
      expect(store.getState().error).toBeNull()
    })

    it('asks about each wallet once, however many times it was named', async () => {
      await store.getState().loadBorrowerHistories([USER_WALLET, USER_WALLET.toUpperCase(), ''])

      expect(listBorrowerHistoriesCallable).toHaveBeenCalledWith(expect.objectContaining({ borrowers: [USER_WALLET.toLowerCase()] }))
    })

    it('asks nothing when there is nobody to ask about', async () => {
      await store.getState().loadBorrowerHistories([])

      expect(listBorrowerHistoriesCallable).not.toHaveBeenCalled()
    })

    // Mock mode has no backend, and the fixtures are the only loans there are.
    it('does not ask at all on mock data', async () => {
      process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'

      await store.getState().loadBorrowerHistories([USER_WALLET])

      expect(listBorrowerHistoriesCallable).not.toHaveBeenCalled()
    })

    it('clips a queue longer than one call may summarise', async () => {
      const many = Array.from({ length: 30 }, (_, index) => `0x${String(index).padStart(40, '0')}`)

      await store.getState().loadBorrowerHistories(many)

      expect(listBorrowerHistoriesCallable.mock.calls[0][0].borrowers).toHaveLength(25)
    })
  })

  // -------------------------------------------------------------------------
  // Loans in the activity feed.
  //
  // A loan is an entity, not a log, so it is expanded into the events that can
  // be dated. Since instalments became possible that is the disbursement and
  // nothing else: money coming back is its own indexed feed, because a loan
  // record carries one date and one running total and a debt settled in four
  // transactions has four of each.
  // -------------------------------------------------------------------------

  describe('loanActivity', () => {
    it('shows a disbursed loan as money leaving the pool', async () => {
      await loadWithLoans([LIVE_LOAN])

      const [row] = store.getState().loanActivity()
      expect(row.type).toBe(TransactionType.LOAN_DISBURSEMENT)
      expect(row.amount).toBe(parseEther('3'))
      expect(row.from).toBe(LIVE_LOAN.poolAddress)
      expect(row.to).toBe(LIVE_LOAN.borrower)
    })

    it('shows a request as awaiting a decision', async () => {
      // `PENDING` means "waiting on the owner" here, not "not yet mined" — a
      // request is on chain the moment it is made.
      await loadWithLoans([REQUESTED_LOAN])

      const [row] = store.getState().loanActivity()
      expect(row.type).toBe(TransactionType.LOAN_REQUEST)
      expect(row.status).toBe(TransactionStatus.PENDING)
    })

    it('points a request from the borrower at the pool', async () => {
      // Nothing moves, so the direction only states who is asking whom.
      await loadWithLoans([REQUESTED_LOAN])

      expect(store.getState().loanActivity()[0].from).toBe(REQUESTED_LOAN.borrower)
      expect(store.getState().loanActivity()[0].to).toBe(REQUESTED_LOAN.poolAddress)
    })

    it('leaves a rejected request out', async () => {
      // Nothing moved and the request is over; a `LOAN_REQUEST` row would claim
      // it is still waiting.
      await loadWithLoans([REJECTED_LOAN])

      expect(store.getState().loanActivity()).toEqual([])
    })

    it('leaves money coming back to the loan repayment feed', async () => {
      // It used to be derived here, one row per settled loan. That was exactly
      // right while `repayLoan` demanded the whole sum in one transaction and
      // wrong the moment it stopped: instalments before the last would have no
      // row at all, and the last would claim the whole debt.
      await loadWithLoans([settled({ id: '31337-12-5', loanId: 5, repaidAt: DUE_AT })])

      expect(
        store
          .getState()
          .loanActivity()
          .map((tx) => tx.type)
      ).toEqual([TransactionType.LOAN_DISBURSEMENT])
    })

    it('never gives a request a repayment row', async () => {
      // `isRepaid` reads false on a request, but a request that was never
      // funded has nothing to give back.
      await loadWithLoans([{ ...REQUESTED_LOAN, isRepaid: true, repaidAt: DUE_AT.toISOString() }])

      expect(
        store
          .getState()
          .loanActivity()
          .map((tx) => tx.type)
      ).toEqual([TransactionType.LOAN_REQUEST])
    })

    it('produces one row per loan that moved', async () => {
      await loadWithLoans([
        LIVE_LOAN,
        REQUESTED_LOAN,
        REJECTED_LOAN,
        REPAID_LOAN,
        settled({ id: '31337-12-5', loanId: 5, repaidAt: DUE_AT }),
      ])

      // Live 1, request 1, rejected 0, repaid 1 each — the disbursement.
      expect(store.getState().loanActivity()).toHaveLength(4)
    })
  })

  // -------------------------------------------------------------------------
  // Payments towards loans.
  //
  // Their own indexed feed, because instalments are logs and a loan is not.
  // `LoanRepaymentMade` carries a block, a hash and the amount that payment
  // credited; the loan record carries a running total and one date belonging
  // to whichever payment closed the debt.
  // -------------------------------------------------------------------------

  describe('loanRepaymentActivity', () => {
    /** 2 POL towards `LIVE_LOAN`, three days after it went out. */
    const FIRST_INSTALMENT: LoanRepaymentInfo = {
      id: '31337-0xf1-0',
      loanId: 1,
      poolId: 12,
      poolAddress: LIVE_LOAN.poolAddress,
      borrower: USER_WALLET,
      amount: parseEther('2').toString(),
      chainId: 31337,
      transactionHash: '0xf1',
      logIndex: 0,
      blockNumber: 300,
      repaidAt: '2026-08-14T09:00:00.000Z',
    }

    /** The 1.15 POL that closes it, a week later. */
    const FINAL_INSTALMENT: LoanRepaymentInfo = {
      ...FIRST_INSTALMENT,
      id: '31337-0xf2-0',
      amount: parseEther('1.15').toString(),
      transactionHash: '0xf2',
      blockNumber: 420,
      repaidAt: '2026-08-21T09:00:00.000Z',
    }

    it('shows a payment as money returning to the pool', async () => {
      await loadWithRepayments([LIVE_LOAN], [FIRST_INSTALMENT])

      const [repayment] = store.getState().loanRepaymentActivity()
      expect(repayment.type).toBe(TransactionType.LOAN_REPAYMENT)
      expect(repayment.from).toBe(USER_WALLET)
      expect(repayment.to).toBe(LIVE_LOAN.poolAddress)
      expect(repayment.status).toBe(TransactionStatus.CONFIRMED)
    })

    it('gives one row per instalment, each carrying what it paid', async () => {
      // The whole point of the feed. Derived from the loan record these would
      // be a single row for 3.15 POL, dated when the last one landed.
      await loadWithRepayments([settled({ id: '31337-12-1', loanId: 1 })], [FIRST_INSTALMENT, FINAL_INSTALMENT])

      expect(
        store
          .getState()
          .loanRepaymentActivity()
          .map((tx) => tx.amount)
      ).toEqual([parseEther('2'), parseEther('1.15')])
    })

    it('dates each payment by its own block', async () => {
      await loadWithRepayments([settled({ id: '31337-12-1', loanId: 1 })], [FIRST_INSTALMENT, FINAL_INSTALMENT])

      expect(
        store
          .getState()
          .loanRepaymentActivity()
          .map((tx) => tx.createdAt)
      ).toEqual([new Date('2026-08-14T09:00:00.000Z'), new Date('2026-08-21T09:00:00.000Z')])
    })

    it('links each payment to its own transaction', async () => {
      // Unlike every other loan row: the loan record's hash created the loan,
      // so a repayment derived from it had to carry no link at all.
      await loadWithRepayments([LIVE_LOAN], [FIRST_INSTALMENT])

      const [repayment] = store.getState().loanRepaymentActivity()
      expect(repayment.txHash).toBe('0xf1')
      expect(repayment.blockNumber).toBe(300)
    })

    it('reaches the pool’s activity feed alongside the disbursement', async () => {
      await loadWithRepayments([LIVE_LOAN], [FIRST_INSTALMENT])

      expect(
        store
          .getState()
          .transactionsFor(12)
          .map((tx) => tx.type)
      ).toEqual([TransactionType.LOAN_REPAYMENT, TransactionType.LOAN_DISBURSEMENT])
    })

    it('counts as the borrower’s own activity', async () => {
      // A repayment leaves their wallet, so the `wallet` perspective marks it
      // negative — which needs the row to be matched on `from`.
      await loadWithRepayments([LIVE_LOAN], [FIRST_INSTALMENT])

      expect(
        store
          .getState()
          .myActivity()
          .map((tx) => tx.type)
      ).toContain(TransactionType.LOAN_REPAYMENT)
    })

    it('is empty when nothing has been paid back', async () => {
      await loadWithRepayments([LIVE_LOAN], [])

      expect(store.getState().loanRepaymentActivity()).toEqual([])
    })
  })

  describe('loanActivity, continued', () => {
    it('reaches the pool’s activity feed', async () => {
      // The regression: loans were indexed and shown everywhere except here.
      await loadWithLoans([LIVE_LOAN])

      expect(
        store
          .getState()
          .transactionsFor(12)
          .map((tx) => tx.type)
      ).toContain(TransactionType.LOAN_DISBURSEMENT)
    })

    it('merges with contributions in date order', async () => {
      listContributionsCallable.mockResolvedValue({
        data: { contributions: [{ ...LIVE_CONTRIBUTION, contributedAt: '2026-08-12T00:00:00.000Z' }], totalCount: 1, limit: 50 },
      })
      await loadWithLoans([LIVE_LOAN])

      const times = store
        .getState()
        .recentTransactions()
        .map((tx) => tx.createdAt.getTime())
      expect(times).toEqual([...times].sort((a, b) => b - a))
      expect(store.getState().recentTransactions()).toHaveLength(2)
    })

    it('narrows to the connected wallet for a personal feed', async () => {
      // The pool feed is everyone's by construction; anything headed "your
      // activity" has to filter, or it shows strangers' deposits as yours.
      await loadWithLoans([LIVE_LOAN, { ...LIVE_LOAN, id: '31337-12-9', loanId: 9, borrower: STRANGER_WALLET }])

      expect(store.getState().recentTransactions()).toHaveLength(2)
      expect(
        store
          .getState()
          .myActivity()
          .map((tx) => tx.id)
      ).toEqual([LIVE_LOAN.id])
    })

    it('matches the member on whichever end of the row they are', async () => {
      // A contribution comes *from* them, a disbursed loan goes *to* them.
      listContributionsCallable.mockResolvedValue({
        data: { contributions: [{ ...LIVE_CONTRIBUTION, contributor: USER_WALLET }], totalCount: 1, limit: 50 },
      })
      await loadWithLoans([LIVE_LOAN])

      expect(store.getState().myActivity()).toHaveLength(2)
    })

    it('is empty with no wallet connected, rather than everything', async () => {
      authStore.setState({ walletAddress: null })
      await loadWithLoans([LIVE_LOAN])

      expect(store.getState().recentTransactions().length).toBeGreaterThan(0)
      expect(store.getState().myActivity()).toEqual([])
    })

    it('matches the wallet case-insensitively', async () => {
      authStore.setState({ walletAddress: USER_WALLET.toUpperCase().replace('0X', '0x') })
      await loadWithLoans([LIVE_LOAN])

      expect(store.getState().myActivity()).toHaveLength(1)
    })

    it('lists the pools with somebody waiting on the user', async () => {
      // LIVE_POOL's owner is not the user, so ownership has to be the filter —
      // being a member of a pool does not make its queue yours.
      authStore.setState({ walletAddress: LIVE_POOL.poolOwner })
      await loadWithLoans([REQUESTED_LOAN, { ...REQUESTED_LOAN, id: '31337-12-7', loanId: 7, borrower: STRANGER_WALLET }])

      expect(
        store
          .getState()
          .poolsAwaitingMyDecision()
          .map((entry) => entry.pool.poolId)
      ).toEqual([12])
      expect(store.getState().requestsAwaitingMyDecision()).toBe(2)
    })

    it('says nothing is waiting on a pool the user does not own', async () => {
      authStore.setState({ walletAddress: STRANGER_WALLET })
      await loadWithLoans([REQUESTED_LOAN])

      expect(store.getState().poolsAwaitingMyDecision()).toEqual([])
      expect(store.getState().requestsAwaitingMyDecision()).toBe(0)
    })

    it('counts only requests, not loans already decided', async () => {
      authStore.setState({ walletAddress: LIVE_POOL.poolOwner })
      await loadWithLoans([REQUESTED_LOAN, LIVE_LOAN, REJECTED_LOAN, REPAID_LOAN])

      expect(store.getState().requestsAwaitingMyDecision()).toBe(1)
    })

    it('does not collide with a contribution id', async () => {
      // Loans key on `${chainId}-${poolId}-${loanId}`, contributions on the log.
      // A collision would drop a row, since the feed is keyed by id.
      listContributionsCallable.mockResolvedValue({ data: { contributions: [LIVE_CONTRIBUTION], totalCount: 1, limit: 50 } })
      await loadWithLoans([LIVE_LOAN])

      const ids = store
        .getState()
        .recentTransactions()
        .map((tx) => tx.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })
})

// ---------------------------------------------------------------------------
// Loans the owner declared in default.
// ---------------------------------------------------------------------------

describe('PoolStore and a defaulted loan', () => {
  let store: PoolStoreApi
  let listLoansCallable: jest.Mock

  async function loadWithLoans(loans: LoanInfo[]) {
    listLoansCallable.mockResolvedValue({ data: { loans, totalCount: loans.length, limit: 50 } })
    await store.getState().fetchPools()
  }

  /** Puts the clock a minute past `LIVE_LOAN`'s due date. */
  function afterDue(offsetMs = 60_000) {
    jest.spyOn(Date, 'now').mockReturnValue(DUE_AT.getTime() + offsetMs)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.setState({ walletAddress: USER_WALLET })
    authStore.setState({ chainId: 31337 })

    store = createPoolStore()
    listLoansCallable = jest.fn().mockResolvedValue({ data: { loans: [], totalCount: 0, limit: 50 } })
    mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => {
      if (name === 'listLoans') return listLoansCallable
      if (name === 'listContributions') return jest.fn().mockResolvedValue({ data: { contributions: [], totalCount: 0, limit: 50 } })
      if (name === 'listWithdrawals') return jest.fn().mockResolvedValue({ data: { withdrawals: [], totalCount: 0, limit: 50 } })
      if (name === 'listInterestClaims') return jest.fn().mockResolvedValue({ data: { claims: [], totalCount: 0, limit: 50 } })
      if (name === 'listLoanRepayments') return jest.fn().mockResolvedValue({ data: { repayments: [], totalCount: 0, limit: 50 } })
      return jest.fn().mockResolvedValue({
        data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
      })
    })
  })

  afterEach(() => {
    jest.spyOn(Date, 'now').mockRestore()
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
    authStore.setState({ walletAddress: null })
    authStore.setState({ chainId: null })
  })

  it('maps the chain state to the app’s status', async () => {
    await loadWithLoans([DEFAULTED_LOAN])

    expect(store.getState().loans()[0].status).toBe(LoanStatus.DEFAULTED)
  })

  it('carries the date the declaration was made', async () => {
    await loadWithLoans([DEFAULTED_LOAN])

    expect(store.getState().loans()[0].defaultedAt).toEqual(new Date(DEFAULTED_LOAN.defaultedAt!))
  })

  it('reads as settled once it is paid, and keeps the declaration', async () => {
    // The pair is what says the borrower recovered, which is a different fact
    // from never having been late. Collapsing them to one status loses it.
    await loadWithLoans([{ ...DEFAULTED_LOAN, isRepaid: true, amountRepaid: parseEther('3.15').toString() }])

    expect(store.getState().loans()[0].status).toBe(LoanStatus.REPAID)
    expect(store.getState().loans()[0].defaultedAt).toBeDefined()
  })

  describe('what it must not lose', () => {
    it('still knows what was borrowed, what came back and when it was due', async () => {
      // The trap: all of these were gated on `status === 'disbursed'`, so a
      // declaration reported the debt as repaid nothing and due never — on
      // exactly the loans where those matter most.
      await loadWithLoans([{ ...DEFAULTED_LOAN, amountRepaid: parseEther('1').toString() }])

      const [loan] = store.getState().loans()
      expect(loan.amountRepaid).toBe(parseEther('1'))
      expect(loan.dueDate).toEqual(DUE_AT)
      expect(loan.disbursedAt).toBeDefined()
    })

    it('still counts as the borrower’s outstanding loan', async () => {
      // `activeLoanFor` feeds the repay panel. Dropping a declared loan from it
      // would take a borrower's own debt off their screen at the moment it was
      // declared.
      await loadWithLoans([DEFAULTED_LOAN])

      expect(store.getState().activeLoanFor(12)?.loanId).toBe(6)
      expect(store.getState().activeLoan()?.id).toBe(DEFAULTED_LOAN.id)
    })
  })

  describe('the borrowing record', () => {
    it('counts a declaration whether or not the debt was later paid', async () => {
      await loadWithLoans([
        DEFAULTED_LOAN,
        { ...DEFAULTED_LOAN, id: '31337-12-7', loanId: 7, isRepaid: true, amountRepaid: parseEther('3.15').toString() },
      ])

      expect(store.getState().borrowerHistory(USER_WALLET).defaulted).toBe(2)
    })

    it('counts a declared loan as borrowed and still owed', async () => {
      await loadWithLoans([DEFAULTED_LOAN])

      const history = store.getState().borrowerHistory(USER_WALLET)
      expect(history.total).toBe(1)
      expect(history.outstanding).toBe(1)
      expect(history.isNew).toBe(false)
    })

    it('reports nothing declared for a borrower nobody judged', async () => {
      await loadWithLoans([LIVE_LOAN])

      expect(store.getState().borrowerHistory(USER_WALLET).defaulted).toBe(0)
    })
  })

  describe('overdueLoansFor', () => {
    it('lists a loan past its term that nobody has declared', async () => {
      // The ordinary case, and the one the list exists for: overdue is
      // arithmetic and happens without anyone doing anything.
      await loadWithLoans([LIVE_LOAN])
      afterDue()

      expect(
        store
          .getState()
          .overdueLoansFor(12)
          .map((loan) => loan.loanId)
      ).toEqual([1])
    })

    it('leaves out a loan still inside its term', async () => {
      await loadWithLoans([LIVE_LOAN])
      afterDue(-60_000)

      expect(store.getState().overdueLoansFor(12)).toEqual([])
    })

    it('leaves out a request nobody funded, however old', async () => {
      await loadWithLoans([REQUESTED_LOAN, REJECTED_LOAN])
      afterDue(365 * 24 * 60 * 60 * 1000)

      expect(store.getState().overdueLoansFor(12)).toEqual([])
    })

    it('leaves out a debt that was settled', async () => {
      await loadWithLoans([REPAID_LOAN])
      afterDue()

      expect(store.getState().overdueLoansFor(12)).toEqual([])
    })

    it('keeps a loan that has already been declared', async () => {
      // Still owed, so still on the owner's list — where the card says it is
      // declared rather than offering to declare it again.
      await loadWithLoans([DEFAULTED_LOAN])
      afterDue()

      expect(
        store
          .getState()
          .overdueLoansFor(12)
          .map((loan) => loan.loanId)
      ).toEqual([6])
    })

    it('puts the longest-overdue debt first', async () => {
      // The question an owner is answering is who has been late longest; the
      // biggest debt is often the newest one.
      const older: LoanInfo = {
        ...LIVE_LOAN,
        id: '31337-12-8',
        loanId: 8,
        startedAt: new Date(new Date(LIVE_LOAN.startedAt).getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      }
      await loadWithLoans([LIVE_LOAN, older])
      afterDue()

      expect(
        store
          .getState()
          .overdueLoansFor(12)
          .map((loan) => loan.loanId)
      ).toEqual([8, 1])
    })
  })

  describe('myOverdueLoans', () => {
    it('gathers the connected wallet’s late debts', async () => {
      await loadWithLoans([LIVE_LOAN, DEFAULTED_LOAN])
      afterDue()

      expect(
        store
          .getState()
          .myOverdueLoans()
          .map((loan) => loan.id)
      ).toEqual([LIVE_LOAN.id, DEFAULTED_LOAN.id])
    })

    it('leaves out somebody else’s', async () => {
      await loadWithLoans([{ ...LIVE_LOAN, borrower: STRANGER_WALLET }])
      afterDue()

      expect(store.getState().myOverdueLoans()).toEqual([])
    })
  })
})
