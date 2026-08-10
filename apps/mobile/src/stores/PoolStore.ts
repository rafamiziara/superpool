import type {
  ContributionInfo,
  ListContributionsRequest,
  ListContributionsResponse,
  ListPoolsRequest,
  ListPoolsResponse,
  Loan,
  PoolInfo,
  PoolMember,
  Transaction,
} from '@superpool/types'
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
 * Pools and contributions come from the `listPools` and `listContributions`
 * Cloud Functions. Loans and transactions are still mock-backed — no backend
 * serves them yet — so a load is deliberately hybrid rather than all-or-nothing.
 */
export class PoolStore {
  pools: PoolInfo[] = []
  contributions: ContributionInfo[] = []
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
      this.contributions = []
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
      // Fetched together so pools and the positions in them are one snapshot:
      // a balance shown against a pool that is not in the list, or vice versa,
      // reads as a bug even though each half was individually correct.
      const [pools, contributions]: [PoolInfo[], ContributionInfo[]] = usingMockPools()
        ? [MOCK_POOLS, []]
        : await Promise.all([this.requestPools(params), this.requestContributions(params)])

      runInAction(() => {
        this.pools = pools
        this.contributions = contributions
        this.lastFetchedAt = new Date()
        // Loans and transactions are still mock-backed; see the note on the class.
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

  /**
   * Every contribution on the chain, not just the user's.
   *
   * A pool's liquidity is the sum of what everyone put in, and that is shown on
   * pools the user has not contributed to — so filtering by wallet here would
   * make every pool but their own read as empty.
   */
  private requestContributions = async (params: ListPoolsRequest): Promise<ContributionInfo[]> => {
    const listContributions = httpsCallable<ListContributionsRequest, ListContributionsResponse>(FIREBASE_FUNCTIONS, 'listContributions')

    const response = await listContributions({
      chainId: params.chainId ?? authStore.chainId ?? DEFAULT_CHAIN_ID,
      limit: DEFAULT_PAGE_SIZE,
    })

    // Normalised at the boundary: `memberships` derives from this list and runs
    // during render, so a malformed response would surface as a crashed screen
    // far from the call that caused it.
    return response.data.contributions ?? []
  }

  poolById = (poolId: number): PoolInfo | undefined => {
    return this.pools.find((pool) => pool.poolId === poolId)
  }

  /** Every contribution into one pool, newest first. */
  contributionsFor = (poolId: number): ContributionInfo[] => {
    return this.contributions.filter((contribution) => contribution.poolId === poolId)
  }

  /** Total liquidity a pool has received, in wei. */
  poolLiquidity = (poolId: number): bigint => {
    return this.contributionsFor(poolId).reduce((sum, contribution) => sum + BigInt(contribution.amount), 0n)
  }

  /**
   * Memberships, derived from contributions.
   *
   * `SampleLendingPool` has no membership register — there is nothing on chain
   * to join — so putting money into a pool is what makes someone a member of it.
   * Deriving rather than storing means the two can never disagree.
   *
   * In mock mode the fixtures stand in, so the UI can be worked on without the
   * emulators running.
   */
  get memberships(): PoolMember[] {
    if (usingMockPools()) return MOCK_MEMBERSHIPS

    const byMember = new Map<string, PoolMember>()

    for (const contribution of this.contributions) {
      const key = `${contribution.poolId}-${contribution.contributor}`
      const amount = BigInt(contribution.amount)
      const contributedAt = new Date(contribution.contributedAt)
      const existing = byMember.get(key)

      if (existing) {
        existing.totalContributed += amount
        // No interest accrues and nothing can be withdrawn yet, so a balance is
        // exactly what was put in. This is where earnings would join it.
        existing.currentBalance = existing.totalContributed
        // Membership dates from the first deposit, not the most recent one.
        if (contributedAt < existing.joinedAt) existing.joinedAt = contributedAt
        continue
      }

      byMember.set(key, {
        walletAddress: contribution.contributor,
        poolId: String(contribution.poolId),
        joinedAt: contributedAt,
        totalContributed: amount,
        currentBalance: amount,
        isAdmin: sameAddress(this.poolById(contribution.poolId)?.poolOwner, contribution.contributor),
        status: MemberStatus.ACTIVE,
      })
    }

    return [...byMember.values()]
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
