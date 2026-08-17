// Lending pool and transaction types
//
// A pool as the app sees it is `PoolInfo` in `api.ts` — the shape `listPools`
// returns. There was a second, richer `LendingPool` interface here that no
// code ever built or read: it predated the indexed record and described a
// backend that was never written, with `createPool` and `getPools` callables
// that do not exist. It was deleted on 2026-08-17 along with its request and
// response types, because two of its fields — `maxMembers` and
// `minimumContribution` — were promises of enforcement nothing anywhere made
// good. See `.dev/contracts/CONTRACTS_BACKLOG.md` §2.

export interface PoolMember {
  walletAddress: string
  poolId: string
  joinedAt: Date
  totalContributed: bigint
  currentBalance: bigint
  isAdmin: boolean
  status: MemberStatus
}

/**
 * Where an address stands with a pool.
 *
 * Mirrors `LendingPool.Membership`, whose `None` has no counterpart here:
 * an address the register has never heard of has no record to carry a status.
 * `SUSPENDED` is the wire name for the contract's `Removed`.
 */
export enum MemberStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REJECTED = 'rejected',
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

/**
 * What one wallet has done with money it borrowed before.
 *
 * Counts rather than a score, and deliberately: the formula for a score would
 * be wrong the first time and want retuning, and there is nothing yet to check
 * one against. These are the facts a pool owner deciding on a request actually
 * asks for, and every one of them is derived from the loans on read — nothing
 * about a borrower is stored, so nothing about a borrower can go stale.
 *
 * Only funded loans are counted. A request is not borrowing and a rejected one
 * is a decision that was already made, so neither says anything about whether
 * this wallet gives money back.
 */
export interface BorrowerHistory {
  /** Loans that were actually disbursed. */
  total: number
  /** Of those, the ones settled — whenever that happened. */
  repaid: number
  /** Settled on or before `startedAt + duration`. */
  onTime: number
  /** Settled after it. Nothing on chain prevents this; the term is unenforced. */
  late: number
  /**
   * Settled, but with no date recorded — loans repaid before the contract
   * stamped one. Counted in `repaid` and in neither `onTime` nor `late`,
   * because the honest answer to when they were settled is that nobody knows.
   */
  undated: number
  /** Still owed. */
  outstanding: number
  /** Still owed and past the due date, which is a subset of `outstanding`. */
  overdue: number
  /**
   * True when this wallet has never borrowed.
   *
   * The distinction the whole shape exists for: zero repayments out of zero
   * loans is a new borrower, not the worst kind of one, and a lending product
   * that confuses the two is unusable for the people it is meant for.
   */
  isNew: boolean
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
