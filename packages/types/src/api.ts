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
