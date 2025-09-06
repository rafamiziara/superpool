// Lending pool and transaction types

export interface LendingPool {
  id: string
  name: string
  description: string
  contractAddress: string
  creator: string
  members: string[]
  admins: string[]

  // Pool parameters
  maxMembers: number
  minimumContribution: bigint
  interestRate: number // basis points (e.g., 500 = 5%)
  loanDuration: number // seconds

  // Pool state
  totalLiquidity: bigint
  availableLiquidity: bigint
  totalBorrowed: bigint
  isActive: boolean
  isPaused: boolean

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

export interface PoolMember {
  walletAddress: string
  poolId: string
  joinedAt: Date
  totalContributed: bigint
  currentBalance: bigint
  isAdmin: boolean
  status: MemberStatus
}

export enum MemberStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  LEFT = 'left',
}

export interface Loan {
  id: string
  poolId: string
  borrower: string
  amount: bigint
  interestRate: number
  duration: number

  // Loan state
  status: LoanStatus
  amountRepaid: bigint
  interestAccrued: bigint

  // Timestamps
  requestedAt: Date
  approvedAt?: Date
  disbursedAt?: Date
  dueDate?: Date
  repaidAt?: Date
}

export enum LoanStatus {
  REQUESTED = 'requested',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DISBURSED = 'disbursed',
  REPAID = 'repaid',
  DEFAULTED = 'defaulted',
}

export interface Transaction {
  id: string
  poolId: string
  from: string
  to?: string
  type: TransactionType
  amount: bigint

  // Transaction details
  status: TransactionStatus
  txHash?: string
  blockNumber?: number
  gasUsed?: bigint

  // Timestamps
  createdAt: Date
  confirmedAt?: Date

  // Metadata
  metadata?: Record<string, string | number | boolean>
}

export enum TransactionType {
  CONTRIBUTION = 'contribution',
  WITHDRAWAL = 'withdrawal',
  LOAN_REQUEST = 'loan_request',
  LOAN_DISBURSEMENT = 'loan_disbursement',
  LOAN_REPAYMENT = 'loan_repayment',
  POOL_CREATION = 'pool_creation',
}

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
