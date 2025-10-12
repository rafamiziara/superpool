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
  createdAt: Date
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
