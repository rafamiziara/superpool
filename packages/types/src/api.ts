// API request and response types

import type { NotificationKind } from './notifications'

// Generic API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: ApiError
  timestamp: string
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

// Authentication API types
export interface GenerateAuthMessageRequest {
  walletAddress: string
  deviceId: string
}

export interface GenerateAuthMessageResponse {
  message: string
  nonce: string
  timestamp: number
  expiresAt: string
}

export interface VerifySignatureRequest {
  signature: string
  message: string
  walletAddress: string
  deviceId: string
}

export interface VerifySignatureResponse {
  success: boolean
  user: {
    walletAddress: string
    deviceId: string
  }
  token: string
  expiresAt: string
}

// Pool API types
export interface ListPoolsRequest {
  page?: number
  limit?: number
  ownerAddress?: string
  chainId?: number
  activeOnly?: boolean
}

export interface PoolInfo {
  poolId: number
  poolAddress: string
  poolOwner: string
  name: string
  description: string
  maxLoanAmount: string
  interestRate: number
  loanDuration: number
  chainId: number
  createdBy: string
  /**
   * ISO 8601, not a Date. Firebase callables encode objects by their enumerable
   * keys, and a Date has none — returning one serialises it to `{}` on the wire.
   */
  createdAt: string
  transactionHash: string
  isActive: boolean
  /**
   * The ERC-20 the pool is denominated in, lowercased, or the zero address for
   * native.
   *
   * Always present on the wire even though it is absent from documents indexed
   * before pools had a denomination — `listPools` fills those in with the zero
   * address, which is what they are. Nothing could have created a token pool
   * before the field existed.
   */
  loanToken: string
  /**
   * The token's symbol, for a pool denominated in one.
   *
   * **Absent on a native pool, deliberately.** The native symbol is POL on
   * Polygon, ETH on Base and Arbitrum, BNB on BSC — a property of the chain, not
   * of the pool, and the app already knows it per chain. Writing one here would
   * put "POL" on a Base pool.
   */
  tokenSymbol?: string
  /**
   * The token's decimals, for a pool denominated in one. USDC has 6.
   *
   * Indexed rather than read from the chain because a token's decimals are
   * immutable for its lifetime, unlike `requiresMembership`, which the owner can
   * change at any moment and which must therefore never be read from a stored
   * record.
   *
   * **Three states, and conflating the last two is a factor-of-10^12 bug:**
   *
   * - `loanToken` is the zero address — native. Format with the chain's own
   *   native currency, which is 18 decimals on every chain here.
   * - `loanToken` is set and this is a number — a token pool. Format with it.
   * - `loanToken` is set and this is absent — the pool is denominated in
   *   something the backend could not read. **Show it as unsupported. Never
   *   fall back to 18**, which would render 5 USDC as 5,000,000,000,000.
   */
  tokenDecimals?: number
}

