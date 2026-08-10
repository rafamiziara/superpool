import type { PoolInfo } from '@superpool/types'
import { LoanStatus, MemberStatus } from '@superpool/types'
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

describe('PoolStore against listPools', () => {
  let store: PoolStore
  let listPoolsCallable: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.EXPO_PUBLIC_USE_MOCK_POOLS

    authStore.walletAddress = null
    authStore.chainId = 31337

    store = new PoolStore()
    listPoolsCallable = jest.fn().mockResolvedValue({
      data: { pools: [LIVE_POOL], totalCount: 1, page: 1, limit: 50, hasNextPage: false, hasPreviousPage: false },
    })
    mockFirebaseCallable.mockReturnValue(listPoolsCallable)
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
