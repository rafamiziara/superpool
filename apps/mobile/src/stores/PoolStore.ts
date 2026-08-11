import type {
  ContributionInfo,
  ListContributionsRequest,
  ListContributionsResponse,
  ListLoansRequest,
  ListLoansResponse,
  ListPoolsRequest,
  ListPoolsResponse,
  ListWithdrawalsRequest,
  ListWithdrawalsResponse,
  Loan,
  LoanInfo,
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
 * The indexed record's state in the app's vocabulary.
 *
 * `isRepaid` only means anything once the loan was actually funded: the field
 * is false on a request that is still waiting and on one that was turned down,
 * neither of which is an outstanding debt. Reading the two fields in the wrong
 * order is what made a pending request look like a loan to repay.
 */
function loanStatusOf(loan: LoanInfo): LoanStatus {
  if (loan.status === 'requested') return LoanStatus.REQUESTED
  if (loan.status === 'rejected') return LoanStatus.REJECTED

  return loan.isRepaid ? LoanStatus.REPAID : LoanStatus.DISBURSED
}

/** Funded and not yet settled — the only state that owes the pool money. */
function isOutstanding(loan: LoanInfo): boolean {
  return loan.status === 'disbursed' && !loan.isRepaid
}

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
  /** Indexed loans, newest first. Mock fixtures stand in only in mock mode. */
  loanRecords: LoanInfo[] = []
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
      this.loanRecords = []
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
      const [pools, contributions, withdrawals, loans]: [PoolInfo[], ContributionInfo[], WithdrawalInfo[], LoanInfo[]] = usingMockPools()
        ? [MOCK_POOLS, [], [], []]
        : await Promise.all([
            this.requestPools(params),
            this.requestContributions(params),
            this.requestWithdrawals(params),
            this.requestLoans(params),
          ])

      runInAction(() => {
        this.pools = pools
        this.contributions = contributions
        this.withdrawals = withdrawals
        this.loanRecords = loans
        this.lastFetchedAt = new Date()
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

  /**
   * Every loan on the chain, not just the user's.
   *
   * Filtered by wallet only where it is shown as *yours* — a pool's page names
   * how much of its liquidity is currently lent out, which is everyone's loans.
   */
  private requestLoans = async (params: ListPoolsRequest): Promise<LoanInfo[]> => {
    const listLoans = httpsCallable<ListLoansRequest, ListLoansResponse>(FIREBASE_FUNCTIONS, 'listLoans')

    const response = await listLoans({
      chainId: params.chainId ?? authStore.chainId ?? DEFAULT_CHAIN_ID,
      limit: DEFAULT_PAGE_SIZE,
    })

    return response.data.loans ?? []
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
   *
   * `memberships` covers **every** member of every pool — it has to, because
   * pool liquidity is summed across all depositors — so it must be narrowed to
   * this wallet here. Mapping it wholesale yields "every pool anyone has ever
   * deposited into", which quietly turns this list into every funded pool on the
   * chain. That reads as correct for as long as the user is the only depositor
   * indexed, and stops the moment anyone else is.
   */
  get myPools(): PoolInfo[] {
    const memberPoolIds = new Set(
      this.memberships.filter((member) => sameAddress(member.walletAddress, this.userAddress)).map((member) => member.poolId)
    )

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

  /**
   * Indexed loans in the app's `Loan` shape.
   *
   * The contract implements less than this interface describes — no partial
   * repayment and no accrual — so the mapping is partly about being honest where
   * it cannot fill a field:
   *
   * - `status` never reaches `APPROVED` or `DEFAULTED`. Approval disburses in
   *   the same transaction, so an approved loan is already `DISBURSED`, and
   *   nothing on chain marks a loan defaulted.
   * - `interestAccrued` is the whole fixed interest from the moment the loan
   *   exists, because that is genuinely what is owed — it does not grow.
   * - `amountRepaid` is all or nothing, since `repayLoan` takes the full sum.
   * - `dueDate` is `startedAt + duration`, which nothing on chain enforces.
   */
  get loans(): Loan[] {
    if (usingMockPools()) return MOCK_LOANS

    return this.loanRecords.map((loan) => {
      const amount = BigInt(loan.amount)
      const interest = (amount * BigInt(loan.interestRate)) / 10_000n
      const startedAt = new Date(loan.startedAt)
      const isDisbursed = loan.status === 'disbursed'

      return {
        id: loan.id,
        poolId: String(loan.poolId),
        borrower: loan.borrower,
        amount,
        interestRate: loan.interestRate,
        duration: loan.duration,
        status: loanStatusOf(loan),
        amountRepaid: isDisbursed && loan.isRepaid ? amount + interest : 0n,
        interestAccrued: interest,
        requestedAt: startedAt,
        // Approval and disbursement are one moment on chain, and neither has
        // happened while the request is still waiting or after it was refused.
        approvedAt: isDisbursed ? startedAt : undefined,
        disbursedAt: isDisbursed ? startedAt : undefined,
        dueDate: isDisbursed ? new Date(startedAt.getTime() + loan.duration * 1000) : undefined,
        // Never known: `LoanRepaid` is not stored as its own record, and the
        // loan document keeps the *creating* transaction's block so the
        // activity feed dates it consistently.
        repaidAt: undefined,
      }
    })
  }

  get activeLoan(): Loan | undefined {
    return this.loans.find((loan) => loan.status === LoanStatus.DISBURSED && sameAddress(loan.borrower, this.userAddress))
  }

  /**
   * The user's request still waiting on a pool owner, anywhere.
   *
   * Only pools whose owner turned review on can produce one: elsewhere
   * `createLoan` disburses in the same transaction, so there is no
   * requested-but-not-yet-funded state to be in.
   */
  get pendingLoan(): Loan | undefined {
    return this.loans.find((loan) => loan.status === LoanStatus.REQUESTED && sameAddress(loan.borrower, this.userAddress))
  }

  /**
   * The user's outstanding loan in one pool, as the chain records it.
   *
   * Returns the indexed record rather than the mapped `Loan`, because the
   * borrow screen needs `loanId` — `repayLoan` takes the id, and the app's
   * `Loan` has no field for it. At most one can exist: the contract rejects a
   * second loan while one is open.
   *
   * **Disbursed only.** A pending request also has `isRepaid === false`, and
   * matching it here would offer to repay money that never left the pool.
   * A request is `pendingLoanFor`, which is a different panel.
   */
  activeLoanFor = (poolId: number): LoanInfo | undefined => {
    return this.loanRecords.find((loan) => loan.poolId === poolId && isOutstanding(loan) && sameAddress(loan.borrower, this.userAddress))
  }

  /**
   * The user's request in one pool that the owner has not decided on.
   *
   * The counterpart to `activeLoanFor`, and mutually exclusive with it: the
   * contract holds one `activeLoanId` per borrower, so a wallet cannot have both
   * a request and a live loan in the same pool. Carries the `loanId` because
   * `cancelLoanRequest` takes it.
   */
  pendingLoanFor = (poolId: number): LoanInfo | undefined => {
    return this.loanRecords.find(
      (loan) => loan.poolId === poolId && loan.status === 'requested' && sameAddress(loan.borrower, this.userAddress)
    )
  }

  /** Every request in one pool awaiting the owner's decision, for the approvals screen. */
  pendingLoansFor = (poolId: number): LoanInfo[] => {
    return this.loanRecords.filter((loan) => loan.poolId === poolId && loan.status === 'requested')
  }

  /**
   * The user's own pools that have somebody waiting on them.
   *
   * Owner-side work is otherwise invisible until you open the pool, which is the
   * wrong way round: a request costs the borrower nothing to make and the owner
   * everything to miss. This is what lets the dashboard and the pool cards say
   * so without either of them re-deriving it.
   *
   * Ownership is the filter, not membership — you can be a member of a pool
   * whose requests are none of your business.
   */
  get poolsAwaitingMyDecision(): { pool: PoolInfo; requests: LoanInfo[] }[] {
    return this.pools
      .filter((pool) => sameAddress(pool.poolOwner, this.userAddress))
      .map((pool) => ({ pool, requests: this.pendingLoansFor(pool.poolId) }))
      .filter((entry) => entry.requests.length > 0)
  }

  /** How many requests are waiting on the user across every pool they own. */
  get requestsAwaitingMyDecision(): number {
    return this.poolsAwaitingMyDecision.reduce((total, entry) => total + entry.requests.length, 0)
  }

  /**
   * Principal currently lent out of one pool, in wei.
   *
   * Requests are excluded: nothing has moved until an owner approves, so
   * counting them would report liquidity as lent while it is still in the pool.
   */
  outstandingDebt = (poolId: number): bigint => {
    return this.loanRecords
      .filter((loan) => loan.poolId === poolId && isOutstanding(loan))
      .reduce((sum, loan) => sum + BigInt(loan.amount), 0n)
  }

  /**
   * Contributions as activity rows.
   *
   * There is no transactions collection and no callable that serves one:
   * `listContributions` is the only event feed the backend has. Activity is
   * therefore derived from it, the same way memberships are, rather than shown
   * from fixtures. Withdrawals and loans join it from their own feeds — each is
   * a separate `TransactionType`, so the rows merge without changing this shape.
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

  /**
   * Loans as activity rows.
   *
   * Unlike the two above, this is **one row per loan, not one per event**. A
   * contribution is a log and dates itself; a loan is an entity carrying a
   * single timestamp that `startTime` rewrites on approval, and a single
   * `transactionHash` from whichever call created it. There is no repayment
   * timestamp anywhere — `LoanRepaid` is not stored as its own record — so a
   * repayment cannot be given a date, and inventing one by reusing `startedAt`
   * would put it in the feed at the moment the loan went *out*.
   *
   * So each loan appears once, typed by where it currently stands:
   *
   * - `requested` → a request awaiting the owner. `PENDING` here means "awaiting
   *   a decision", not "not yet mined" as it does everywhere else — a request is
   *   confirmed on chain the moment it is made. It is the one honest reading of
   *   the badge for a loan, and the alternative is a row that looks settled
   *   while somebody is still waiting on it.
   * - `disbursed` → the funds left the pool, dated when they did. A repaid loan
   *   stays this row: the disbursement is the part that happened at a time we
   *   know.
   *
   * A rejected or cancelled request is left out. Nothing moved, the request is
   * over, and `TransactionType` has no member that says so — a `LOAN_REQUEST`
   * row would claim it is still waiting.
   */
  get loanActivity(): Transaction[] {
    return this.loanRecords.flatMap((loan) => {
      if (loan.status === 'rejected') return []

      const startedAt = new Date(loan.startedAt)
      const isRequest = loan.status === 'requested'

      return [
        {
          id: loan.id,
          poolId: String(loan.poolId),
          // A request moves nothing; the direction states who is asking whom.
          from: isRequest ? loan.borrower : loan.poolAddress,
          to: isRequest ? loan.poolAddress : loan.borrower,
          type: isRequest ? TransactionType.LOAN_REQUEST : TransactionType.LOAN_DISBURSEMENT,
          amount: BigInt(loan.amount),
          status: isRequest ? TransactionStatus.PENDING : TransactionStatus.CONFIRMED,
          txHash: loan.transactionHash,
          blockNumber: loan.blockNumber,
          createdAt: startedAt,
          confirmedAt: startedAt,
        },
      ]
    })
  }

  /**
   * Everything that happened to every pool, newest first.
   *
   * Pool-wide by construction: the feeds it merges each cover all members,
   * because a pool's liquidity is the sum of everyone's. Right for a pool's own
   * page; wrong for anything headed "your activity", which wants `myActivity`.
   */
  get recentTransactions(): Transaction[] {
    return [...this.transactions, ...this.contributionActivity, ...this.withdrawalActivity, ...this.loanActivity]
      .filter((tx) => tx.status !== TransactionStatus.CANCELLED)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * The connected wallet's own activity, newest first.
   *
   * Matched on either end of the row rather than on `from` alone, because which
   * end holds the member depends on the direction: a contribution comes *from*
   * them, a withdrawal and a disbursed loan go *to* them. The other end is
   * always the pool, so a row can never match on the wrong side.
   *
   * With no wallet connected `userAddress` is `''`, and `sameAddress` refuses to
   * match an empty address against anything — so this is empty rather than
   * everything, which is the failure worth having.
   *
   * Rows from here must be rendered with the `wallet` perspective: on this feed
   * a disbursed loan is money the user *received*, and the pool's sign for it
   * would mark it negative.
   */
  get myActivity(): Transaction[] {
    return this.recentTransactions.filter((tx) => sameAddress(tx.from, this.userAddress) || sameAddress(tx.to, this.userAddress))
  }
}

export const poolStore = new PoolStore()