export interface ListPoolsResponse {
  pools: PoolInfo[]
  totalCount: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface PreparePoolCreationRequest {
  chainId?: number
}

export interface PreparePoolCreationResponse {
  isWhitelisted: boolean
  wasAlreadyWhitelisted: boolean
  transactionHash?: string
  gasCost?: string
}

export interface IndexPoolRequest {
  txHash: string
  chainId?: number
}

export interface IndexPoolResponse {
  poolId: number
  alreadyIndexed: boolean
  stored: boolean
}

/**
 * One `FundsDeposited` event: a member adding liquidity to a pool.
 *
 * There is no on-chain membership register, so a contribution record is also
 * what makes someone a member of a pool as far as the app is concerned.
 */
export interface ContributionInfo {
  /** `${chainId}-${transactionHash}-${logIndex}` — the document id, and stable. */
  id: string
  poolId: number
  poolAddress: string
  /** Lowercased on write; compare case-insensitively. */
  contributor: string
  /** Wei, as a decimal string — JSON has no bigint. */
  amount: string
  chainId: number
  transactionHash: string
  /** Position of the `FundsDeposited` log within its transaction. */
  logIndex: number
  blockNumber: number
  /**
   * ISO 8601, not a Date. Firebase callables encode objects by their enumerable
   * keys, and a Date has none — returning one serialises it to `{}` on the wire.
   */
  contributedAt: string
}

export interface IndexContributionRequest {
  txHash: string
  chainId?: number
}

export interface IndexContributionResponse {
  /** One entry per `FundsDeposited` log in the transaction. */
  contributions: ContributionInfo[]
  /** How many were written by this call; the rest were already stored. */
  storedCount: number
  alreadyIndexed: boolean
}

/**
 * One `FundsWithdrawn` event: a member taking liquidity back out of a pool.
 *
 * Deliberately a separate record from `ContributionInfo` rather than a signed
 * amount on it. Each is one event, and a position is deposits minus
 * withdrawals — computed on read, so nothing can fall out of step with the
 * chain. The field names mirror the contribution's so the two sum together
 * without special casing.
 */
export interface WithdrawalInfo {
  /** `${chainId}-${transactionHash}-${logIndex}` — the document id, and stable. */
  id: string
  poolId: number
  poolAddress: string
  /** Lowercased on write; compare case-insensitively. */
  member: string
  /** Wei, as a decimal string — JSON has no bigint. */
  amount: string
  chainId: number
  transactionHash: string
  /** Position of the `FundsWithdrawn` log within its transaction. */
  logIndex: number
  blockNumber: number
  /** ISO 8601, not a Date — see the note on `ContributionInfo.contributedAt`. */
  withdrawnAt: string
}

export interface IndexWithdrawalRequest {
  txHash: string
  chainId?: number
}

export interface IndexWithdrawalResponse {
  /** One entry per `FundsWithdrawn` log in the transaction. */
  withdrawals: WithdrawalInfo[]
  /** How many were written by this call; the rest were already stored. */
  storedCount: number
  alreadyIndexed: boolean
}

/**
 * One `InterestClaimed` event: a member taking earned interest out of a pool.
 *
 * The contribution shape, not the loan shape. A claim is an event and never
 * changes afterwards, so lifetime earnings are summed from these on read rather
 * than stored anywhere. The pool-level `InterestDistributed` gets no collection
 * of its own — what it changes is read from the chain.
 */
export interface InterestClaimInfo {
  /** `${chainId}-${transactionHash}-${logIndex}` — the document id, and stable. */
  id: string
  poolId: number
  poolAddress: string
  /** Lowercased on write; compare case-insensitively. */
  account: string
  /** Wei, as a decimal string — JSON has no bigint. */
  amount: string
  chainId: number
  transactionHash: string
  /** Position of the `InterestClaimed` log within its transaction. */
  logIndex: number
  blockNumber: number
  /** ISO 8601, not a Date — see the note on `ContributionInfo.contributedAt`. */
  claimedAt: string
}

export interface IndexInterestClaimRequest {
  txHash: string
  chainId?: number
}

export interface IndexInterestClaimResponse {
  /** One entry per `InterestClaimed` log in the transaction. */
  claims: InterestClaimInfo[]
  /** How many were written by this call; the rest were already stored. */
  storedCount: number
  alreadyIndexed: boolean
}

/**
 * One loan, as the chain currently describes it.
 *
 * Unlike a contribution or a withdrawal — each of which *is* one event — a loan
 * is an entity with a lifecycle: requested, approved or rejected, then repaid.
 * So the record is not a log; it is the answer `getLoan` gives now, re-read
 * whenever any of those events is seen.
 *
 * Still thinner than the app's `Loan` interface in one respect: nothing on
 * chain enforces the term, so no loan ever reaches `DEFAULTED`. Partial
 * repayment and accrued interest are no longer among the gaps — see
 * `amountRepaid` and `interestOutstanding`.
 */
export interface LoanInfo {
  /** `${chainId}-${poolId}-${loanId}` — the document id, and stable. */
  id: string
  /** Per-pool, not global: each pool contract counts its own loans from 1. */
  loanId: number
  poolId: number
  poolAddress: string
  /** Lowercased on write; compare case-insensitively. */
  borrower: string
  /** Principal in wei, as a decimal string — JSON has no bigint. */
  amount: string
  /** Basis points, fixed at creation from the pool's rate. */
  interestRate: number
  /** Seconds. `startedAt + duration` is the due date; nothing on chain enforces it. */
  duration: number
  /** ISO 8601 — the block timestamp the contract recorded as `startTime`. */
  startedAt: string
  /**
   * Whether a disbursed loan has been settled in full. Meaningless unless
   * `status` is `disbursed`.
   *
   * Still a bool with `amountRepaid` beside it, because the two answer
   * different questions: this one closes the debt, releases the borrower's
   * slot and stamps `repaidAt`, while `amountRepaid` only says how far along
   * they are. A part-paid loan reads `false` here, which is what every caller
   * asking "does this wallet owe money" wants.
   */
  isRepaid: boolean
  /**
   * How much of principal-plus-interest has been paid back, in wei as a
   * decimal string.
   *
   * A running total read from the chain, not a sum of anything stored. `'0'`
   * on a loan nobody has paid towards, and on a record indexed before the
   * contract could count instalments.
   *
   * It cannot tell you *when* any of it arrived — `repaidAt` dates only the
   * payment that closed the debt. Each instalment is its own record; see
   * `LoanRepaymentInfo`.
   */
  amountRepaid: string
  /**
   * Principal not yet returned, in wei as a decimal string.
   *
   * Moves only when a payment is made, so unlike the interest beside it this
   * figure does not go stale between blocks.
   */
  principalOutstanding: string
  /**
   * Interest accrued and not yet paid, in wei as a decimal string, **as of
   * `accruedAt`**.
   *
   * A snapshot rather than a live figure. Interest accrues per second on the
   * principal still out, so what is owed *now* is this projected forward from
   * `accruedAt` at `interestRate` over `duration` — which is why those two are
   * on this record, and why the snapshot is worth carrying at all: a list of
   * loans can price itself without an RPC call each.
   *
   * **Project for display, never to decide what to send.** The projection runs
   * against the device clock and the contract runs against block time, so the
   * figure to pay is always read from the chain.
   */
  interestOutstanding: string
  /**
   * ISO 8601 — when `interestOutstanding` was taken. Absent on a loan that does
   * not accrue.
   *
   * **Absent means the figures are static**, not that they are unknown: a loan
   * made before interest accrued keeps the flat price it was made at until its
   * first payment converts it. Projecting one forward would show interest the
   * contract will not charge.
   */
  accruedAt?: string
  /**
   * ISO 8601 — when the loan was **settled**, from the chain's own stamp.
   *
   * Absent while the loan is outstanding, and absent on a loan repaid before
   * the contract recorded this at all: `isRepaid` stays the authority on
   * *whether*, and this only answers *when*. Together with `startedAt` and
   * `duration` it is what makes "repaid on time" a question anything can ask.
   */
  repaidAt?: string
  /**
   * ISO 8601 — when the pool's owner declared this loan defaulted.
   *
   * Absent on every loan nobody declared, which is almost all of them. Present
   * *and* `isRepaid` means the debt was paid after the declaration: the
   * declaration is never undone, so the pair reads as a recovery.
   */
  defaultedAt?: string
  /**
   * Where the loan is before repayment.
   *
   * Only pools whose owner turned on review ever produce `requested` or
   * `rejected`; a pool that lends on demand goes straight to `disbursed`. Loans
   * written before the field existed also read `disbursed`, which is what they
   * were — see the enum note in `LendingPool`.
   *
   * **`defaulted` is still an open debt.** The owner declaring one records a
   * judgement; it does not close the loan, stop interest or excuse payment. So
   * anything asking "does this wallet owe money" has to admit it alongside
   * `disbursed` — reading the two as mutually exclusive is how a debt silently
   * disappears from a screen.
   */
  status: 'disbursed' | 'requested' | 'rejected' | 'defaulted'
  chainId: number
  /** The transaction that created the loan. */
  transactionHash: string
  blockNumber: number
}

export interface IndexLoanRequest {
  txHash: string
  chainId?: number
}

export interface IndexLoanResponse {
  /** One entry per loan event in the transaction, in its post-transaction state. */
  loans: LoanInfo[]
  /** How many records this call wrote or changed; the rest were already current. */
  storedCount: number
  alreadyIndexed: boolean
  /**
   * The payments this transaction made towards a loan, if it made any.
   *
   * Indexed by the same callable rather than a second one, because a repayment
   * produces both records at once and the app should not have to know that: it
   * confirms one transaction and asks for it to be indexed. Empty for every
   * other loan event.
   */
  repayments: LoanRepaymentInfo[]
}

/**
 * One payment towards a loan.
 *
 * A `LoanRepaymentMade` log, and therefore the contribution shape rather than
 * the `LoanInfo` shape: it is one event, immutable, dated by its own block.
 * That distinction is what makes instalments legible at all — the loan record
 * carries a running `amountRepaid` and a single `repaidAt` that only dates the
 * payment which closed the debt, so the earlier ones would have no date and no
 * transaction of their own to point at.
 *
 * The settling payment produces one of these *and* moves the loan to
 * `isRepaid`. They are different facts: money moved, and the debt ended.
 */
export interface LoanRepaymentInfo {
  /** `${chainId}-${transactionHash}-${logIndex}` — the document id, and stable. */
  id: string
  /** Per-pool loan id. Join to `LoanInfo.loanId` within the same pool and chain. */
  loanId: number
  poolId: number
  poolAddress: string
  /** Lowercased on write; compare case-insensitively. */
  borrower: string
  /**
   * What this payment credited, in wei as a decimal string.
   *
   * This instalment alone, never the running total, and never the amount sent:
   * a payment larger than the outstanding balance is refunded down to it, and
   * this is what the pool kept.
   */
  amount: string
  chainId: number
  transactionHash: string
  /** Position of the `LoanRepaymentMade` log within its transaction. */
  logIndex: number
  blockNumber: number
  /** ISO 8601, not a Date — see the note on `ContributionInfo.contributedAt`. */
  repaidAt: string
}

export interface ListLoanRepaymentsRequest {
  chainId?: number
  /** Restrict to one pool. Omit for every pool on the chain. */
  poolId?: number
  /** Restrict to one loan. Only meaningful together with `poolId`, which scopes the id. */
  loanId?: number
  /** Restrict to one wallet. Matched case-insensitively. */
  borrower?: string
  limit?: number
}

export interface ListLoanRepaymentsResponse {
  repayments: LoanRepaymentInfo[]
  totalCount: number
  limit: number
}

export interface ListLoansRequest {
  chainId?: number
  /** Restrict to one pool. Omit for every pool on the chain. */
  poolId?: number
  /** Restrict to one wallet. Matched case-insensitively. */
  borrower?: string
  /**
   * Only loans that are still owed — disbursed **or defaulted**, and not yet
   * repaid.
   *
   * A declared default does not settle anything, so excluding it here would
   * drop exactly the debts that most need chasing, and would take a borrower's
   * own loan off their repay screen the moment it was declared.
   */
  activeOnly?: boolean
  /** Only requests still waiting on the pool owner. */
  pendingOnly?: boolean
  /**
   * Only loans the owner has declared defaulted.
   *
   * Narrower than "overdue", which is derivable from `startedAt + duration` by
   * anyone with a clock and needs no query of its own.
   */
  defaultedOnly?: boolean
  limit?: number
}

export interface ListLoansResponse {
  loans: LoanInfo[]
  totalCount: number
  limit: number
}

/**
 * Where one address stands with one pool.
 *
 * Unlike a contribution this is not an event: the same record is rewritten by
 * every decision that touches it, so its `status` is read back from the chain
 * rather than inferred from which log arrived. Same shape of record as
 * `LoanInfo`, and for the same reason.
 *
 * Note this answers only *membership*. Balances stay derived from contributions
 * and withdrawals — the register says who belongs, never how much they hold.
 */
export interface MemberInfo {
  /** `${chainId}-${poolId}-${address}` — the document id, and stable. */
  id: string
  poolId: number
  poolAddress: string
  /** Lowercased on write; compare case-insensitively. */
  account: string
  /**
   * Where the address stands.
   *
   * `none` never reaches a stored record — an address nobody has heard of has
   * no document — but it is the contract's zero value and so the wire form has
   * to be able to carry it.
   */
  status: 'none' | 'requested' | 'active' | 'rejected' | 'removed' | 'left'
  /**
   * ISO 8601 — when the address first appeared in this pool's register, whether
   * by asking to join or by funding an open pool. Not reset by later decisions,
   * so a removed member keeps the date they joined.
   */
  joinedAt: string
  chainId: number
  /** The transaction that last changed this membership. */
  transactionHash: string
  blockNumber: number
}

export interface IndexMembershipRequest {
  txHash: string
  chainId?: number
}

export interface IndexMembershipResponse {
  /** One entry per membership event in the transaction, in its post-transaction state. */
  members: MemberInfo[]
  /** How many records this call wrote or changed; the rest were already current. */
  storedCount: number
  alreadyIndexed: boolean
}

export interface ListMembersRequest {
  chainId?: number
  /** Restrict to one pool. Omit for every pool on the chain. */
  poolId?: number
  /** Restrict to one wallet. Matched case-insensitively. */
  account?: string
  /** Only addresses currently in the pool. */
  activeOnly?: boolean
  /** Only applicants still waiting on the pool owner. */
  pendingOnly?: boolean
  limit?: number
}

export interface ListMembersResponse {
  members: MemberInfo[]
  totalCount: number
  limit: number
}

export interface SyncPoolEventsRequest {
  chainId?: number
  /**
   * Re-scan from this block instead of resuming from the stored sync state.
   * `0` sweeps the whole chain. Safe to repeat: every indexer keys on the log,
   * so a re-scan re-writes nothing.
   */
  fromBlock?: number
}

export interface SyncPoolEventsResponse {
  chainId: number
  fromBlock: number
  /** The last block actually swept — below the head when the run hit its budget. */
  toBlock: number
  currentBlock: number
  /** False when the sweep stopped on its range budget before reaching the head. */
  caughtUp: boolean
  /** How many documents this run wrote, per feed; already-indexed logs are not counted. */
  pools: number
  contributions: number
  withdrawals: number
  /** Loans created or settled — the record is re-read from the chain either way. */
  loans: number
  /** Memberships written — asked, decided, or enrolled by a deposit. */
  memberships: number
  /** Interest claims written. */
  interestClaims: number
  /** Pools whose stored `isActive` disagreed with the chain and was corrected. */
  statusUpdates: number
}

export interface ListWithdrawalsRequest {
  chainId?: number
  /** Restrict to one pool. Omit for every pool on the chain. */
  poolId?: number
  /** Restrict to one wallet. Matched case-insensitively. */
  member?: string
  limit?: number
}

export interface ListWithdrawalsResponse {
  withdrawals: WithdrawalInfo[]
  totalCount: number
  limit: number
}

export interface ListInterestClaimsRequest {
  chainId?: number
  /** Restrict to one pool. Omit for every pool on the chain. */
  poolId?: number
  /** Restrict to one wallet. Matched case-insensitively. */
  account?: string
  limit?: number
}

export interface ListInterestClaimsResponse {
  claims: InterestClaimInfo[]
  totalCount: number
  limit: number
}

export interface ListContributionsRequest {
  chainId?: number
  /** Restrict to one pool. Omit for every pool on the chain. */
  poolId?: number
  /** Restrict to one wallet. Matched case-insensitively. */
  contributor?: string
  limit?: number
}

export interface ListContributionsResponse {
  contributions: ContributionInfo[]
  totalCount: number
  limit: number
}

/**
 * A sentence somebody wrote about a record: why a loan was wanted, why a
 * request was turned down, why a member was removed.
 *
 * **Deliberately off chain.** Free text costs gas proportional to its length,
 * forever, on a product whose amounts are small by definition; and it is
 * metadata, where the chain's job here is to record what only the chain can
 * witness. Permanence is a misfeature besides — a rejection reason is a
 * statement about a person, and one that turns out to be abusive has to be
 * removable.
 *
 * **A note is never load-bearing.** Nothing in the protocol, the indexer or an
 * eligibility check may ever read one. If a note ever gates a transaction,
 * this design is wrong.
 */
export interface Note {
  /** `${recordId}:${kind}` — the document id. See `kind` for why both. */
  id: string
  /**
   * The record this is about: a loan's `${chainId}-${poolId}-${loanId}` or a
   * membership's `${chainId}-${poolId}-${account}`.
   *
   * The record's own id, never the transaction that produced it. `indexLoan`
   * moves a loan's `transactionHash` to the earliest event that dates it, and
   * `approveLoan` rewrites `startTime` — so a note keyed to the request
   * transaction attaches correctly right up until the loan is approved, then
   * silently detaches.
   */
  recordId: string
  kind: NoteKind
  /** At most `NOTE_MAX_LENGTH` characters. A reason, not a document. */
  text: string
  /** Lowercased. Who wrote it: the borrower on a purpose, else the owner. */
  author: string
  /** Lowercased. The wallet the note is *about*, and who may read it. */
  subject: string
  chainId: number
  poolId: number
  /** ISO 8601. */
  createdAt: string
}

/**
 * What a note is attached to.
 *
 * The outcome, not just "a decision", and that is what makes stale reasons
 * invisible: an owner types a reason *before* sending the transaction, so a
 * rejection they thought better of leaves a `loan_rejected` note behind on a
 * loan that was approved. The reader asks for the note belonging to the
 * transition that actually happened, so the orphan is never found.
 *
 * Every value but `loan_purpose` is a `NotificationKind`, so the two features
 * cannot drift apart in what they call the same event.
 */
export type NoteKind =
  | 'loan_purpose'
  | Extract<
      NotificationKind,
      'loan_approved' | 'loan_rejected' | 'loan_defaulted' | 'membership_approved' | 'membership_rejected' | 'membership_removed'
    >

/** Long enough to say why, short enough to fit in a push body. */
export const NOTE_MAX_LENGTH = 280

export interface SaveNoteRequest {
  kind: NoteKind
  /**
   * The record the note belongs to. Required for every kind but
   * `loan_purpose`, whose record does not exist yet.
   */
  recordId?: string
  /**
   * Stage a `loan_purpose` under the transaction that requests the loan.
   *
   * The contract assigns the loan id when the transaction is mined, so there
   * is no record to key on at the moment the borrower types the reason. The
   * loan indexer resolves this to `recordId` on the transition that creates
   * the loan — which means it works from the scheduled sweep too, so a phone
   * that died between sending and indexing still gets its purpose attached.
   */
  txHash?: string
  chainId?: number
  text: string
}

export interface SaveNoteResponse {
  note: Note
}

export interface ListNotesRequest {
  chainId?: number
  /**
   * Restrict to one pool. Omit to get only the caller's own notes, wherever
   * they are.
   */
  poolId?: number
  /** Restrict to the notes on one record. */
  recordId?: string
  limit?: number
}

export interface ListNotesResponse {
  notes: Note[]
  totalCount: number
  limit: number
}

// Dev/Testing API types (emulator only)
export interface SignMessageRequest {
  nonce: string
  timestamp: number
}

export interface SignMessageResponse {
  signature: string
  walletAddress: string
  message: string
}

export interface JoinPoolRequest {
  poolId: string
  userAddress: string
}

export interface JoinPoolResponse {
  success: boolean
  transactionHash?: string
}

// Loan API types
export interface RequestLoanRequest {
  poolId: string
  amount: string // bigint as string
  purpose: string
  duration?: number
}

export interface RequestLoanResponse {
  loanId: string
  status: string
  transactionHash?: string
}

// `GetLoansRequest/Response` and `GetTransactionsRequest/Response` were deleted
// on 2026-08-17, the last of the REST-shaped types that described a backend
// nobody wrote. The real feeds are `ListLoansRequest/Response` and the per-event
// list callables above; a transaction feed is assembled in the app by
// `PoolStore.recentTransactions`, not fetched.
