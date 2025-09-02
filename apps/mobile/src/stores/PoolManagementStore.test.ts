import { LoadingStates, PoolFilters, PoolManagementStore } from './PoolManagementStore'
import { LendingPool, Loan, LoanStatus, Transaction, TransactionStatus, TransactionType } from '@superpool/types'

describe('PoolManagementStore', () => {
  let store: PoolManagementStore

  // Mock data
  const mockPool: LendingPool = {
    id: 'pool-1',
    name: 'Test Pool',
    description: 'A test lending pool',
    contractAddress: '0x123',
    creator: '0xowner',
    admins: ['0xadmin1', '0xadmin2'],
    members: ['0xmember1', '0xmember2'],
    maxMembers: 10,
    minimumContribution: BigInt(50),
    interestRate: 500,
    loanDuration: 2592000,
    totalLiquidity: BigInt(1000),
    availableLiquidity: BigInt(800),
    totalBorrowed: BigInt(200),
    isActive: true,
    isPaused: false,
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-02'),
  }

  const mockLoan: Loan = {
    id: 'loan-1',
    poolId: 'pool-1',
    borrower: '0xborrower',
    amount: BigInt(100),
    interestRate: 500,
    duration: 30,
    status: LoanStatus.REQUESTED,
    requestedAt: new Date('2023-01-01'),
    approvedAt: undefined,
    disbursedAt: undefined,
    repaidAt: undefined,
    amountRepaid: BigInt(0),
    interestAccrued: BigInt(5),
  }

  const mockTransaction: Transaction = {
    id: 'tx-1',
    poolId: 'pool-1',
    type: TransactionType.LOAN_REQUEST,
    from: '0xborrower',
    to: '0xpool',
    amount: BigInt(100),
    status: TransactionStatus.PENDING,
    txHash: undefined,
    blockNumber: undefined,
    createdAt: new Date('2023-01-01'),
    confirmedAt: undefined,
  }

  beforeEach(() => {
    store = new PoolManagementStore()
    jest.clearAllMocks()
  })

  afterEach(() => {
    store.reset()
  })

  describe('Initial State', () => {
    it('should initialize with correct default values', () => {
      expect(store.pools.size).toBe(0)
      expect(store.loans.size).toBe(0)
      expect(store.transactions.size).toBe(0)
      expect(store.loading).toEqual({
        pools: false,
        loans: false,
        transactions: false,
        memberActions: false,
      })
      expect(store.error).toBeNull()
      expect(store.userAddress).toBeNull()
    })
  })

  describe('User Address Management', () => {
    it('should set user address', () => {
      const address = '0x1234567890123456789012345678901234567890'
      store.setUserAddress(address)
      expect(store.userAddress).toBe(address)
    })

    it('should clear user address when set to null', () => {
      store.setUserAddress('0x123')
      store.setUserAddress(null)
      expect(store.userAddress).toBeNull()
    })
  })

  describe('Loading State Management', () => {
    it('should set loading state for specific keys', () => {
      store.setLoading('pools', true)
      expect(store.loading.pools).toBe(true)
      expect(store.loading.loans).toBe(false)

      store.setLoading('loans', true)
      expect(store.loading.loans).toBe(true)

      store.setLoading('pools', false)
      expect(store.loading.pools).toBe(false)
    })

    it('should handle all loading state keys', () => {
      const keys: (keyof LoadingStates)[] = ['pools', 'loans', 'transactions', 'memberActions']

      keys.forEach((key) => {
        store.setLoading(key, true)
        expect(store.loading[key]).toBe(true)

        store.setLoading(key, false)
        expect(store.loading[key]).toBe(false)
      })
    })
  })

  describe('Error State Management', () => {
    it('should set and clear error messages', () => {
      const errorMessage = 'Something went wrong'
      store.setError(errorMessage)
      expect(store.error).toBe(errorMessage)

      store.setError(null)
      expect(store.error).toBeNull()
    })
  })

  describe('Pool Management', () => {
    beforeEach(() => {
      store.addPool(mockPool)
    })

    it('should add a pool', () => {
      expect(store.pools.size).toBe(1)
      expect(store.pools.get('pool-1')).toEqual(mockPool)
    })

    it('should update a pool', () => {
      const updates = { name: 'Updated Pool', totalLiquidity: BigInt(2000) }
      store.updatePool('pool-1', updates)

      const updatedPool = store.pools.get('pool-1')!
      expect(updatedPool.name).toBe('Updated Pool')
      expect(updatedPool.totalLiquidity).toBe(BigInt(2000))
      expect(updatedPool.updatedAt).toBeInstanceOf(Date)
    })

    it('should not update non-existent pool', () => {
      const originalSize = store.pools.size
      store.updatePool('non-existent', { name: 'Test' })
      expect(store.pools.size).toBe(originalSize)
    })

    it('should remove a pool', () => {
      store.removePool('pool-1')
      expect(store.pools.size).toBe(0)
    })

    it('should handle removing non-existent pool gracefully', () => {
      const originalSize = store.pools.size
      store.removePool('non-existent')
      expect(store.pools.size).toBe(originalSize)
    })
  })

  describe('Computed Getters - Pools', () => {
    beforeEach(() => {
      const pool1 = {
        ...mockPool,
        id: 'pool-1',
        updatedAt: new Date('2023-01-01'),
      }
      const pool2 = {
        ...mockPool,
        id: 'pool-2',
        updatedAt: new Date('2023-01-02'),
      }
      const pool3 = {
        ...mockPool,
        id: 'pool-3',
        isActive: false,
        updatedAt: new Date('2023-01-03'),
      }

      store.addPool(pool1)
      store.addPool(pool2)
      store.addPool(pool3)
    })

    it('should return all pools sorted by updatedAt descending', () => {
      const pools = store.allPools
      expect(pools).toHaveLength(3)
      expect(pools[0].id).toBe('pool-3') // Most recent
      expect(pools[1].id).toBe('pool-2')
      expect(pools[2].id).toBe('pool-1') // Oldest
    })

    it('should return only active pools', () => {
      const activePools = store.activePools
      expect(activePools).toHaveLength(2)
      expect(activePools.every((pool) => pool.isActive && !pool.isPaused)).toBe(true)
    })

    it('should return user pools when user address is set', () => {
      const userAddress = '0xadmin1'
      store.setUserAddress(userAddress)

      const userPools = store.userPools
      expect(userPools).toHaveLength(3) // User is admin in all mock pools
    })

    it('should return empty array for user pools when no user address', () => {
      const userPools = store.userPools
      expect(userPools).toHaveLength(0)
    })
  })

  describe('Loan Management', () => {
    beforeEach(() => {
      store.addLoan(mockLoan)
    })

    it('should add a loan', () => {
      expect(store.loans.size).toBe(1)
      expect(store.loans.get('loan-1')).toEqual(mockLoan)
    })

    it('should update a loan', () => {
      const updates = { status: LoanStatus.APPROVED, amount: BigInt(150) }
      store.updateLoan('loan-1', updates)

      const updatedLoan = store.loans.get('loan-1')!
      expect(updatedLoan.status).toBe(LoanStatus.APPROVED)
      expect(updatedLoan.amount).toBe(BigInt(150))
    })

    it('should not update non-existent loan', () => {
      const originalSize = store.loans.size
      store.updateLoan('non-existent', { status: LoanStatus.APPROVED })
      expect(store.loans.size).toBe(originalSize)
    })

    it('should approve a loan', () => {
      store.approveLoan('loan-1')

      const loan = store.loans.get('loan-1')!
      expect(loan.status).toBe(LoanStatus.APPROVED)
      expect(loan.approvedAt).toBeInstanceOf(Date)
    })

    it('should disburse a loan', () => {
      store.disburseLoan('loan-1')

      const loan = store.loans.get('loan-1')!
      expect(loan.status).toBe(LoanStatus.DISBURSED)
      expect(loan.disbursedAt).toBeInstanceOf(Date)
    })

    it('should handle partial loan repayment', () => {
      const loan = {
        ...mockLoan,
        amount: BigInt(100),
        interestAccrued: BigInt(10),
      }
      store.loans.set('loan-1', loan)

      const repaymentAmount = BigInt(50)
      store.repayLoan('loan-1', repaymentAmount)

      const updatedLoan = store.loans.get('loan-1')!
      expect(updatedLoan.amountRepaid).toBe(BigInt(50))
      expect(updatedLoan.status).toBe(LoanStatus.REQUESTED) // Not fully repaid
      expect(updatedLoan.repaidAt).toBeUndefined()
    })

    it('should handle full loan repayment', () => {
      const loan = {
        ...mockLoan,
        amount: BigInt(100),
        interestAccrued: BigInt(10),
      }
      store.loans.set('loan-1', loan)

      const repaymentAmount = BigInt(110) // Full amount + interest
      store.repayLoan('loan-1', repaymentAmount)

      const updatedLoan = store.loans.get('loan-1')!
      expect(updatedLoan.amountRepaid).toBe(BigInt(110))
      expect(updatedLoan.status).toBe(LoanStatus.REPAID)
      expect(updatedLoan.repaidAt).toBeInstanceOf(Date)
    })

    it('should handle overpayment', () => {
      const loan = {
        ...mockLoan,
        amount: BigInt(100),
        interestAccrued: BigInt(10),
      }
      store.loans.set('loan-1', loan)

      const repaymentAmount = BigInt(150) // More than needed
      store.repayLoan('loan-1', repaymentAmount)

      const updatedLoan = store.loans.get('loan-1')!
      expect(updatedLoan.amountRepaid).toBe(BigInt(150))
      expect(updatedLoan.status).toBe(LoanStatus.REPAID)
    })

    it('should not repay non-existent loan', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      store.repayLoan('non-existent', BigInt(100))
      expect(store.loans.get('non-existent')).toBeUndefined()
      consoleSpy.mockRestore()
    })
  })

  describe('Computed Getters - Loans', () => {
    beforeEach(() => {
      const userAddress = '0xborrower'
      store.setUserAddress(userAddress)

      const loan1 = {
        ...mockLoan,
        id: 'loan-1',
        requestedAt: new Date('2023-01-01'),
      }
      const loan2 = {
        ...mockLoan,
        id: 'loan-2',
        requestedAt: new Date('2023-01-02'),
      }
      const loan3 = {
        ...mockLoan,
        id: 'loan-3',
        borrower: '0xother',
        requestedAt: new Date('2023-01-03'),
      }
      const loan4 = { ...mockLoan, id: 'loan-4', status: LoanStatus.DISBURSED }

      store.addLoan(loan1)
      store.addLoan(loan2)
      store.addLoan(loan3)
      store.addLoan(loan4)
    })

    it('should return user loans sorted by requestedAt descending', () => {
      const userLoans = store.userLoans
      expect(userLoans).toHaveLength(3) // loan1, loan2, loan4 belong to user
      expect(userLoans[0].id).toBe('loan-2') // Most recent request (2023-01-02)
      expect(userLoans[1].id).toBe('loan-1') // Same date as loan4 but added first
      expect(userLoans[2].id).toBe('loan-4') // Same date as loan1 but added later
    })

    it('should return empty array for user loans when no user address', () => {
      store.setUserAddress(null)
      const userLoans = store.userLoans
      expect(userLoans).toHaveLength(0)
    })

    it('should return only disbursed loans as active loans', () => {
      const activeLoans = store.activeLoans
      expect(activeLoans).toHaveLength(1)
      expect(activeLoans[0].status).toBe(LoanStatus.DISBURSED)
    })
  })

  describe('Transaction Management', () => {
    beforeEach(() => {
      store.addTransaction(mockTransaction)
    })

    it('should add a transaction', () => {
      expect(store.transactions.size).toBe(1)
      expect(store.transactions.get('tx-1')).toEqual(mockTransaction)
    })

    it('should update a transaction', () => {
      const updates = {
        status: TransactionStatus.CONFIRMED,
        amount: BigInt(150),
      }
      store.updateTransaction('tx-1', updates)

      const updatedTx = store.transactions.get('tx-1')!
      expect(updatedTx.status).toBe(TransactionStatus.CONFIRMED)
      expect(updatedTx.amount).toBe(BigInt(150))
    })

    it('should not update non-existent transaction', () => {
      const originalSize = store.transactions.size
      store.updateTransaction('non-existent', {
        status: TransactionStatus.CONFIRMED,
      })
      expect(store.transactions.size).toBe(originalSize)
    })

    it('should confirm a transaction', () => {
      const txHash = '0xabcdef'
      const blockNumber = 12345
      store.confirmTransaction('tx-1', txHash, blockNumber)

      const tx = store.transactions.get('tx-1')!
      expect(tx.status).toBe(TransactionStatus.CONFIRMED)
      expect(tx.txHash).toBe(txHash)
      expect(tx.blockNumber).toBe(blockNumber)
      expect(tx.confirmedAt).toBeInstanceOf(Date)
    })

    it('should confirm a transaction without block number', () => {
      const txHash = '0xabcdef'
      store.confirmTransaction('tx-1', txHash)

      const tx = store.transactions.get('tx-1')!
      expect(tx.status).toBe(TransactionStatus.CONFIRMED)
      expect(tx.txHash).toBe(txHash)
      expect(tx.blockNumber).toBeUndefined()
    })

    it('should fail a transaction', () => {
      store.failTransaction('tx-1')

      const tx = store.transactions.get('tx-1')!
      expect(tx.status).toBe(TransactionStatus.FAILED)
    })
  })

  describe('Computed Getters - Transactions', () => {
    beforeEach(() => {
      const tx1 = {
        ...mockTransaction,
        id: 'tx-1',
        status: TransactionStatus.PENDING,
        createdAt: new Date('2023-01-01'),
      }
      const tx2 = {
        ...mockTransaction,
        id: 'tx-2',
        status: TransactionStatus.PENDING,
        createdAt: new Date('2023-01-02'),
      }
      const tx3 = {
        ...mockTransaction,
        id: 'tx-3',
        status: TransactionStatus.CONFIRMED,
      }

      store.addTransaction(tx1)
      store.addTransaction(tx2)
      store.addTransaction(tx3)
    })

    it('should return pending transactions sorted by createdAt descending', () => {
      const pendingTxs = store.pendingTransactions
      expect(pendingTxs).toHaveLength(2)
      expect(pendingTxs[0].id).toBe('tx-2') // Most recent
      expect(pendingTxs[1].id).toBe('tx-1')
    })
  })

  describe('Pool Filtering', () => {
    beforeEach(() => {
      const pool1 = {
        ...mockPool,
        id: 'pool-1',
        name: 'Bitcoin Pool',
        description: 'Pool for Bitcoin loans',
        isActive: true,
        availableLiquidity: BigInt(1000),
        members: ['0xuser1'],
        admins: [],
      }
      const pool2 = {
        ...mockPool,
        id: 'pool-2',
        name: 'Ethereum Pool',
        description: 'Pool for Ethereum loans',
        isActive: false,
        availableLiquidity: BigInt(500),
        members: [],
        admins: ['0xuser1'],
      }
      const pool3 = {
        ...mockPool,
        id: 'pool-3',
        name: 'Stablecoin Pool',
        description: 'USDC lending pool',
        isActive: true,
        availableLiquidity: BigInt(2000),
        members: [],
        admins: [],
      }

      store.addPool(pool1)
      store.addPool(pool2)
      store.addPool(pool3)
      store.setUserAddress('0xuser1')
    })

    it('should filter pools by active status', () => {
      const filters: PoolFilters = { isActive: true }
      const filtered = store.getFilteredPools(filters)
      expect(filtered).toHaveLength(2)
      expect(filtered.every((pool) => pool.isActive)).toBe(true)
    })

    it('should filter pools by inactive status', () => {
      const filters: PoolFilters = { isActive: false }
      const filtered = store.getFilteredPools(filters)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].isActive).toBe(false)
    })

    it('should filter pools by user membership', () => {
      const filters: PoolFilters = { isUserMember: true }
      const filtered = store.getFilteredPools(filters)
      expect(filtered).toHaveLength(2) // user is member of pool1, admin of pool2
    })

    it('should filter pools by minimum liquidity', () => {
      const filters: PoolFilters = { minLiquidity: BigInt(1000) }
      const filtered = store.getFilteredPools(filters)
      expect(filtered).toHaveLength(2) // pool1 and pool3 have >= 1000
    })

    it('should filter pools by search term in name', () => {
      const filters: PoolFilters = { searchTerm: 'bitcoin' }
      const filtered = store.getFilteredPools(filters)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].name.toLowerCase()).toContain('bitcoin')
    })

    it('should filter pools by search term in description', () => {
      const filters: PoolFilters = { searchTerm: 'USDC' }
      const filtered = store.getFilteredPools(filters)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].description).toContain('USDC')
    })

    it('should apply multiple filters together', () => {
      const filters: PoolFilters = {
        isActive: true,
        minLiquidity: BigInt(1000),
        searchTerm: 'pool', // Should match all
      }
      const filtered = store.getFilteredPools(filters)
      expect(filtered).toHaveLength(2) // pool1 and pool3
    })

    it('should return empty array when no pools match filters', () => {
      const filters: PoolFilters = {
        isActive: true,
        minLiquidity: BigInt(10000), // Too high
      }
      const filtered = store.getFilteredPools(filters)
      expect(filtered).toHaveLength(0)
    })

    it('should not filter by user membership when no user address set', () => {
      store.setUserAddress(null)
      const filters: PoolFilters = { isUserMember: true }
      const filtered = store.getFilteredPools(filters)
      expect(filtered).toHaveLength(3) // Returns all pools
    })
  })

  describe('Pool Statistics', () => {
    beforeEach(() => {
      store.addPool(mockPool)

      const loan1 = {
        ...mockLoan,
        id: 'loan-1',
        poolId: 'pool-1',
        status: LoanStatus.DISBURSED,
      }
      const loan2 = {
        ...mockLoan,
        id: 'loan-2',
        poolId: 'pool-1',
        status: LoanStatus.REQUESTED,
      }
      const loan3 = { ...mockLoan, id: 'loan-3', poolId: 'other-pool' } // Different pool

      store.addLoan(loan1)
      store.addLoan(loan2)
      store.addLoan(loan3)

      const tx1 = {
        ...mockTransaction,
        id: 'tx-1',
        poolId: 'pool-1',
        createdAt: new Date('2023-01-02'),
      }
      const tx2 = {
        ...mockTransaction,
        id: 'tx-2',
        poolId: 'pool-1',
        createdAt: new Date('2023-01-01'),
      }

      store.addTransaction(tx1)
      store.addTransaction(tx2)
    })

    it('should calculate pool statistics', () => {
      const stats = store.getPoolStats('pool-1')
      expect(stats).toEqual({
        totalMembers: 2,
        totalLoans: 2,
        activeLoans: 1,
        totalBorrowed: BigInt(200),
        utilizationRate: 20, // 200 / 1000 * 100
        recentTransactions: [
          expect.objectContaining({ id: 'tx-1' }), // Most recent first
          expect.objectContaining({ id: 'tx-2' }),
        ],
      })
    })

    it('should return null for non-existent pool', () => {
      const stats = store.getPoolStats('non-existent')
      expect(stats).toBeNull()
    })

    it('should handle pools with zero liquidity', () => {
      const zeroLiquidityPool = {
        ...mockPool,
        id: 'zero-pool',
        totalLiquidity: BigInt(0),
      }
      store.addPool(zeroLiquidityPool)

      const stats = store.getPoolStats('zero-pool')
      expect(stats?.utilizationRate).toBe(0)
    })

    it('should limit recent transactions to 10', () => {
      // Add 15 transactions
      for (let i = 3; i <= 17; i++) {
        const tx = { ...mockTransaction, id: `tx-${i}`, poolId: 'pool-1' }
        store.addTransaction(tx)
      }

      const stats = store.getPoolStats('pool-1')
      expect(stats?.recentTransactions).toHaveLength(10)
    })
  })

  describe('User Role Management', () => {
    beforeEach(() => {
      const poolWithRoles = {
        ...mockPool,
        admins: ['0xadmin1', '0xadmin2'],
        members: ['0xmember1', '0xmember2'],
      }
      store.addPool(poolWithRoles)
    })

    it('should return admin role for admin user', () => {
      store.setUserAddress('0xadmin1')
      const role = store.getUserRole('pool-1')
      expect(role).toBe('admin')
    })

    it('should return member role for member user', () => {
      store.setUserAddress('0xmember1')
      const role = store.getUserRole('pool-1')
      expect(role).toBe('member')
    })

    it('should return none for non-member user', () => {
      store.setUserAddress('0xstranger')
      const role = store.getUserRole('pool-1')
      expect(role).toBe('none')
    })

    it('should return none when no user address set', () => {
      const role = store.getUserRole('pool-1')
      expect(role).toBe('none')
    })

    it('should return none for non-existent pool', () => {
      store.setUserAddress('0xadmin1')
      const role = store.getUserRole('non-existent')
      expect(role).toBe('none')
    })

    it('should allow borrowing for members', () => {
      store.setUserAddress('0xmember1')
      expect(store.canUserBorrow('pool-1')).toBe(true)
    })

    it('should allow borrowing for admins', () => {
      store.setUserAddress('0xadmin1')
      expect(store.canUserBorrow('pool-1')).toBe(true)
    })

    it('should not allow borrowing for non-members', () => {
      store.setUserAddress('0xstranger')
      expect(store.canUserBorrow('pool-1')).toBe(false)
    })
  })

  describe('User Pool Contribution', () => {
    it('should return placeholder contribution amount', () => {
      // This is a placeholder method that always returns 0n
      const contribution = store.getUserPoolContribution('pool-1')
      expect(contribution).toBe(BigInt(0))
    })
  })

  describe('Async Actions', () => {
    describe('loadPools', () => {
      it('should set loading state during pool loading', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        // Since loadPools is a placeholder that completes synchronously,
        // we test the complete flow including the loading state reset
        await store.loadPools()

        expect(store.loading.pools).toBe(false) // Should be false after completion
        expect(store.error).toBeNull()
        expect(consoleSpy).toHaveBeenCalledWith('Loading pools...')

        consoleSpy.mockRestore()
      })

      it('should handle errors during pool loading', async () => {
        const originalConsoleLog = console.log
        console.log = jest.fn().mockImplementation(() => {
          throw new Error('Network error')
        })

        await store.loadPools()
        expect(store.error).toBe('Network error')
        expect(store.loading.pools).toBe(false)

        console.log = originalConsoleLog
      })

      it('should handle non-Error exceptions', async () => {
        const originalConsoleLog = console.log
        console.log = jest.fn().mockImplementation(() => {
          throw 'String error'
        })

        await store.loadPools()
        expect(store.error).toBe('Failed to load pools')

        console.log = originalConsoleLog
      })
    })

    describe('createPool', () => {
      const poolData = {
        name: 'New Pool',
        description: 'A new lending pool',
        contractAddress: '0xnew',
        creator: '0xowner',
        admins: [],
        members: [],
        maxMembers: 10,
        minimumContribution: BigInt(50),
        interestRate: 500,
        loanDuration: 2592000,
        totalLiquidity: BigInt(1000),
        availableLiquidity: BigInt(1000),
        totalBorrowed: BigInt(0),
        isActive: true,
        isPaused: false,
      }

      it('should set loading state during pool creation', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        // Since createPool is a placeholder that completes synchronously,
        // we test the complete flow including the loading state reset
        await store.createPool(poolData)

        expect(store.loading.memberActions).toBe(false) // Should be false after completion
        expect(store.error).toBeNull()
        expect(consoleSpy).toHaveBeenCalledWith('Creating pool...', poolData)

        consoleSpy.mockRestore()
      })

      it('should handle errors during pool creation', async () => {
        const originalConsoleLog = console.log
        console.log = jest.fn().mockImplementation(() => {
          throw new Error('Creation failed')
        })

        await expect(store.createPool(poolData)).rejects.toThrow('Creation failed')
        expect(store.error).toBe('Creation failed')
        expect(store.loading.memberActions).toBe(false)

        console.log = originalConsoleLog
      })

      it('should handle non-Error exceptions during pool creation', async () => {
        const originalConsoleLog = console.log
        console.log = jest.fn().mockImplementation(() => {
          throw 'String error'
        })

        await expect(store.createPool(poolData)).rejects.toBe('String error')
        expect(store.error).toBe('Failed to create pool')

        console.log = originalConsoleLog
      })
    })

    describe('joinPool', () => {
      beforeEach(() => {
        store.addPool(mockPool)
        store.setUserAddress('0xnewuser')
      })

      it('should throw error when user not connected', async () => {
        store.setUserAddress(null)
        await expect(store.joinPool('pool-1')).rejects.toThrow('User not connected')
      })

      it('should add user to pool members', async () => {
        await store.joinPool('pool-1')

        const pool = store.pools.get('pool-1')!
        expect(pool.members).toContain('0xnewuser')
      })

      it('should not add user twice to pool members', async () => {
        // Add user first time
        await store.joinPool('pool-1')
        const poolAfterFirst = store.pools.get('pool-1')!
        const membersCountAfterFirst = poolAfterFirst.members.length

        // Try to add same user again
        await store.joinPool('pool-1')
        const poolAfterSecond = store.pools.get('pool-1')!

        expect(poolAfterSecond.members.length).toBe(membersCountAfterFirst) // No change
      })

      it('should handle non-existent pool gracefully', async () => {
        await store.joinPool('non-existent')
        // Should not throw error, just do nothing
      })

      it('should set loading state during join', async () => {
        // Since joinPool is a placeholder that completes synchronously,
        // we test the complete flow including the loading state reset
        await store.joinPool('pool-1')

        expect(store.loading.memberActions).toBe(false) // Should be false after completion
      })

      it('should handle errors during join', async () => {
        // Mock an error by making the pool update fail
        const originalUpdatePool = store.updatePool
        store.updatePool = jest.fn().mockImplementation(() => {
          throw new Error('Update failed')
        })

        await expect(store.joinPool('pool-1')).rejects.toThrow('Update failed')
        expect(store.error).toBe('Update failed')

        store.updatePool = originalUpdatePool
      })

      it('should handle non-Error exceptions during join', async () => {
        // Mock an error by making the pool update fail with non-Error
        const originalUpdatePool = store.updatePool
        store.updatePool = jest.fn().mockImplementation(() => {
          throw 'String error' // Non-Error type
        })

        await expect(store.joinPool('pool-1')).rejects.toBe('String error')
        expect(store.error).toBe('Failed to join pool')

        store.updatePool = originalUpdatePool
      })
    })
  })

  describe('Reset Functionality', () => {
    beforeEach(() => {
      // Set up some state
      store.addPool(mockPool)
      store.addLoan(mockLoan)
      store.addTransaction(mockTransaction)
      store.setUserAddress('0xuser')
      store.setError('Some error')
      store.setLoading('pools', true)
    })

    it('should reset all state to initial values', () => {
      store.reset()

      expect(store.pools.size).toBe(0)
      expect(store.loans.size).toBe(0)
      expect(store.transactions.size).toBe(0)
      expect(store.userAddress).toBeNull()
      expect(store.error).toBeNull()
      expect(store.loading).toEqual({
        pools: false,
        loans: false,
        transactions: false,
        memberActions: false,
      })
    })
  })

  describe('MobX Reactivity', () => {
    it('should trigger reactions when pools change', () => {
      const reactionSpy = jest.fn()

      // Create a simple reaction to track allPools
      const { reaction } = require('mobx')
      const dispose = reaction(() => store.allPools.length, reactionSpy)

      store.addPool(mockPool)
      expect(reactionSpy).toHaveBeenCalledWith(1, 0, expect.anything())

      dispose()
    })

    it('should trigger reactions when loading state changes', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => store.loading.pools, reactionSpy)

      store.setLoading('pools', true)
      expect(reactionSpy).toHaveBeenCalledWith(true, false, expect.anything())

      dispose()
    })

    it('should trigger reactions when user address changes', () => {
      const reactionSpy = jest.fn()

      const { reaction } = require('mobx')
      const dispose = reaction(() => store.userAddress, reactionSpy)

      store.setUserAddress('0x123')
      expect(reactionSpy).toHaveBeenCalledWith('0x123', null, expect.anything())

      dispose()
    })
  })

  describe('Edge Cases', () => {
    it('should handle bigint serialization in updates', () => {
      store.addPool(mockPool)

      // Update with new bigint values
      store.updatePool('pool-1', {
        totalLiquidity: BigInt('999999999999999999999'),
        availableLiquidity: BigInt('888888888888888888888'),
      })

      const pool = store.pools.get('pool-1')!
      expect(pool.totalLiquidity).toBe(BigInt('999999999999999999999'))
      expect(pool.availableLiquidity).toBe(BigInt('888888888888888888888'))
    })

    it('should handle empty search terms', () => {
      store.addPool(mockPool)

      const filtered = store.getFilteredPools({ searchTerm: '' })
      expect(filtered).toHaveLength(1) // Empty string should not filter anything
    })

    it('should handle case-insensitive search', () => {
      store.addPool({ ...mockPool, name: 'Bitcoin Pool' })

      const filtered = store.getFilteredPools({ searchTerm: 'BITCOIN' })
      expect(filtered).toHaveLength(1)
    })

    it('should handle multiple loans for same borrower', () => {
      const userAddress = '0xborrower'
      store.setUserAddress(userAddress)

      const loan1 = { ...mockLoan, id: 'loan-1', amount: BigInt(100) }
      const loan2 = { ...mockLoan, id: 'loan-2', amount: BigInt(200) }

      store.addLoan(loan1)
      store.addLoan(loan2)

      const userLoans = store.userLoans
      expect(userLoans).toHaveLength(2)
      expect(userLoans.reduce((sum, loan) => sum + loan.amount, BigInt(0))).toBe(BigInt(300))
    })
  })
})
