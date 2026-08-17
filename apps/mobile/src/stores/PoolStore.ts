import type {
  BorrowerHistory,
  ContributionInfo,
  InterestClaimInfo,
  ListContributionsRequest,
  ListContributionsResponse,
  ListInterestClaimsRequest,
  ListInterestClaimsResponse,
  ListLoanRepaymentsRequest,
  ListLoanRepaymentsResponse,
  ListLoansRequest,
  ListLoansResponse,
  ListMembersRequest,
  ListMembersResponse,
  ListPoolsRequest,
  ListPoolsResponse,
  ListWithdrawalsRequest,
  ListWithdrawalsResponse,
  Loan,
  LoanInfo,
  LoanRepaymentInfo,
  MemberInfo,
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
import { type Denomination, denominationFor } from '../utils/denomination'
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
 * Interest accrued on a loan and not yet paid, right now.
 *
 * The indexed record carries a **snapshot** — `interestOutstanding` as of
 * `accruedAt` — because interest grows per second and nothing writes to the
 * chain in between. This projects it forward the same way the contract does:
 * on the principal still out, at `interestRate` over `duration`, with no cap
 * once the term has passed.
 *
 * Two things it is careful about, both mirroring `LendingPool._balanceAt`:
 *
 * - **No `accruedAt` means the figures are static.** A loan made before
 *   interest accrued is priced on the flat terms it was made under and stays
 *   there until its first payment converts it, so projecting one forward would
 *   show interest the contract will not ask for.
 * - **Time never runs backwards.** A device clock behind the chain's would
 *   otherwise produce a rebate.
 *
 * **For display only.** It runs against the device clock and the contract runs
 * against block time, so the two disagree by seconds — and on a local node
 * whose clock has been pushed forward, by hours. Anything about to send money
 * reads `outstandingBalanceAt` from the chain instead.
 */
function accruedInterestNow(loan: LoanInfo, now: number = Date.now()): bigint {
  const snapshot = BigInt(loan.interestOutstanding)
  const principal = BigInt(loan.principalOutstanding)

  if (!loan.accruedAt || principal === 0n || loan.duration === 0) return snapshot

  const elapsed = Math.floor((now - new Date(loan.accruedAt).getTime()) / 1000)

  if (elapsed <= 0) return snapshot

  return snapshot + (principal * BigInt(loan.interestRate) * BigInt(elapsed)) / (10_000n * BigInt(loan.duration))
}

/**
 * What is still owed on a loan, right now.
 *
 * Principal plus the interest accrued against it — which grows between reads,
 * unlike the fixed sum this returned while the rate was flat. Zero once the
 * loan is settled, and — deliberately — also zero on anything that is not an
 * open debt, mirroring the contract's `outstandingBalance`: a request nobody
 * approved owes nothing, however much it asked for.
 */
function remainingBalance(loan: LoanInfo): bigint {
  if (!isOutstanding(loan)) return 0n

  return BigInt(loan.principalOutstanding) + accruedInterestNow(loan)
}

/**
 * The register's wire status, in the enum the UI reads.
 *
 * `none` is in the wire type because it is the contract's zero value, but no
 * stored record carries it — an address nobody has heard of has no document.
 * Should one arrive anyway, `LEFT` is the safe reading: it says "not in this
 * pool" without claiming the owner did anything.
 */
function memberStatusFrom(status: MemberInfo['status']): MemberStatus {
  switch (status) {
    case 'requested':
      return MemberStatus.PENDING
    case 'active':
      return MemberStatus.ACTIVE
    case 'rejected':
      return MemberStatus.REJECTED
    case 'removed':
      return MemberStatus.SUSPENDED
    default:
      return MemberStatus.LEFT
  }
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
  /**
   * Interest members have taken out of pools, indexed.
   *
   * Half of what a member has earned; the other half is still on the pool and
   * has to be read from the chain — see `claimableByPool`.
   */
  interestClaims: InterestClaimInfo[] = []
  /**
   * Interest a pool has credited the connected wallet and not yet paid out, by
   * pool id, in wei as a decimal string.
   *
   * Written from outside, by whatever reads `claimable(address)` from the chain,
   * because this store speaks to Firestore and nothing else. It cannot be
   * derived from the indexed feeds at all: accrual is a consequence of other
   * people's repayments and emits nothing per member.
   */
  claimableByPool: Record<number, string> = {}
  /**
   * Payments made towards loans, newest first.
   *
   * Its own feed rather than a field on the loan, because a loan can be paid
   * down in instalments and only the payment that settles it is dated on the
   * loan record. Without these the activity feed could show one row for a debt
   * that came back in four transactions, at the wrong time and for the wrong
   * amount.
   */
  loanRepayments: LoanRepaymentInfo[] = []
  /** Indexed loans, newest first. Mock fixtures stand in only in mock mode. */
  loanRecords: LoanInfo[] = []
  /**
   * The on-chain membership register, indexed.
   *
   * Where `memberships` used to invent a status, this supplies it. Balances are
   * still derived from contributions and withdrawals — the register says who
   * belongs, never how much they hold.
   */
  memberRecords: MemberInfo[] = []
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
      this.interestClaims = []
      this.claimableByPool = {}
      this.loanRecords = []
      this.loanRepayments = []
      this.memberRecords = []
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
      const [pools, contributions, withdrawals, claims, loans, repayments, members]: [
        PoolInfo[],
        ContributionInfo[],
        WithdrawalInfo[],
        InterestClaimInfo[],
        LoanInfo[],
        LoanRepaymentInfo[],
        MemberInfo[],
      ] = usingMockPools()
        ? [MOCK_POOLS, [], [], [], [], [], []]
        : await Promise.all([
            this.requestPools(params),
            this.requestContributions(params),
            this.requestWithdrawals(params),
            this.requestInterestClaims(params),
            this.requestLoans(params),
            this.requestLoanRepayments(params),
            this.requestMembers(params),
          ])

      runInAction(() => {
        this.pools = pools
        this.contributions = contributions
        this.withdrawals = withdrawals
        this.interestClaims = claims
        this.loanRecords = loans
        this.loanRepayments = repayments
        this.memberRecords = members
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
   * Every interest claim on the chain, not just the user's.
   *
   * Unfiltered for the same reason contributions are: a pool's page shows what
   * it has paid out in interest, which is everyone's claims.
   */
  private requestInterestClaims = async (params: ListPoolsRequest): Promise<InterestClaimInfo[]> => {
    const listInterestClaims = httpsCallable<ListInterestClaimsRequest, ListInterestClaimsResponse>(
      FIREBASE_FUNCTIONS,
      'listInterestClaims'
    )

    const response = await listInterestClaims({
      chainId: params.chainId ?? authStore.chainId ?? DEFAULT_CHAIN_ID,
      limit: DEFAULT_PAGE_SIZE,
    })

    return response.data.claims ?? []
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

  /**
   * Every payment towards a loan on the chain, not just the user's.
   *
   * Unfiltered for the same reason loans are: a pool's page shows money coming
   * back into it, which is everyone's repayments.
   */
  private requestLoanRepayments = async (params: ListPoolsRequest): Promise<LoanRepaymentInfo[]> => {
    const listLoanRepayments = httpsCallable<ListLoanRepaymentsRequest, ListLoanRepaymentsResponse>(
      FIREBASE_FUNCTIONS,
      'listLoanRepayments'
    )

    const response = await listLoanRepayments({
      chainId: params.chainId ?? authStore.chainId ?? DEFAULT_CHAIN_ID,
      limit: DEFAULT_PAGE_SIZE,
    })

    return response.data.repayments ?? []
  }

  /**
   * The whole register, not just the user's own standing.
   *
   * Not narrowed to `activeOnly`: the app has to tell "never asked" from "asked
   * and turned down" — a rejected applicant sees a different screen from a
   * stranger — and a pool owner's queue is exactly the rows that are not
   * active.
   */
  private requestMembers = async (params: ListPoolsRequest): Promise<MemberInfo[]> => {
    const listMembers = httpsCallable<ListMembersRequest, ListMembersResponse>(FIREBASE_FUNCTIONS, 'listMembers')

    const response = await listMembers({
      chainId: params.chainId ?? authStore.chainId ?? DEFAULT_CHAIN_ID,
      limit: DEFAULT_PAGE_SIZE,
    })

    return response.data.members ?? []
  }

  poolById = (poolId: number): PoolInfo | undefined => {
    return this.pools.find((pool) => pool.poolId === poolId)
  }

  /**
   * What a pool lends, or `undefined` where the app cannot say — either because
   * the pool is not loaded or because it is denominated in a token the backend
   * could not read.
   *
   * Here rather than at each screen because a wallet-wide feed mixes pools, and
   * therefore mixes units: a row's denomination is a property of its pool, not
   * of the list it is in.
   */
  denominationFor = (poolId: number): Denomination | undefined => {
    const pool = this.poolById(poolId)

    return pool ? denominationFor(pool) : undefined
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
   * Memberships: standing from the register, money from the events.
   *
   * The split is the point. `LendingPool` now has a register, so who
   * belongs is a fact read from `membership(address)` rather than inferred from
   * having deposited — which is what lets a private pool have members who have
   * not funded it, and a removed member who still has a balance to withdraw.
   * Balances stay summed from contributions and withdrawals, because those are
   * events and nothing about them is stored twice.
   *
   * An address appears here if it is in *either* source. The register alone
   * covers someone the owner admitted who has not deposited; the events alone
   * cover a pool indexed before this shipped, or one whose membership log the
   * sweep has not reached yet — and those default to `ACTIVE`, which is what
   * depositing has always meant.
   *
   * `totalContributed` is lifetime deposits and only ever grows; `currentBalance`
   * is what is left after withdrawals. Keeping them apart is what lets a member
   * who has taken everything out still read as a past member rather than
   * vanishing. Neither is earnings: interest is credited separately by the
   * contract and never lands in a contribution — see `totalEarned`.
   *
   * In mock mode the fixtures stand in, so the UI can be worked on without the
   * emulators running.
   */
  get memberships(): PoolMember[] {
    if (usingMockPools()) return MOCK_MEMBERSHIPS

    const byMember = new Map<string, PoolMember>()

    // The register first, so every standing the chain knows about exists before
    // the events add money to it. Balances start at zero: an admitted member
    // who has not deposited holds nothing, which is exactly what the chain says.
    for (const member of this.memberRecords) {
      byMember.set(`${member.poolId}-${member.account.toLowerCase()}`, {
        walletAddress: member.account,
        poolId: String(member.poolId),
        joinedAt: new Date(member.joinedAt),
        totalContributed: 0n,
        currentBalance: 0n,
        isAdmin: sameAddress(this.poolById(member.poolId)?.poolOwner, member.account),
        status: memberStatusFrom(member.status),
      })
    }

    for (const contribution of this.contributions) {
      const key = `${contribution.poolId}-${contribution.contributor.toLowerCase()}`
      const amount = BigInt(contribution.amount)
      const contributedAt = new Date(contribution.contributedAt)
      const existing = byMember.get(key)

      if (existing) {
        existing.totalContributed += amount
        existing.currentBalance += amount
        // Membership dates from the first deposit, not the most recent one —
        // and from the register's own date when there is one, since being
        // admitted precedes funding.
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

  /**
   * Pools the user has no standing in at all — what Discover offers.
   *
   * Defined as the complement of `myPools` so there is one rule rather than
   * two: anything the Pools tab shows, this one does not. That deliberately
   * covers more than "member" — a pool the user has asked to join, been
   * rejected from, or been removed from all have a record here, and all of them
   * belong on the tab that can say what happened rather than in a list of
   * strangers.
   *
   * `pools` is already chain-wide: `requestPools` filters by `chainId` and
   * `activeOnly`, never by wallet, so nothing extra has to be fetched for this.
   * What it is *not* is exhaustive — the list is one page of
   * `DEFAULT_PAGE_SIZE`, so on a busy chain this is the newest 50 pools and the
   * search below searches those. Real discovery needs a server-side query.
   */
  get discoverablePools(): PoolInfo[] {
    const mine = new Set(this.myPools.map((pool) => pool.poolId))

    return this.pools.filter((pool) => !mine.has(pool.poolId))
  }

  /**
   * How many members a pool has, for a card that cannot show "your balance".
   *
   * Counts everyone the register or the events place in the pool, minus the
   * standings that mean "not in it": a pending applicant is not a member yet,
   * and a rejected or removed one is not one any more.
   */
  memberCountFor = (poolId: number): number => {
    return this.memberships.filter((member) => member.poolId === String(poolId) && member.status === MemberStatus.ACTIVE).length
  }

  /** Sum of the user's active balances across pools (wei). */
  get totalBalance(): bigint {
    return this.activeMemberships.reduce((sum, member) => sum + member.currentBalance, 0n)
  }

  /** Interest the connected wallet has already taken out, across pools (wei). */
  get claimedInterest(): bigint {
    return this.interestClaims
      .filter((claim) => sameAddress(claim.account, this.userAddress))
      .reduce((sum, claim) => sum + BigInt(claim.amount), 0n)
  }

  /** Interest credited to the connected wallet and not yet taken out (wei). */
  get claimableInterest(): bigint {
    return Object.values(this.claimableByPool).reduce((sum, amount) => sum + BigInt(amount), 0n)
  }

  /**
   * Lifetime earnings: what has been claimed plus what is still claimable (wei).
   *
   * It used to be `currentBalance - totalContributed`, clamped at zero, which
   * was a stand-in for an accounting that did not exist — interest reached the
   * pool through `repayLoan` and was credited to nobody, so the figure was
   * structurally zero. The contract distributes it now, and both halves of the
   * answer are read rather than inferred: claims from the indexed events,
   * accrual from the chain.
   *
   * The two must be added, not chosen between. Claiming moves an amount from one
   * to the other, so reporting either alone makes lifetime earnings drop the
   * moment someone takes their money.
   *
   * `claimableByPool` is empty until something reads the chain into it, so this
   * reports claims alone on a screen that has not — which understates rather
   * than invents.
   */
  get totalEarned(): bigint {
    return this.claimedInterest + this.claimableInterest
  }

  /**
   * Records what the chain says one pool currently owes the connected wallet.
   *
   * The way `claimable` gets into the store: an action rather than a fetch,
   * because reading it needs a wallet-aware contract call and this store has no
   * chain access of its own.
   */
  setClaimable = (poolId: number, amount: bigint): void => {
    runInAction(() => {
      this.claimableByPool = { ...this.claimableByPool, [poolId]: amount.toString() }
    })
  }

  /**
   * The connected wallet's live positions.
   *
   * A member who still holds a balance counts whatever the register says about
   * them. Removal and leaving take away what you may do next, never what you
   * already put in — `withdraw` is deliberately ungated on membership — so
   * filtering on `ACTIVE` alone would hide money the user can still take out,
   * which is the worst thing this getter could do.
   *
   * Conversely an `ACTIVE` member with nothing in counts too: they were admitted
   * to a private pool and have yet to fund it, and a pool they belong to should
   * not be missing from their own list.
   */
  get activeMemberships(): PoolMember[] {
    return this.memberships.filter(
      (member) =>
        (member.status === MemberStatus.ACTIVE || member.currentBalance > 0n) && sameAddress(member.walletAddress, this.userAddress)
    )
  }

  /**
   * Indexed loans in the app's `Loan` shape.
   *
   * The contract implements less than this interface describes — no accrual, no
   * default — so the mapping is partly about being honest where it cannot fill
   * a field:
   *
   * - `status` never reaches `APPROVED` or `DEFAULTED`. Approval disburses in
   *   the same transaction, so an approved loan is already `DISBURSED`, and
   *   nothing on chain marks a loan defaulted.
   * - `dueDate` is `startedAt + duration`, which nothing on chain enforces.
   *
   * `amountRepaid` is no longer one of them: it is the chain's own running
   * total. Neither is `interestAccrued`, which genuinely grows now — it is the
   * snapshot on the record projected to this moment, and therefore a figure
   * that changes between renders.
   */
  get loans(): Loan[] {
    if (usingMockPools()) return MOCK_LOANS

    return this.loanRecords.map((loan) => {
      const amount = BigInt(loan.amount)
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
        // The chain's figure, not a re-derivation of it. Reading `isRepaid` to
        // decide between 0 and the whole sum — which is what this did while
        // repayment was all-or-nothing — would report a part-paid loan as
        // untouched.
        amountRepaid: isDisbursed ? BigInt(loan.amountRepaid) : 0n,
        // What has actually accrued and is still owed, not the full term's
        // worth. Nothing is owed on a request that was never funded.
        interestAccrued: isDisbursed ? accruedInterestNow(loan) : 0n,
        requestedAt: startedAt,
        // Approval and disbursement are one moment on chain, and neither has
        // happened while the request is still waiting or after it was refused.
        approvedAt: isDisbursed ? startedAt : undefined,
        disbursedAt: isDisbursed ? startedAt : undefined,
        dueDate: isDisbursed ? new Date(startedAt.getTime() + loan.duration * 1000) : undefined,
        // The chain's own stamp, not the indexer's sighting. Still absent on a
        // loan settled before the contract recorded one, which is why nothing
        // reads this to decide *whether* a loan was repaid.
        repaidAt: loan.repaidAt ? new Date(loan.repaidAt) : undefined,
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
   * What one wallet has done with money it borrowed before.
   *
   * Counted from the indexed loans rather than stored anywhere, for the same
   * reason liquidity and memberships are: a figure written down is a figure
   * that can disagree with the chain. It is deliberately a set of counts and
   * not a score — an owner deciding on a request wants to know that someone
   * borrowed three times and repaid three times, and a number out of 100 is a
   * thing that then has to be explained and defended.
   *
   * Three things it is careful about:
   *
   * - **Only funded loans count.** A request is not borrowing, and a rejected
   *   one is a decision the owner already made; neither says anything about
   *   whether this wallet gives money back.
   * - **A repayment with no date is not an on-time repayment.** Loans settled
   *   before the contract recorded `repaidAt` are counted as repaid and left
   *   out of both the on-time and the late tally, because the honest answer to
   *   when they were settled is that nobody knows.
   * - **Nothing to show reads as new, never as bad.** `isNew` is what the UI
   *   needs to say "first time" instead of implying a wallet with no history
   *   is the worst kind — which would make the product unusable for exactly
   *   the people micro-lending is for.
   *
   * Scoped to the chain that is loaded, since the loans are, and capped by the
   * page size the feeds are fetched with: a wallet with more loans than that on
   * one chain would be summarised from part of its history.
   */
  borrowerHistory = (address: string): BorrowerHistory => {
    const now = Date.now()
    const history: BorrowerHistory = {
      total: 0,
      repaid: 0,
      onTime: 0,
      late: 0,
      undated: 0,
      outstanding: 0,
      overdue: 0,
      isNew: true,
    }

    // Over `loans` rather than `loanRecords`, so this agrees with every other
    // surface about what a loan is — including under mock pools, where the
    // records are empty and the fixtures are the only loans there are.
    for (const loan of this.loans) {
      const wasFunded = loan.status === LoanStatus.DISBURSED || loan.status === LoanStatus.REPAID

      if (!wasFunded || !sameAddress(loan.borrower, address)) continue

      history.total += 1

      const dueAt = loan.dueDate?.getTime()

      if (loan.status === LoanStatus.DISBURSED) {
        history.outstanding += 1
        if (dueAt !== undefined && now > dueAt) history.overdue += 1

        continue
      }

      history.repaid += 1

      if (!loan.repaidAt || dueAt === undefined) history.undated += 1
      else if (loan.repaidAt.getTime() > dueAt) history.late += 1
      else history.onTime += 1
    }

    history.isNew = history.total === 0

    return history
  }

  /** The connected wallet's own record, for showing someone their standing. */
  get myBorrowingHistory(): BorrowerHistory {
    return this.borrowerHistory(this.userAddress)
  }

  /**
   * Everyone waiting to be let into one pool.
   *
   * Read from `memberRecords` rather than `memberships`, because the derived
   * getter merges in contributors the register has not reached and defaults
   * them to active — which is right for showing a position and wrong for a
   * queue, where only the register's own word counts.
   */
  pendingMembersFor = (poolId: number): MemberInfo[] => {
    return this.memberRecords.filter((member) => member.poolId === poolId && member.status === 'requested')
  }

  /**
   * The connected wallet's standing in one pool, straight from the register.
   *
   * `membershipFor` answers "what is my position", merging money in and
   * defaulting a contributor to active. This answers "what does the register
   * say", which is what the join button needs: a rejected applicant and a
   * stranger must not see the same screen, and only this can tell them apart.
   */
  registerStandingFor = (poolId: number): MemberInfo | undefined => {
    return this.memberRecords.find((member) => member.poolId === poolId && sameAddress(member.account, this.userAddress))
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
   * What one pool's borrowers still owe it, in wei.
   *
   * Requests are excluded: nothing has moved until an owner approves, so
   * counting them would report liquidity as lent while it is still in the pool.
   *
   * Net of instalments already paid, which is the difference from the figure
   * this reported when repayment was all-or-nothing. Summing principal alone
   * would keep calling a loan five POL of debt after four of them came back,
   * while the pool's own liquidity — read from `totalFunds` — had already gone
   * up by four. The two are shown side by side, so they cannot be allowed to
   * describe different worlds.
   *
   * Principal plus interest, then, rather than principal: what comes back is
   * one sum, and splitting it to keep this "principal only" would need the
   * contract's pro-rata rule restated here to no benefit.
   */
  outstandingDebt = (poolId: number): bigint => {
    return this.loanRecords.filter((loan) => loan.poolId === poolId).reduce((sum, loan) => sum + remainingBalance(loan), 0n)
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
   * A loan is not a log the way a contribution is: it is an entity, and the
   * record carries a single `transactionHash` from whichever call created it.
   * So it is expanded here into the events that can be dated, and a loan
   * produces one row or two:
   *
   * - `requested` → a request awaiting the owner. `PENDING` here means "awaiting
   *   a decision", not "not yet mined" as it does everywhere else — a request is
   *   confirmed on chain the moment it is made. It is the one honest reading of
   *   the badge for a loan, and the alternative is a row that looks settled
   *   while somebody is still waiting on it.
   * - `disbursed` → the funds left the pool, dated when they did.
   *
   * **Money coming back is not one of them any more.** It used to be derived
   * here, one row per settled loan dated `repaidAt` and carrying the whole
   * debt — which was exactly right while `repayLoan` demanded the full sum in
   * one transaction, and is wrong in three ways once it does not: instalments
   * before the last would have no row, the last would claim the whole amount,
   * and every one of them would be filed at the settlement date. Repayments
   * are their own indexed feed now; see `loanRepaymentActivity`.
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
      const principal = BigInt(loan.amount)

      const rows: Transaction[] = [
        {
          id: loan.id,
          poolId: String(loan.poolId),
          // A request moves nothing; the direction states who is asking whom.
          from: isRequest ? loan.borrower : loan.poolAddress,
          to: isRequest ? loan.poolAddress : loan.borrower,
          type: isRequest ? TransactionType.LOAN_REQUEST : TransactionType.LOAN_DISBURSEMENT,
          amount: principal,
          status: isRequest ? TransactionStatus.PENDING : TransactionStatus.CONFIRMED,
          txHash: loan.transactionHash,
          blockNumber: loan.blockNumber,
          createdAt: startedAt,
          confirmedAt: startedAt,
        },
      ]

      return rows
    })
  }

  /**
   * Payments towards loans as activity rows.
   *
   * One row per payment, from the indexed `LoanRepaymentMade` logs — so unlike
   * every other loan row these carry a real `txHash` and `blockNumber`, and
   * unlike the derived row they replaced they are dated when the money actually
   * moved rather than when the debt happened to close.
   *
   * That is the whole reason the feed exists. A repayment derived from the loan
   * record could only ever have one date and one amount, and a loan settled in
   * four transactions has four of each.
   *
   * The id is already `${chainId}-${txHash}-${logIndex}`, so it carries over as
   * the row key unchanged and stays stable across refetches.
   */
  get loanRepaymentActivity(): Transaction[] {
    return this.loanRepayments.map((repayment) => {
      const repaidAt = new Date(repayment.repaidAt)

      return {
        id: repayment.id,
        poolId: String(repayment.poolId),
        from: repayment.borrower,
        to: repayment.poolAddress,
        type: TransactionType.LOAN_REPAYMENT,
        amount: BigInt(repayment.amount),
        status: TransactionStatus.CONFIRMED,
        txHash: repayment.transactionHash,
        blockNumber: repayment.blockNumber,
        createdAt: repaidAt,
        confirmedAt: repaidAt,
      }
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
    return [
      ...this.transactions,
      ...this.contributionActivity,
      ...this.withdrawalActivity,
      ...this.loanActivity,
      ...this.loanRepaymentActivity,
    ]
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
