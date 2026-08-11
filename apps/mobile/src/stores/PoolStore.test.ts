import type { PoolInfo } from '@superpool/types'
import { LoanStatus, MemberStatus, TransactionStatus, TransactionType } from '@superpool/types'
import { parseEther } from 'viem'
import { mockFirebaseCallable } from '../__tests__/mocks'
import { MOCK_USER_ADDRESS } from '../mocks/lending'
import { authStore } from './AuthStore'
import { PoolStore } from './PoolStore'

describe('PoolStore', () => {
  let store: PoolStore

  beforeEach(async () => {
    store = new PoolStore()
    await store.fetchPools()
  })

  it('starts empty before loading', () => {
    expect(new PoolStore().pools).toHaveLength(0)
  })

  it('loads pools, memberships, loans and transactions', () => {
    expect(store.pools.length).toBeGreaterThan(0)
    expect(store.memberships.length).toBeGreaterThan(0)
    expect(store.loans.length).toBeGreaterThan(0)
    expect(store.transactions.length).toBeGreaterThan(0)
    expect(store.isLoading).toBe(false)
  })

  it('exposes the pools the user belongs to', () => {
    expect(store.myPools.map((pool) => pool.poolId)).toEqual([1, 2, 3, 4])
  })

  it('sums balances of active memberships only', () => {
    // 195.4 + 331.2 + 75 (pending membership excluded)
    expect(store.totalBalance).toBe(parseEther('601.6'))
  })

  it('computes lifetime earnings', () => {
    // (195.4 - 180) + (331.2 - 320) + (75 - 75)
    expect(store.totalEarned).toBe(parseEther('26.6'))
  })

  it('finds the active (disbursed) loan for the user', () => {
    const loan = store.activeLoan
    expect(loan?.status).toBe(LoanStatus.DISBURSED)
    expect(loan?.borrower).toBe(MOCK_USER_ADDRESS)
  })

  it('finds the pending loan request', () => {
    expect(store.pendingLoan?.status).toBe(LoanStatus.REQUESTED)
  })

  it('looks up pools and memberships by id', () => {
    expect(store.poolById(2)?.name).toBe('Family Circle')
    expect(store.poolById(99)).toBeUndefined()
    expect(store.membershipFor(4)?.status).toBe(MemberStatus.PENDING)
  })

  it('sorts recent transactions newest first', () => {
    const times = store.recentTransactions.map((tx) => tx.createdAt.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it('filters transactions by pool', () => {
    expect(store.transactionsFor(2).every((tx) => tx.poolId === '2')).toBe(true)
    expect(store.transactionsFor(2).length).toBeGreaterThan(0)
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
  let store: PoolStore
  let listPoolsCallable: jest.Mock
  let listContributionsCallable: jest.Mock
  let listWithdrawalsCallable: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.walletAddress = null
    authStore.chainId = 31337

    store = new PoolStore()
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
    authStore.walletAddress = null
    authStore.chainId = null
  })

  it('asks the backend for the connected chain', async () => {
    await store.fetchPools()

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'listPools')
    expect(listPoolsCallable).toHaveBeenCalledWith({ chainId: 31337, activeOnly: true, limit: 50 })
  })

  it('lets the caller override the defaults', async () => {
    await store.fetchPools({ activeOnly: false, limit: 10, ownerAddress: '0xabc' })

    expect(listPoolsCallable).toHaveBeenCalledWith({ chainId: 31337, activeOnly: false, limit: 10, ownerAddress: '0xabc' })
  })

  it('stores what the backend returned', async () => {
    await store.fetchPools()

    expect(store.pools).toHaveLength(1)
    expect(store.pools[0].name).toBe('Live Pool')
    expect(store.poolCount).toBe(1)
    expect(store.isEmpty).toBe(false)
    expect(store.lastFetchedAt).toBeInstanceOf(Date)
  })

  it('keeps createdAt as the ISO string the callable sends', async () => {
    await store.fetchPools()

    // Not a Date: a Date returned from a callable serialises to `{}`, so the
    // wire type is a string and stays one.
    expect(store.pools[0].createdAt).toBe(LIVE_POOL.createdAt)
    expect(new Date(store.pools[0].createdAt).getTime()).not.toBeNaN()
  })

  it('reports a failure instead of throwing at the screen', async () => {
    listPoolsCallable.mockRejectedValue(new Error('functions/unavailable'))

    await expect(store.fetchPools()).resolves.toBeUndefined()

    expect(store.error).toBe('functions/unavailable')
    expect(store.hasError).toBe(true)
    expect(store.isLoading).toBe(false)
    expect(store.pools).toHaveLength(0)
    expect(store.isEmpty).toBe(true)
  })

  it('clears a previous failure on the next attempt', async () => {
    listPoolsCallable.mockRejectedValueOnce(new Error('functions/unavailable'))
    await store.fetchPools()
    expect(store.hasError).toBe(true)

    await store.fetchPools()

    expect(store.hasError).toBe(false)
    expect(store.pools).toHaveLength(1)
  })

  it('keeps the list on screen while refreshing', async () => {
    await store.fetchPools()
    let seenDuringRefresh: { pools: number; isRefreshing: boolean; isLoading: boolean } | null = null
    listPoolsCallable.mockImplementation(() => {
      seenDuringRefresh = { pools: store.pools.length, isRefreshing: store.isRefreshing, isLoading: store.isLoading }
      return Promise.resolve({
        data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
      })
    })

    await store.refreshPools()

    expect(seenDuringRefresh).toEqual({ pools: 1, isRefreshing: true, isLoading: false })
  })

  it('counts a pool the connected wallet owns as one of mine, whatever the casing', async () => {
    authStore.walletAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'

    await store.fetchPools()

    expect(store.myPools.map((pool) => pool.poolId)).toEqual([12])
  })

  it('does not claim pools owned by someone else', async () => {
    authStore.walletAddress = '0x0000000000000000000000000000000000000001'

    await store.fetchPools()

    expect(store.myPools).toHaveLength(0)
  })

  it('claims nothing when no wallet is connected', async () => {
    await store.fetchPools()

    expect(store.userAddress).toBe('')
    expect(store.myPools).toHaveLength(0)
  })

  it('reset clears everything', async () => {
    await store.fetchPools()

    store.reset()

    expect(store.pools).toHaveLength(0)
    expect(store.memberships).toHaveLength(0)
    expect(store.lastFetchedAt).toBeNull()
    expect(store.error).toBeNull()
  })

  it('falls back to the default chain when the wallet reports none', async () => {
    authStore.chainId = null

    await store.fetchPools()

    expect(listPoolsCallable).toHaveBeenCalledWith(expect.objectContaining({ chainId: 31337 }))
  })

  it('handles an empty backend response', async () => {
    listPoolsCallable.mockResolvedValue({
      data: { pools: [] as PoolInfo[], totalCount: 0, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
    })

    await store.fetchPools()

    expect(store.isEmpty).toBe(true)
    expect(store.hasError).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Contributions, and the memberships derived from them.
// ---------------------------------------------------------------------------

describe('PoolStore contributions', () => {
  const CONTRIBUTOR = LIVE_CONTRIBUTION.contributor
  const OTHER_WALLET = '0x0000000000000000000000000000000000000009'

  let store: PoolStore
  let listContributionsCallable: jest.Mock
  let listWithdrawalsCallable: jest.Mock

  /** Seeds the backend with `contributions` (and optionally withdrawals) and loads. */
  async function loadWith(contributions: (typeof LIVE_CONTRIBUTION)[], withdrawals: (typeof LIVE_WITHDRAWAL)[] = []) {
    listContributionsCallable.mockResolvedValue({
      data: { contributions, totalCount: contributions.length, limit: 50 },
    })
    listWithdrawalsCallable.mockResolvedValue({
      data: { withdrawals, totalCount: withdrawals.length, limit: 50 },
    })
    await store.fetchPools()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.walletAddress = null
    authStore.chainId = 31337

    store = new PoolStore()
    const listPoolsCallable = jest.fn().mockResolvedValue({
      data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
    })
    listContributionsCallable = jest.fn().mockResolvedValue({ data: { contributions: [], totalCount: 0, limit: 50 } })
    listWithdrawalsCallable = jest.fn().mockResolvedValue({ data: { withdrawals: [], totalCount: 0, limit: 50 } })
    mockFirebaseCallable.mockImplementation((_functions?: unknown, name?: string) => {
      if (name === 'listContributions') return listContributionsCallable
      if (name === 'listWithdrawals') return listWithdrawalsCallable
      return listPoolsCallable
    })
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
    authStore.walletAddress = null
    authStore.chainId = null
  })

  it('asks the backend for the connected chain', async () => {
    await store.fetchPools()

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'listContributions')
    expect(listContributionsCallable).toHaveBeenCalledWith({ chainId: 31337, limit: 50 })
  })

  it('does not filter by wallet, so other members count towards pool liquidity', async () => {
    // A pool's liquidity is what everyone put in, and it is shown on pools the
    // user has not contributed to.
    await store.fetchPools()

    expect(listContributionsCallable).toHaveBeenCalledWith(expect.not.objectContaining({ contributor: expect.anything() }))
  })

  it('sums a pool’s liquidity across contributors', async () => {
    await loadWith([
      LIVE_CONTRIBUTION,
      { ...LIVE_CONTRIBUTION, id: '31337-0xcccc-0', transactionHash: '0xcccc', contributor: OTHER_WALLET, amount: '3000000000000000000' },
    ])

    expect(store.poolLiquidity(12)).toBe(parseEther('5'))
  })

  it('reports zero liquidity for a pool nobody has funded', async () => {
    await loadWith([])

    expect(store.poolLiquidity(12)).toBe(0n)
  })

  it('lists the contributions into one pool', async () => {
    await loadWith([LIVE_CONTRIBUTION, { ...LIVE_CONTRIBUTION, id: 'other', poolId: 99 }])

    expect(store.contributionsFor(12)).toHaveLength(1)
    expect(store.contributionsFor(12)[0].id).toBe(LIVE_CONTRIBUTION.id)
  })

  it('derives a membership from a contribution', async () => {
    // There is no membership register on chain, so funding a pool is what makes
    // someone a member of it.
    authStore.walletAddress = CONTRIBUTOR
    await loadWith([LIVE_CONTRIBUTION])

    const membership = store.membershipFor(12)
    expect(membership?.totalContributed).toBe(parseEther('2'))
    expect(membership?.currentBalance).toBe(parseEther('2'))
    expect(membership?.status).toBe(MemberStatus.ACTIVE)
  })

  it('sums repeat deposits into one membership', async () => {
    authStore.walletAddress = CONTRIBUTOR
    await loadWith([
      LIVE_CONTRIBUTION,
      { ...LIVE_CONTRIBUTION, id: '31337-0xdddd-0', transactionHash: '0xdddd', amount: '1000000000000000000' },
    ])

    expect(store.memberships).toHaveLength(1)
    expect(store.membershipFor(12)?.totalContributed).toBe(parseEther('3'))
  })

  it('dates a membership from the first deposit, not the most recent', async () => {
    authStore.walletAddress = CONTRIBUTOR
    await loadWith([
      LIVE_CONTRIBUTION,
      { ...LIVE_CONTRIBUTION, id: 'earlier', transactionHash: '0xeeee', contributedAt: '2026-01-01T00:00:00.000Z' },
    ])

    expect(store.membershipFor(12)?.joinedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('keeps one membership per wallet per pool', async () => {
    await loadWith([LIVE_CONTRIBUTION, { ...LIVE_CONTRIBUTION, id: 'other-wallet', contributor: OTHER_WALLET }])

    expect(store.memberships).toHaveLength(2)
  })

  it('matches the connected wallet case-insensitively', async () => {
    // The indexer stores addresses lowercased; wallets report them checksummed.
    authStore.walletAddress = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'
    await loadWith([LIVE_CONTRIBUTION])

    expect(store.membershipFor(12)).toBeDefined()
  })

  it('marks the pool owner as an admin of their own pool', async () => {
    // LIVE_POOL's owner is the contributor in this fixture.
    await loadWith([LIVE_CONTRIBUTION])

    expect(store.memberships[0].isAdmin).toBe(true)
  })

  it('does not mark an ordinary contributor as an admin', async () => {
    await loadWith([{ ...LIVE_CONTRIBUTION, contributor: OTHER_WALLET }])

    expect(store.memberships[0].isAdmin).toBe(false)
  })

  it('shows a contribution as activity instead of a fixture', async () => {
    // Activity used to be MOCK_TRANSACTIONS regardless of what was indexed.
    await loadWith([LIVE_CONTRIBUTION])

    expect(store.recentTransactions).toHaveLength(1)
    const [activity] = store.recentTransactions
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

    expect(store.recentTransactions).toEqual([])
  })

  it('sorts derived activity newest first', async () => {
    await loadWith([
      LIVE_CONTRIBUTION,
      { ...LIVE_CONTRIBUTION, id: 'earlier', transactionHash: '0xeeee', contributedAt: '2026-01-01T00:00:00.000Z' },
    ])

    expect(store.recentTransactions.map((tx) => tx.id)).toEqual([LIVE_CONTRIBUTION.id, 'earlier'])
  })

  it('filters derived activity by pool', async () => {
    await loadWith([LIVE_CONTRIBUTION, { ...LIVE_CONTRIBUTION, id: 'other-pool', poolId: 99 }])

    expect(store.transactionsFor(12).map((tx) => tx.id)).toEqual([LIVE_CONTRIBUTION.id])
  })

  // -------------------------------------------------------------------------
  // Withdrawals, and the positions they reduce.
  // -------------------------------------------------------------------------

  it('asks for withdrawals on the same chain as the contributions', async () => {
    await store.fetchPools()

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'listWithdrawals')
    expect(listWithdrawalsCallable).toHaveBeenCalledWith({ chainId: 31337, limit: 50 })
  })

  it('subtracts a withdrawal from the balance but not from what was contributed', async () => {
    // The two are kept apart so a member who took everything out still reads as
    // one, and so earnings are not confused with a withdrawal.
    authStore.walletAddress = CONTRIBUTOR
    await loadWith([LIVE_CONTRIBUTION], [LIVE_WITHDRAWAL])

    const membership = store.membershipFor(12)
    expect(membership?.totalContributed).toBe(parseEther('2'))
    expect(membership?.currentBalance).toBe(parseEther('1.5'))
  })

  it('subtracts withdrawals from a pool’s liquidity', async () => {
    await loadWith([LIVE_CONTRIBUTION], [LIVE_WITHDRAWAL])

    expect(store.poolLiquidity(12)).toBe(parseEther('1.5'))
  })

  it('never reports negative liquidity when a deposit has fallen off the page', async () => {
    // The two lists are paged independently, so a withdrawal can arrive without
    // the deposit that funded it. A low figure beats a negative one.
    await loadWith([], [LIVE_WITHDRAWAL])

    expect(store.poolLiquidity(12)).toBe(0n)
  })

  it('ignores a withdrawal with no matching membership rather than inventing one', async () => {
    await loadWith([], [LIVE_WITHDRAWAL])

    expect(store.memberships).toHaveLength(0)
  })

  it('never lets a balance go below zero', async () => {
    await loadWith([LIVE_CONTRIBUTION], [{ ...LIVE_WITHDRAWAL, amount: '99000000000000000000' }])

    expect(store.memberships[0].currentBalance).toBe(0n)
  })

  it('matches a withdrawal to its member case-insensitively', async () => {
    // The indexer lowercases, but a fixture or a future writer may not.
    authStore.walletAddress = CONTRIBUTOR
    await loadWith([LIVE_CONTRIBUTION], [{ ...LIVE_WITHDRAWAL, member: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' }])

    expect(store.membershipFor(12)?.currentBalance).toBe(parseEther('1.5'))
  })

  it('reports no earnings rather than negative ones after a withdrawal', async () => {
    // Interest reaches the pool but the contract cannot distribute it, so there
    // is nothing to credit — and a withdrawal must not read as a loss.
    authStore.walletAddress = CONTRIBUTOR
    await loadWith([LIVE_CONTRIBUTION], [LIVE_WITHDRAWAL])

    expect(store.totalBalance).toBe(parseEther('1.5'))
    expect(store.totalEarned).toBe(0n)
  })

  it('shows a withdrawal as activity, distinct from a contribution', async () => {
    await loadWith([LIVE_CONTRIBUTION], [LIVE_WITHDRAWAL])

    const activity = store.recentTransactions
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

    await store.fetchPools()

    expect(store.withdrawals).toEqual([])
    expect(store.poolLiquidity(12)).toBe(parseEther('2'))
  })

  it('counts a pool the user contributed to as one of mine', async () => {
    authStore.walletAddress = OTHER_WALLET
    await loadWith([{ ...LIVE_CONTRIBUTION, contributor: OTHER_WALLET }])

    expect(store.myPools.map((pool) => pool.poolId)).toEqual([12])
  })

  it('adds the user’s balance to the dashboard total', async () => {
    authStore.walletAddress = OTHER_WALLET
    await loadWith([{ ...LIVE_CONTRIBUTION, contributor: OTHER_WALLET }])

    expect(store.totalBalance).toBe(parseEther('2'))
    // No interest accrues yet, so a balance is exactly what was put in.
    expect(store.totalEarned).toBe(0n)
  })

  it('survives a response with no contributions field', async () => {
    // `memberships` derives from this and runs during render, so a malformed
    // response must not take the screen down.
    listContributionsCallable.mockResolvedValue({ data: { totalCount: 0, limit: 50 } })

    await store.fetchPools()

    expect(store.contributions).toEqual([])
    expect(store.memberships).toEqual([])
    expect(store.hasError).toBe(false)
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
  let store: PoolStore
  let listPoolsCallable: jest.Mock
  let syncCallable: jest.Mock
  /** Every callable invoked, in order, so ordering can be asserted. */
  let calls: string[]

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.walletAddress = null
    authStore.chainId = 31337
    calls = []

    store = new PoolStore()
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
      return listPoolsCallable
    })
  })

  afterEach(() => {
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'
    authStore.walletAddress = null
    authStore.chainId = null
  })

  it('sweeps the chain before listing, so one pull is enough', async () => {
    // Listing first would show what Firestore already had and only surface the
    // swept events on the next pull.
    await store.syncAndRefresh()

    expect(calls[0]).toBe('syncPoolEventsNow')
    expect(calls).toContain('listPools')
  })

  it('sweeps the connected chain', async () => {
    await store.syncAndRefresh()

    expect(mockFirebaseCallable).toHaveBeenCalledWith(expect.anything(), 'syncPoolEventsNow')
    expect(syncCallable).toHaveBeenCalledWith({ chainId: 31337 })
  })

  it('falls back to the default chain when the wallet reports none', async () => {
    authStore.chainId = null

    await store.syncAndRefresh()

    expect(syncCallable).toHaveBeenCalledWith({ chainId: 31337 })
  })

  it('shows the refresh spinner for the sweep too, not just the reload', async () => {
    // Without this the control snaps back and the screen sits still through the
    // slower half of the refresh.
    let refreshingDuringSweep: boolean | null = null
    syncCallable.mockImplementation(() => {
      refreshingDuringSweep = store.isRefreshing
      return Promise.resolve({ data: SWEEP_RESULT })
    })

    await store.syncAndRefresh()

    expect(refreshingDuringSweep).toBe(true)
    expect(store.isRefreshing).toBe(false)
  })

  it('still lists what is indexed when the sweep fails', async () => {
    // A sweep that could not reach the chain is not a problem the user can act
    // on; the pools already in Firestore are still worth showing.
    syncCallable.mockRejectedValue(new Error('functions/internal'))

    await expect(store.syncAndRefresh()).resolves.toBeUndefined()

    expect(store.pools).toHaveLength(1)
    expect(store.hasError).toBe(false)
    expect(store.isRefreshing).toBe(false)
  })

  it('leaves the list on screen while it sweeps', async () => {
    await store.fetchPools()
    let poolsDuringSweep: number | null = null
    syncCallable.mockImplementation(() => {
      poolsDuringSweep = store.pools.length
      return Promise.resolve({ data: SWEEP_RESULT })
    })

    await store.syncAndRefresh()

    expect(poolsDuringSweep).toBe(1)
  })

  it('does not sweep on mock pools', async () => {
    // Mock mode exists to work on the UI with no emulators running.
    process.env.EXPO_PUBLIC_USE_MOCK_POOLS = 'true'

    await store.syncAndRefresh()

    expect(syncCallable).not.toHaveBeenCalled()
  })

  it('does not sweep on an ordinary refresh', async () => {
    // `refreshPools` also runs straight after a transaction the app indexed
    // itself, where a sweep is a slow way to re-fetch finished work.
    await store.refreshPools()

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
  let store: PoolStore
  let listContributionsCallable: jest.Mock

  async function loadWithContributions(contributions: (typeof LIVE_CONTRIBUTION)[]) {
    listContributionsCallable.mockResolvedValue({
      data: { contributions, totalCount: contributions.length, limit: 50 },
    })
    await store.fetchPools()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.walletAddress = USER_WALLET
    authStore.chainId = 31337

    store = new PoolStore()
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
    authStore.walletAddress = null
    authStore.chainId = null
  })

  it('does not claim a pool just because someone else funded it', async () => {
    // The regression. `memberships` spans every depositor, so mapping it
    // wholesale turns this list into every funded pool on the chain.
    await loadWithContributions([
      { ...LIVE_CONTRIBUTION, poolId: 31, contributor: USER_WALLET },
      { ...LIVE_CONTRIBUTION, id: '31337-0xdddd-0', poolId: 32, contributor: STRANGER_WALLET },
    ])

    expect(store.myPools.map((pool) => pool.poolId)).toEqual([30, 31])
  })

  it('claims a pool the user owns even with no deposits in it', async () => {
    // A pool you just created is yours to see before any membership exists.
    await loadWithContributions([])

    expect(store.myPools.map((pool) => pool.poolId)).toEqual([30])
  })

  it('claims a pool the user funded but does not own', async () => {
    await loadWithContributions([{ ...LIVE_CONTRIBUTION, poolId: 31, contributor: USER_WALLET }])

    expect(store.myPools.map((pool) => pool.poolId)).toEqual([30, 31])
  })

  it('matches the depositor case-insensitively', async () => {
    // Contributions are stored lowercased; a connected wallet is checksummed.
    authStore.walletAddress = '0x15D34AAf54267DB7D7c367839AAf71A00a2C6A65'
    await loadWithContributions([{ ...LIVE_CONTRIBUTION, poolId: 31, contributor: USER_WALLET }])

    expect(store.myPools.map((pool) => pool.poolId)).toEqual([30, 31])
  })

  it('claims nothing when every pool belongs to someone else', async () => {
    authStore.walletAddress = '0x0000000000000000000000000000000000000099'
    await loadWithContributions([
      { ...LIVE_CONTRIBUTION, poolId: 31, contributor: STRANGER_WALLET },
      { ...LIVE_CONTRIBUTION, id: '31337-0xdddd-0', poolId: 32, contributor: STRANGER_WALLET },
    ])

    expect(store.myPools).toEqual([])
  })

  it('still counts every depositor towards pool liquidity', async () => {
    // The filter belongs in `myPools`, not in `memberships` — narrowing the
    // source would make other people's pools read as empty.
    await loadWithContributions([{ ...LIVE_CONTRIBUTION, poolId: 32, contributor: STRANGER_WALLET, amount: parseEther('7').toString() }])

    expect(store.poolLiquidity(32)).toBe(parseEther('7'))
    expect(store.myPools.map((pool) => pool.poolId)).toEqual([30])
  })
})
