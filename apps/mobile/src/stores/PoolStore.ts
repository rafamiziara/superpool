import type { ListPoolsRequest, Loan, PoolInfo, PoolMember, Transaction } from '@superpool/types'
import { LoanStatus, MemberStatus, TransactionStatus } from '@superpool/types'
import { makeAutoObservable, runInAction } from 'mobx'
import { MOCK_LOANS, MOCK_MEMBERSHIPS, MOCK_POOLS, MOCK_TRANSACTIONS, MOCK_USER_ADDRESS } from '../mocks/lending'

/**
 * Lending pool state. Method signatures mirror the backend contract
 * (`listPools` Cloud Function, Firestore `pools` collection) so screens
 * won't change when the mock layer is swapped for real calls.
 */
export class PoolStore {
  pools: PoolInfo[] = []
  memberships: PoolMember[] = []
  loans: Loan[] = []
  transactions: Transaction[] = []
  isLoading = false

  constructor() {
    makeAutoObservable(this)
  }

  // TODO: stand-in for authStore.walletAddress until mocks are replaced
  get userAddress(): string {
    return MOCK_USER_ADDRESS
  }

  loadPools = async (_params: ListPoolsRequest = {}): Promise<void> => {
    this.isLoading = true
    // TODO: swap for httpsCallable('listPools')(params) + Firestore queries when wiring the backend
    await Promise.resolve()
    runInAction(() => {
      this.pools = MOCK_POOLS
      this.memberships = MOCK_MEMBERSHIPS
      this.loans = MOCK_LOANS
      this.transactions = MOCK_TRANSACTIONS
      this.isLoading = false
    })
  }

  poolById = (poolId: number): PoolInfo | undefined => {
    return this.pools.find((pool) => pool.poolId === poolId)
  }

  membershipFor = (poolId: number): PoolMember | undefined => {
    return this.memberships.find((member) => member.poolId === String(poolId) && member.walletAddress === this.userAddress)
  }

  transactionsFor = (poolId: number): Transaction[] => {
    return this.recentTransactions.filter((tx) => tx.poolId === String(poolId))
  }

  /** Pools the user belongs to (any membership status), newest first. */
  get myPools(): PoolInfo[] {
    const memberPoolIds = new Set(this.memberships.map((member) => member.poolId))
    return this.pools.filter((pool) => memberPoolIds.has(String(pool.poolId)))
  }

  /** Sum of the user's active balances across pools (wei). */
  get totalBalance(): bigint {
    return this.activeMemberships.reduce((sum, member) => sum + member.currentBalance, 0n)
  }

  /** Lifetime earnings: current balances minus what was contributed (wei). */
  get totalEarned(): bigint {
    return this.activeMemberships.reduce((sum, member) => sum + (member.currentBalance - member.totalContributed), 0n)
  }

  get activeMemberships(): PoolMember[] {
    return this.memberships.filter((member) => member.status === MemberStatus.ACTIVE && member.walletAddress === this.userAddress)
  }

  get activeLoan(): Loan | undefined {
    return this.loans.find((loan) => loan.status === LoanStatus.DISBURSED && loan.borrower === this.userAddress)
  }

  get pendingLoan(): Loan | undefined {
    return this.loans.find((loan) => loan.status === LoanStatus.REQUESTED && loan.borrower === this.userAddress)
  }

  get recentTransactions(): Transaction[] {
    return [...this.transactions]
      .filter((tx) => tx.status !== TransactionStatus.CANCELLED)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }
}

export const poolStore = new PoolStore()
