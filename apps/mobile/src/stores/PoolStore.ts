import type { ListPoolsRequest, ListPoolsResponse, Loan, PoolInfo, PoolMember, Transaction } from '@superpool/types'
import { LoanStatus, MemberStatus, TransactionStatus } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { makeAutoObservable, runInAction } from 'mobx'
import { DEFAULT_CHAIN_ID } from '../config/contracts'
import { FIREBASE_FUNCTIONS } from '../config/firebase'
import { MOCK_LOANS, MOCK_MEMBERSHIPS, MOCK_POOLS, MOCK_TRANSACTIONS, MOCK_USER_ADDRESS } from '../mocks/lending'
import { sameAddress } from '../utils/format'
import { authStore } from './AuthStore'

/**
 * Mock pools are opt-in. The backend is the default source; set
 * `EXPO_PUBLIC_USE_MOCK_POOLS=true` to work on the UI without the Functions
 * emulator running.
 *
 * Read per call rather than once at import: a module-level constant would freeze
 * the choice before any test could change it.
 */
function usingMockPools(): boolean {
  return process.env.EXPO_PUBLIC_USE_MOCK_POOLS === 'true'
}

const DEFAULT_PAGE_SIZE = 50

/**
 * Lending pool state.
 *
 * Pools come from the `listPools` Cloud Function. Memberships, loans and
 * transactions are still mock-backed — no backend serves them yet — so a load
 * is deliberately hybrid rather than all-or-nothing.
 */
export class PoolStore {
  pools: PoolInfo[] = []
  memberships: PoolMember[] = []
  loans: Loan[] = []
  transactions: Transaction[] = []

  /** Initial loads. Pull-to-refresh uses `isRefreshing` so the list is not torn down. */
  isLoading = false
  isRefreshing = false
  error: string | null = null
  lastFetchedAt: Date | null = null

  constructor() {
    makeAutoObservable(this)
  }

  /** The connected wallet, or the mock user when running on mock data. */
  get userAddress(): string {
    if (authStore.walletAddress) return authStore.walletAddress

    return usingMockPools() ? MOCK_USER_ADDRESS : ''
  }

  get hasError(): boolean {
    return this.error !== null
  }

  get isEmpty(): boolean {
    return !this.isLoading && this.pools.length === 0
  }

  get poolCount(): number {
    return this.pools.length
  }

  /** Loads pools for an initial render. Never throws — failures land in `error`. */
  fetchPools = async (params: ListPoolsRequest = {}): Promise<void> => {
    await this.load(params, 'initial')
  }

  /** Same as `fetchPools`, but leaves the current list on screen while it runs. */
  refreshPools = async (params: ListPoolsRequest = {}): Promise<void> => {
    await this.load(params, 'refresh')
  }

  reset = (): void => {
    runInAction(() => {
      this.pools = []
      this.memberships = []
      this.loans = []
      this.transactions = []
      this.isLoading = false
      this.isRefreshing = false
      this.error = null
      this.lastFetchedAt = null
    })
  }

  private load = async (params: ListPoolsRequest, mode: 'initial' | 'refresh'): Promise<void> => {
    runInAction(() => {
      if (mode === 'refresh') this.isRefreshing = true
      else this.isLoading = true
      this.error = null
    })

    try {
      const pools = usingMockPools() ? MOCK_POOLS : await this.requestPools(params)

      runInAction(() => {
        this.pools = pools
        this.lastFetchedAt = new Date()
        // Everything below is still mock-backed; see the note on the class.
        this.memberships = MOCK_MEMBERSHIPS
        this.loans = MOCK_LOANS
        this.transactions = MOCK_TRANSACTIONS
      })
    } catch (error) {
      // Screens read `error`; a store that throws would take the screen with it.
      runInAction(() => {
        this.error = error instanceof Error ? error.message : 'Could not load pools'
      })
    } finally {
      runInAction(() => {
        this.isLoading = false
        this.isRefreshing = false
      })
    }
  }

  private requestPools = async (params: ListPoolsRequest): Promise<PoolInfo[]> => {
    const listPools = httpsCallable<ListPoolsRequest, ListPoolsResponse>(FIREBASE_FUNCTIONS, 'listPools')

    const response = await listPools({
      chainId: authStore.chainId ?? DEFAULT_CHAIN_ID,
      activeOnly: true,
      limit: DEFAULT_PAGE_SIZE,
      ...params,
    })

    return response.data.pools
  }

  poolById = (poolId: number): PoolInfo | undefined => {
    return this.pools.find((pool) => pool.poolId === poolId)
  }

  membershipFor = (poolId: number): PoolMember | undefined => {
    return this.memberships.find((member) => member.poolId === String(poolId) && sameAddress(member.walletAddress, this.userAddress))
  }

  transactionsFor = (poolId: number): Transaction[] => {
    return this.recentTransactions.filter((tx) => tx.poolId === String(poolId))
  }

  /**
   * Pools the user belongs to or owns, newest first.
   *
   * Ownership counts on its own: a pool you just created is yours to see before
   * any membership record exists for it.
   */
  get myPools(): PoolInfo[] {
    const memberPoolIds = new Set(this.memberships.map((member) => member.poolId))

    return this.pools.filter((pool) => memberPoolIds.has(String(pool.poolId)) || sameAddress(pool.poolOwner, this.userAddress))
  }

  /** Sum of the user's active balances across pools (wei). */
  get totalBalance(): bigint {
    return this.activeMemberships.reduce((sum, member) => sum + member.currentBalance, 0n)
  }

  /** Lifetime earnings: current balances minus what was contributed (wei). */
  get totalEarned(): bigint {
    return this.activeMemberships.reduce((sum, member) => sum + (member.currentBalance - member.totalContributed), 0n)
  }

  get activeMemberships(): PoolMember[] {
    return this.memberships.filter((member) => member.status === MemberStatus.ACTIVE && sameAddress(member.walletAddress, this.userAddress))
  }

  get activeLoan(): Loan | undefined {
    return this.loans.find((loan) => loan.status === LoanStatus.DISBURSED && sameAddress(loan.borrower, this.userAddress))
  }

  get pendingLoan(): Loan | undefined {
    return this.loans.find((loan) => loan.status === LoanStatus.REQUESTED && sameAddress(loan.borrower, this.userAddress))
  }

  get recentTransactions(): Transaction[] {
    return [...this.transactions]
      .filter((tx) => tx.status !== TransactionStatus.CANCELLED)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }
}

export const poolStore = new PoolStore()
