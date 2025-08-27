import { LendingPool, Loan, LoanStatus, Transaction, TransactionStatus } from '@superpool/types'
import { makeAutoObservable } from 'mobx'

export interface PoolFilters {
  isActive?: boolean
  isUserMember?: boolean
  minLiquidity?: bigint
  searchTerm?: string
}

export interface LoadingStates {
  pools: boolean
  loans: boolean
  transactions: boolean
  memberActions: boolean
}

/**
 * MobX store for managing lending pools, loans, and transactions
 */
export class PoolManagementStore {
  // Observable state
  pools: Map<string, LendingPool> = new Map()
  loans: Map<string, Loan> = new Map()
  transactions: Map<string, Transaction> = new Map()

  // Loading states
  loading: LoadingStates = {
    pools: false,
    loans: false,
    transactions: false,
    memberActions: false,
  }

  // Error states
  error: string | null = null

  // Current user context
  userAddress: string | null = null

  constructor() {
    makeAutoObservable(this)
  }

  // Computed getters
  get allPools(): LendingPool[] {
    return Array.from(this.pools.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  get activePools(): LendingPool[] {
    return this.allPools.filter((pool) => pool.isActive && !pool.isPaused)
  }

  get userPools(): LendingPool[] {
    if (!this.userAddress) return []
    return this.allPools.filter((pool) => pool.members.includes(this.userAddress!) || pool.admins.includes(this.userAddress!))
  }

  get userLoans(): Loan[] {
    if (!this.userAddress) return []
    return (
      Array.from(this.loans.values())
        .filter((loan) => loan.borrower.toLowerCase() === this.userAddress!.toLowerCase())
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
    )
  }

  get activeLoans(): Loan[] {
    return Array.from(this.loans.values()).filter((loan) => loan.status === LoanStatus.DISBURSED)
  }

  get pendingTransactions(): Transaction[] {
    return Array.from(this.transactions.values())
      .filter((tx) => tx.status === TransactionStatus.PENDING)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // Actions
  setUserAddress = (address: string | null): void => {
    this.userAddress = address
  }

  setLoading = (key: keyof LoadingStates, loading: boolean): void => {
    this.loading[key] = loading
  }

  setError = (error: string | null): void => {
    this.error = error
  }

  // Pool management actions
  addPool = (pool: LendingPool): void => {
    this.pools.set(pool.id, pool)
  }

  updatePool = (poolId: string, updates: Partial<LendingPool>): void => {
    const existing = this.pools.get(poolId)
    if (existing) {
      this.pools.set(poolId, {
        ...existing,
        ...updates,
        updatedAt: new Date(),
      })
    }
  }

  removePool = (poolId: string): void => {
    this.pools.delete(poolId)
  }

  // Loan management actions
  addLoan = (loan: Loan): void => {
    this.loans.set(loan.id, loan)
  }

  updateLoan = (loanId: string, updates: Partial<Loan>): void => {
    const existing = this.loans.get(loanId)
    if (existing) {
      this.loans.set(loanId, {
        ...existing,
        ...updates,
      })
    }
  }

  approveLoan = (loanId: string): void => {
    this.updateLoan(loanId, {
      status: LoanStatus.APPROVED,
      approvedAt: new Date(),
    })
  }

  disburseLoan = (loanId: string): void => {
    this.updateLoan(loanId, {
      status: LoanStatus.DISBURSED,
      disbursedAt: new Date(),
    })
  }

  repayLoan = (loanId: string, amount: bigint): void => {
    const loan = this.loans.get(loanId)
    if (loan) {
      const totalRepaid = loan.amountRepaid + amount
      const isFullyRepaid = totalRepaid >= loan.amount + loan.interestAccrued

      this.updateLoan(loanId, {
        amountRepaid: totalRepaid,
        status: isFullyRepaid ? LoanStatus.REPAID : loan.status,
        repaidAt: isFullyRepaid ? new Date() : loan.repaidAt,
      })
    }
  }

  // Transaction management actions
  addTransaction = (transaction: Transaction): void => {
    this.transactions.set(transaction.id, transaction)
  }

  updateTransaction = (txId: string, updates: Partial<Transaction>): void => {
    const existing = this.transactions.get(txId)
    if (existing) {
      this.transactions.set(txId, {
        ...existing,
        ...updates,
      })
    }
  }

  confirmTransaction = (txId: string, txHash: string, blockNumber?: number): void => {
    this.updateTransaction(txId, {
      status: TransactionStatus.CONFIRMED,
      txHash,
      blockNumber,
      confirmedAt: new Date(),
    })
  }

  failTransaction = (txId: string): void => {
    this.updateTransaction(txId, {
      status: TransactionStatus.FAILED,
    })
  }

  // Pool filtering
  getFilteredPools = (filters: PoolFilters): LendingPool[] => {
    let filtered = this.allPools

    if (filters.isActive !== undefined) {
      filtered = filtered.filter((pool) => pool.isActive === filters.isActive)
    }

    if (filters.isUserMember && this.userAddress) {
      filtered = filtered.filter((pool) => pool.members.includes(this.userAddress!) || pool.admins.includes(this.userAddress!))
    }

    if (filters.minLiquidity) {
      filtered = filtered.filter((pool) => pool.availableLiquidity >= filters.minLiquidity!)
    }

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase()
      filtered = filtered.filter((pool) => pool.name.toLowerCase().includes(term) || pool.description.toLowerCase().includes(term))
    }

    return filtered
  }

  // Pool statistics
  getPoolStats = (poolId: string) => {
    const pool = this.pools.get(poolId)
    if (!pool) return null

    const poolLoans = Array.from(this.loans.values()).filter((loan) => loan.poolId === poolId)
    const poolTransactions = Array.from(this.transactions.values()).filter((tx) => tx.poolId === poolId)

    return {
      totalMembers: pool.members.length,
      totalLoans: poolLoans.length,
      activeLoans: poolLoans.filter((loan) => loan.status === LoanStatus.DISBURSED).length,
      totalBorrowed: pool.totalBorrowed,
      utilizationRate: pool.totalLiquidity > 0n ? Number((pool.totalBorrowed * 100n) / pool.totalLiquidity) : 0,
      recentTransactions: poolTransactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10),
    }
  }

  // User-specific methods
  getUserRole = (poolId: string): 'admin' | 'member' | 'none' => {
    if (!this.userAddress) return 'none'

    const pool = this.pools.get(poolId)
    if (!pool) return 'none'

    if (pool.admins.includes(this.userAddress)) return 'admin'
    if (pool.members.includes(this.userAddress)) return 'member'
    return 'none'
  }

  canUserBorrow = (poolId: string): boolean => {
    const role = this.getUserRole(poolId)
    return role === 'member' || role === 'admin'
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getUserPoolContribution = (poolId: string): bigint => {
    // This would typically fetch from blockchain or backend
    // For now, return 0n as placeholder
    return 0n
  }

  // Async actions (these would typically call backend services)
  loadPools = async (): Promise<void> => {
    this.setLoading('pools', true)
    this.setError(null)

    try {
      // Backend call would go here
      // const pools = await poolService.fetchPools()
      // pools.forEach(pool => this.addPool(pool))

      console.log('Loading pools...')
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Failed to load pools')
    } finally {
      this.setLoading('pools', false)
    }
  }

  createPool = async (poolData: Omit<LendingPool, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> => {
    this.setLoading('memberActions', true)
    this.setError(null)

    try {
      // Backend call would go here
      // const newPool = await poolService.createPool(poolData)
      // this.addPool(newPool)

      console.log('Creating pool...', poolData)
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Failed to create pool')
      throw error
    } finally {
      this.setLoading('memberActions', false)
    }
  }

  joinPool = async (poolId: string): Promise<void> => {
    if (!this.userAddress) throw new Error('User not connected')

    this.setLoading('memberActions', true)
    this.setError(null)

    try {
      // Backend call would go here
      // await poolService.joinPool(poolId, this.userAddress)

      // Update local state
      const pool = this.pools.get(poolId)
      if (pool && !pool.members.includes(this.userAddress)) {
        this.updatePool(poolId, {
          members: [...pool.members, this.userAddress],
        })
      }
    } catch (error) {
      this.setError(error instanceof Error ? error.message : 'Failed to join pool')
      throw error
    } finally {
      this.setLoading('memberActions', false)
    }
  }

  // Reset store
  reset = (): void => {
    this.pools.clear()
    this.loans.clear()
    this.transactions.clear()
    this.loading = {
      pools: false,
      loans: false,
      transactions: false,
      memberActions: false,
    }
    this.error = null
    this.userAddress = null
  }
}
