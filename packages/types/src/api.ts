// API request and response types

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
export interface CreatePoolRequest {
  name: string
  description: string
  maxMembers: number
  minimumContribution: string // bigint as string
  interestRate: number
  loanDuration: number
}

export interface CreatePoolResponse {
  poolId: string
  contractAddress: string
  transactionHash: string
}

export interface GetPoolsRequest {
  userAddress?: string
  status?: 'active' | 'inactive' | 'all'
  limit?: number
  offset?: number
}

export interface GetPoolsResponse {
  pools: LendingPool[]
  total: number
  hasMore: boolean
}

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
 * Still thinner than the app's `Loan` interface. The contract has an approval
 * step, but `repayLoan` demands the full amount in one transaction and interest
 * is fixed at disbursement, so there is no partial repayment and no accrual.
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
   * Whether a disbursed loan has been settled. Repayment is all-or-nothing, so
   * there is no partial state. Meaningless unless `status` is `disbursed`.
   */
  isRepaid: boolean
  /**
   * ISO 8601 — when the repayment landed, from the chain's own stamp.
   *
   * Absent while the loan is outstanding, and absent on a loan repaid before
   * the contract recorded this at all: `isRepaid` stays the authority on
   * *whether*, and this only answers *when*. Together with `startedAt` and
   * `duration` it is what makes "repaid on time" a question anything can ask.
   */
  repaidAt?: string
  /**
   * Where the loan is before repayment.
   *
   * Only pools whose owner turned on review ever produce `requested` or
   * `rejected`; a pool that lends on demand goes straight to `disbursed`. Loans
   * written before the field existed also read `disbursed`, which is what they
   * were — see the enum note in `LendingPool`.
   */
  status: 'disbursed' | 'requested' | 'rejected'
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
}

export interface ListLoansRequest {
  chainId?: number
  /** Restrict to one pool. Omit for every pool on the chain. */
  poolId?: number
  /** Restrict to one wallet. Matched case-insensitively. */
  borrower?: string
  /** Only loans that are disbursed and not yet repaid. */
  activeOnly?: boolean
  /** Only requests still waiting on the pool owner. */
  pendingOnly?: boolean
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

export interface GetLoansRequest {
  poolId?: string
  borrower?: string
  status?: string
  limit?: number
  offset?: number
}

export interface GetLoansResponse {
  loans: Loan[]
  total: number
  hasMore: boolean
}

// Transaction API types
export interface GetTransactionsRequest {
  poolId?: string
  userAddress?: string
  type?: string
  status?: string
  limit?: number
  offset?: number
}

export interface GetTransactionsResponse {
  transactions: Transaction[]
  total: number
  hasMore: boolean
}

// Import shared types
import type { LendingPool, Loan, Transaction } from './lending'
