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
 * One loan, as the chain currently describes it.
 *
 * Unlike a contribution or a withdrawal — each of which *is* one event — a loan
 * is an entity with a lifecycle, touched by `LoanCreated` and later
 * `LoanRepaid`. So the record is not a log; it is the answer `getLoan` gives
 * now, re-read whenever either event is seen.
 *
 * Deliberately thinner than the app's `Loan` interface, which describes an
 * approval workflow the contract does not implement. `createLoan` disburses
 * immediately and `repayLoan` demands the full amount in one transaction, so
 * there is no requested state, no partial repayment and no accrual — only
 * borrowed or repaid.
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
   * The contract's only lifecycle bit. Repayment is all-or-nothing, so this is
   * the whole of a loan's state: false means outstanding, true means settled.
   */
  isRepaid: boolean
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
  /** Only loans that are still outstanding. */
  activeOnly?: boolean
  limit?: number
}

export interface ListLoansResponse {
  loans: LoanInfo[]
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
