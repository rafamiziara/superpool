import { LoanStatus, MemberStatus } from '@superpool/types'
import { parseEther } from 'viem'
import { MOCK_USER_ADDRESS } from '../mocks/lending'
import { PoolStore } from './PoolStore'

describe('PoolStore', () => {
  let store: PoolStore

  beforeEach(async () => {
    store = new PoolStore()
    await store.loadPools()
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
