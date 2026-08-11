import type {
  ContributionInfo,
  ListContributionsRequest,
  ListContributionsResponse,
  ListPoolsRequest,
  ListPoolsResponse,
  ListWithdrawalsRequest,
  ListWithdrawalsResponse,
  Loan,
  PoolInfo,
  PoolMember,
  SyncPoolEventsRequest,
  SyncPoolEventsResponse,
  Transaction,
  WithdrawalInfo,
} from '@superpool/types'
import { LoanStatus, MemberStatus, TransactionStatus, TransactionType } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { makeAutoObservable, runInAction } from 'mobx'
import { DEFAULT_CHAIN_ID } from '../config/contracts'
import { FIREBASE_FUNCTIONS } from '../config/firebase'
import { MOCK_LOANS, MOCK_MEMBERSHIPS, MOCK_POOLS, MOCK_TRANSACTIONS, MOCK_USER_ADDRESS } from '../mocks/lending'
import { sameAddress } from '../utils/format'
import { logger } from '../utils/logger'
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
 * Pools, contributions and withdrawals come from the `listPools`,
 * `listContributions` and `listWithdrawals` Cloud Functions. Positions and
 * liquidity are deposits minus withdrawals, summed on read — nothing is stored,
 * so nothing can fall out of step with the chain. Activity is derived from the
 * same events rather than fetched; there is no transactions collection. Loans
 * are still mock-backed, no backend serves them yet, so a load is deliberately
 * hybrid rather than all-or-nothing.
 */
export class PoolStore {
  pools: PoolInfo[] = []
  contributions: ContributionInfo[] = []
  withdrawals: WithdrawalInfo[] = []
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

  /**
   * Pull-to-refresh: sweep the chain for events the backend has not seen, then
   * reload.
   *
   * Ordered that way so one pull is enough — reloading first would list what
   * Firestore already had and only show the swept events on the *next* pull.
   *
   * `isRefreshing` is raised here rather than left to `load`, so the spinner
   * covers the sweep as well. Without it the control snaps back and the screen
   * sits still through the slower half of the refresh.
   *
   * Kept separate from `refreshPools` because that one also runs straight after
   * a transaction the app just indexed itself, where a sweep would be a slow way
   * to re-fetch work that is already done.
   */
  syncAndRefresh = async (params: ListPoolsRequest = {}): Promise<void> => {
    runInAction(() => {
      this.isRefreshing = true
    })

    await this.syncFromChain(params)
    await this.load(params, 'refresh')
  }

  /**
   * Ask the backend to index anything on chain it has not stored yet.
   *
   * `listPools` and its siblings read Firestore, so whatever happened outside
   * this app — a pool created from a script, a deposit whose immediate indexing
   * failed, a transaction confirmed while the app was closed — stays invisible
   * until something sweeps it in. `syncPoolEvents` is that something on a
   * schedule; this is the user asking for it now.
   *
   * Best effort, and never throws: the pools already in Firestore load either
   * way, and a sweep that could not reach the chain is not a problem the user
   * can act on. Same reasoning as `usePoolIndexing`, and the same reason the
   * caller does not need a `try`.
   */
  syncFromChain = async (params: ListPoolsRequest = {}): Promise<void> => {
    if (usingMockPools()) return

    try {
      const syncPoolEventsNow = httpsCallable<SyncPoolEventsRequest, SyncPoolEventsResponse>(FIREBASE_FUNCTIONS, 'syncPoolEventsNow')

      const response = await syncPoolEventsNow({ chainId: params.chainId ?? authStore.chainId ?? DEFAULT_CHAIN_ID })

      logger.debug('🧹 Swept chain events:', response.data)
    } catch (error) {
      // Deliberately not surfaced — see the note on this method.
      logger.warn('Chain sync failed; listing what is already indexed:', error)
    }
  }

  reset = (): void => {
    runInAction(() => {
      this.pools = []
      this.contributions = []
      this.withdrawals = []
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
      const [pools, contributions, withdrawals]: [PoolInfo[], ContributionInfo[], WithdrawalInfo[]] = usingMockPools()
        ? [MOCK_POOLS, [], []]
        : await Promise.all([this.requestPools(params), this.requestContributions(params), this.requestWithdrawals(params)])

      runInAction(() => {
        this.pools = pools
        this.contributions = contributions
        this.withdrawals = withdrawals
        this.lastFetchedAt = new Date()
        // Loans are still mock-backed; see the note on the class.
        this.loans = MOCK_LOANS
        // Activity is derived from contributions when they are real — see
        // `contributionActivity`. The fixtures only stand in for mock mode.
        this.transactions = usingMockPools() ? MOCK_TRANSACTIONS : []
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

  /**
   * Every withdrawal on the chain, for the same reason contributions are not
   * filtered by wallet: a pool's liquidity is what everyone put in minus what
   * everyone took out.
   */
  private requestWithdrawals = async (params: ListPoolsRequest): Promise<WithdrawalInfo[]> => {
    const listWithdrawals = httpsCallable<ListWithdrawalsRequest, ListWithdrawalsResponse>(FIREBASE_FUNCTIONS, 'listWithdrawals')

    const response = await listWithdrawals({
      chainId: params.chainId ?? authStore.chainId ?? DEFAULT_CHAIN_ID,
      limit: DEFAULT_PAGE_SIZE,
    })

    return response.data.withdrawals ?? []
  }

  poolById = (poolId: number): PoolInfo | undefined => {
    return this.pools.find((pool) => pool.poolId === poolId)
  }

  /** Every contribution into one pool, newest first. */
  contributionsFor = (poolId: number): ContributionInfo[] => {
    return this.contributions.filter((contribution) => contribution.poolId === poolId)
  }

  /** Every withdrawal out of one pool. */
  withdrawalsFor = (poolId: number): WithdrawalInfo[] => {
    return this.withdrawals.filter((withdrawal) => withdrawal.poolId === poolId)
  }

  /**
   * Liquidity a pool currently holds, in wei: deposits minus withdrawals.
   *
   * Not the same as the contract's `totalFunds` once loans are outstanding —
   * this is what members are owed, not what the pool can pay today. A screen
   * that needs the payable figure has to read the chain.
   */
  poolLiquidity = (poolId: number): bigint => {
    const deposited = this.contributionsFor(poolId).reduce((sum, contribution) => sum + BigInt(contribution.amount), 0n)
    const withdrawn = this.withdrawalsFor(poolId).reduce((sum, withdrawal) => sum + BigInt(withdrawal.amount), 0n)

    // Clamped because the two lists are paged independently: a withdrawal can
    // be indexed while the deposit that funded it has fallen off the page,
    // and a negative liquidity figure is worse than a low one.
    const remaining = deposited - withdrawn

    return remaining > 0n ? remaining : 0n
  }

  /**
   * Memberships, derived from contributions and withdrawals.
   *
   * `SampleLendingPool` has no membership register — there is nothing on chain
   * to join — so putting money into a pool is what makes someone a member of it.
   * Deriving rather than storing means the two can never disagree.
   *
   * `totalContributed` is lifetime deposits and only ever grows; `currentBalance`
   * is what is left after withdrawals. Keeping them apart is what lets a member
   * who has taken everything out still read as a past member rather than
   * vanishing, and it is why `totalEarned` subtracts one from the other.
   *
   * In mock mode the fixtures stand in, so the UI can be worked on without the
   * emulators running.
   */
  get memberships(): PoolMember[] {
    if (usingMockPools()) return MOCK_MEMBERSHIPS

    const byMember = new Map<string, PoolMember>()

    for (const contribution of this.contributions) {
      const key = `${contribution.poolId}-${contribution.contributor.toLowerCase()}`
      const amount = BigInt(contribution.amount)
      const contributedAt = new Date(contribution.contributedAt)
      const existing = byMember.get(key)

      if (existing) {
        existing.totalContributed += amount
        existing.currentBalance += amount
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

    for (const withdrawal of this.withdrawals) {
      const existing = byMember.get(`${withdrawal.poolId}-${withdrawal.member.toLowerCase()}`)

      // A withdrawal with no matching deposit means the deposit fell off the
      // page, not that someone withdrew what they never put in — the contract
      // makes that impossible. Skipping is better than inventing a member with
      // a negative balance.
      if (!existing) continue

      const amount = BigInt(withdrawal.amount)

      existing.currentBalance = existing.currentBalance > amount ? existing.currentBalance - amount : 0n
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

  /**
   * Lifetime earnings: current balances minus what was contributed (wei).
   *
   * Zero against real data today, and honestly so. Interest reaches the pool
   * through `repayLoan` but the contract has no way to distribute it — a member
   * can only ever withdraw what they put in — so there is nothing to credit
   * anyone. Clamped per member because a withdrawal makes `currentBalance` fall
   * below `totalContributed`, and reporting that difference as negative earnings
   * would be wrong rather than merely empty.
   */
  get totalEarned(): bigint {
    return this.activeMemberships.reduce((sum, member) => {
      const earned = member.currentBalance - member.totalContributed

      return sum + (earned > 0n ? earned : 0n)
    }, 0n)
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

  /**
   * Contributions as activity rows.
   *
   * There is no transactions collection and no callable that serves one:
   * `listContributions` is the only event feed the backend has. Activity is
   * therefore derived from it, the same way memberships are, rather than shown
   * from fixtures. Withdrawals, loans and repayments join this list once
   * something indexes them — each is a separate `TransactionType`, so the rows
   * merge without changing this shape.
   *
   * The contribution id is already `${chainId}-${txHash}-${logIndex}`, so it
   * carries over as the row key unchanged and stays stable across refetches.
   */
  get contributionActivity(): Transaction[] {
    return this.contributions.map((contribution) => {
      const contributedAt = new Date(contribution.contributedAt)

      return {
        id: contribution.id,
        poolId: String(contribution.poolId),
        from: contribution.contributor,
        to: contribution.poolAddress,
        type: TransactionType.CONTRIBUTION,
        amount: BigInt(contribution.amount),
        // Only mined events are indexed, so anything here is confirmed. In-flight
        // deposits live in PendingTransactionsStore and surface as pending cards.
        status: TransactionStatus.CONFIRMED,
        txHash: contribution.transactionHash,
        blockNumber: contribution.blockNumber,
        createdAt: contributedAt,
        confirmedAt: contributedAt,
      }
    })
  }

  /** Withdrawals as activity rows, the mirror of `contributionActivity`. */
  get withdrawalActivity(): Transaction[] {
    return this.withdrawals.map((withdrawal) => {
      const withdrawnAt = new Date(withdrawal.withdrawnAt)

      return {
        id: withdrawal.id,
        poolId: String(withdrawal.poolId),
        from: withdrawal.poolAddress,
        to: withdrawal.member,
        type: TransactionType.WITHDRAWAL,
        amount: BigInt(withdrawal.amount),
        status: TransactionStatus.CONFIRMED,
        txHash: withdrawal.transactionHash,
        blockNumber: withdrawal.blockNumber,
        createdAt: withdrawnAt,
        confirmedAt: withdrawnAt,
      }
    })
  }

  get recentTransactions(): Transaction[] {
    return [...this.transactions, ...this.contributionActivity, ...this.withdrawalActivity]
      .filter((tx) => tx.status !== TransactionStatus.CANCELLED)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }
}

export const poolStore = new PoolStore()
