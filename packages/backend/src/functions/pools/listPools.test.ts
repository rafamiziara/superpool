import { PoolInfo } from '@superpool/types'
import { mockLogger } from '../../__tests__/setup'

/**
 * A pool as Firestore stores it, which is not what the callable returns:
 * `createdAt` is a Timestamp there and an ISO string on the wire.
 *
 * `loanToken` is optional here and required on the wire, which is the whole
 * point of the retrofit: a document written before pools had a denomination
 * simply has no such field, and the handler answers "native" for it.
 */
type StoredPool = Omit<PoolInfo, 'createdAt' | 'loanToken'> & {
  createdAt: Date
  loanToken?: string
}

const NATIVE = '0x0000000000000000000000000000000000000000'

// Import mocked services (already mocked in setup.ts)
const { firestore } = require('../../services')

// Import the handler to test
const { listPoolsHandler } = require('./listPools')

describe('listPoolsHandler', () => {
  const mockPools: StoredPool[] = [
    {
      poolId: 1,
      poolAddress: '0xPoolAddress1',
      poolOwner: '0xOwner1',
      name: 'Pool 1',
      description: 'Test pool 1',
      maxLoanAmount: '1000000000000000000',
      interestRate: 500,
      loanDuration: 2592000,
      chainId: 80002,
      createdBy: '0xCreator1',
      createdAt: new Date('2024-01-01'),
      transactionHash: '0xTxHash1',
      isActive: true,
      loanToken: NATIVE,
    },
    {
      poolId: 2,
      poolAddress: '0xPoolAddress2',
      poolOwner: '0xOwner2',
      name: 'Pool 2',
      description: 'Test pool 2',
      maxLoanAmount: '2000000000000000000',
      interestRate: 600,
      loanDuration: 2592000,
      chainId: 80002,
      createdBy: '0xCreator2',
      createdAt: new Date('2024-01-02'),
      transactionHash: '0xTxHash2',
      isActive: true,
      loanToken: '0xstablecoin',
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
    },
  ]

  // Helper to create mock query chain
  const createMockQuery = (docs: StoredPool[], totalCount: number) => {
    const mockDocs = docs.map((pool) => ({
      data: () => ({
        ...pool,
        createdAt: { toDate: () => pool.createdAt },
      }),
    }))

    const query = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: mockDocs }),
      count: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: totalCount }),
        }),
      }),
    }

    return query
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // Test Case: Successful pool listing with defaults (Happy Path)
  it('should successfully list pools with default parameters', async () => {
    // Arrange
    const request = { data: {} }
    const mockQuery = createMockQuery(mockPools, 2)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    expect(firestore.collection).toHaveBeenCalledWith('pools')
    expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', 80002)
    expect(mockQuery.where).toHaveBeenCalledWith('isActive', '==', true)
    expect(mockQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc')
    expect(mockQuery.offset).toHaveBeenCalledWith(0)
    expect(mockQuery.limit).toHaveBeenCalledWith(20)
    expect(result).toEqual({
      // createdAt crosses the wire as an ISO string, so the fixtures' Dates are
      // not what the handler returns.
      pools: mockPools.map((pool) => ({ ...pool, createdAt: pool.createdAt.toISOString() })),
      totalCount: 2,
      page: 1,
      limit: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    })
    expect(mockLogger.info).toHaveBeenCalledWith('Listing pools', { params: {} })
  })

  describe('denomination', () => {
    it('reports a pool indexed before denominations existed as native', async () => {
      // The retrofit. Nothing could have created a token pool before the field
      // existed, so an absent one is not missing information — it is the answer.
      const { loanToken: _omitted, ...legacyPool } = mockPools[0]
      firestore.collection.mockReturnValue(createMockQuery([legacyPool], 1))

      const result = await listPoolsHandler({ data: {} })

      expect(result.pools[0].loanToken).toBe(NATIVE)
      expect(result.pools[0].tokenSymbol).toBeUndefined()
      expect(result.pools[0].tokenDecimals).toBeUndefined()
    })

    it('gives a native pool no symbol of its own', async () => {
      // The native symbol is POL on Polygon and ETH on Base — a fact about the
      // chain, which the app already knows, not about the pool. Answering 'POL'
      // here would put it on a Base pool.
      firestore.collection.mockReturnValue(createMockQuery([mockPools[0]], 1))

      const result = await listPoolsHandler({ data: {} })

      expect(result.pools[0].loanToken).toBe(NATIVE)
      expect(result.pools[0].tokenSymbol).toBeUndefined()
    })

    it('carries a token pool’s symbol and decimals through', async () => {
      firestore.collection.mockReturnValue(createMockQuery([mockPools[1]], 1))

      const result = await listPoolsHandler({ data: {} })

      expect(result.pools[0]).toMatchObject({
        loanToken: '0xstablecoin',
        tokenSymbol: 'USDC',
        tokenDecimals: 6,
      })
    })

    it('leaves decimals absent when the token was never read, rather than defaulting to 18', async () => {
      // The sharpest rule in the feature. A token pool whose metadata could not
      // be read has to reach the app as unsupported; 18 decimals against a
      // 6-decimal token renders 5 USDC as 5,000,000,000,000.
      const { tokenSymbol: _symbol, tokenDecimals: _decimals, ...unreadable } = mockPools[1]
      firestore.collection.mockReturnValue(createMockQuery([unreadable], 1))

      const result = await listPoolsHandler({ data: {} })

      expect(result.pools[0].loanToken).toBe('0xstablecoin')
      expect(result.pools[0].tokenDecimals).toBeUndefined()
    })
  })

  // Test Case: Pagination - Page 2
  it('should handle pagination correctly for page 2', async () => {
    // Arrange
    const request = { data: { page: 2, limit: 10 } }
    const mockQuery = createMockQuery(mockPools, 25)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    expect(mockQuery.offset).toHaveBeenCalledWith(10) // (page - 1) * limit = (2 - 1) * 10
    expect(mockQuery.limit).toHaveBeenCalledWith(10)
    expect(result.page).toBe(2)
    expect(result.limit).toBe(10)
    expect(result.hasNextPage).toBe(true) // offset 10 + 2 pools < 25
    expect(result.hasPreviousPage).toBe(true)
  })

  // Test Case: Filter by owner address
  it('should filter pools by owner address', async () => {
    // Arrange
    // A real address, in mixed case, to exercise the lowercasing. It used to
    // be '0xOWNER1', which is not an address at all — a filter that could only
    // ever match nothing, passing as though it had been applied.
    const ownerAddress = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
    const request = { data: { ownerAddress } }
    const mockQuery = createMockQuery([mockPools[0]], 1)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('poolOwner', '==', ownerAddress.toLowerCase())
    expect(result.pools).toHaveLength(1)
    expect(result.totalCount).toBe(1)
  })

  // Test Case: Filter by chainId
  it('should filter pools by chainId', async () => {
    // Arrange
    const request = { data: { chainId: 137 } }
    const mockQuery = createMockQuery(mockPools, 2)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    await listPoolsHandler(request)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', 137)
  })

  // Test Case: Include inactive pools
  it('should include inactive pools when activeOnly is false', async () => {
    // Arrange
    const request = { data: { activeOnly: false } }
    const mockQuery = createMockQuery(mockPools, 2)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    await listPoolsHandler(request)

    // Assert
    // Should only have one where call for chainId, not for isActive
    const whereCalls = mockQuery.where.mock.calls
    const hasActiveFilter = whereCalls.some((call) => call[0] === 'isActive')
    expect(hasActiveFilter).toBe(false)
  })

  // Test Case: Limit capping (max 100)
  it('should cap limit at 100 pools per page', async () => {
    // Arrange
    const request = { data: { limit: 500 } }
    const mockQuery = createMockQuery(mockPools, 2)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(100)
    expect(result.limit).toBe(100)
  })

  // Test Case: Minimum limit (at least 1)
  it('should refuse a negative limit rather than floor it', async () => {
    // Arrange
    const request = { data: { limit: -5 } }
    const mockQuery = createMockQuery(mockPools, 2)
    firestore.collection.mockReturnValue(mockQuery)

    // Act & Assert
    await expect(listPoolsHandler(request)).rejects.toThrow(/limit/i)
    expect(mockQuery.limit).not.toHaveBeenCalled()
  })

  // Test Case: Minimum page (at least 1)
  it('should refuse page zero rather than read it as the first page', async () => {
    // Arrange — pages are one-based, so a zeroth page is a caller's off-by-one
    // and answering it with the first hides that.
    const request = { data: { page: 0 } }
    const mockQuery = createMockQuery(mockPools, 2)
    firestore.collection.mockReturnValue(mockQuery)

    // Act & Assert
    await expect(listPoolsHandler(request)).rejects.toThrow(/page/i)
    expect(mockQuery.offset).not.toHaveBeenCalled()
  })

  // Test Case: Empty results
  it('should handle empty pool list', async () => {
    // Arrange
    const request = { data: {} }
    const mockQuery = createMockQuery([], 0)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    expect(result.pools).toEqual([])
    expect(result.totalCount).toBe(0)
    expect(result.hasNextPage).toBe(false)
    expect(result.hasPreviousPage).toBe(false)
  })

  // Test Case: Combined filters
  it('should handle multiple filters correctly', async () => {
    // Arrange
    const request = {
      data: {
        ownerAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        chainId: 80002,
        activeOnly: true,
        page: 1,
        limit: 10,
      },
    }
    const mockQuery = createMockQuery([mockPools[0]], 1)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    expect(mockQuery.where).toHaveBeenCalledWith('chainId', '==', 80002)
    expect(mockQuery.where).toHaveBeenCalledWith('poolOwner', '==', '0x70997970c51812dc3a010c7d01b50e0d17dc79c8')
    expect(mockQuery.where).toHaveBeenCalledWith('isActive', '==', true)
    expect(result.pools).toHaveLength(1)
  })

  // Test Case: Pagination metadata - last page
  it('should correctly set pagination metadata for last page', async () => {
    // Arrange
    const request = { data: { page: 3, limit: 10 } }
    const mockQuery = createMockQuery([mockPools[0]], 21) // 3rd page of 21 total items
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    expect(result.hasNextPage).toBe(false) // offset 20 + 1 pool = 21, not less than 21
    expect(result.hasPreviousPage).toBe(true)
  })

  // Test Case: Error handling - Firestore query fails
  it('should throw HttpsError when Firestore query fails', async () => {
    // Arrange
    const request = { data: {} }
    const mockQuery = createMockQuery([], 0)
    mockQuery.count.mockReturnValue({
      get: jest.fn().mockRejectedValue(new Error('Firestore error')),
    })
    firestore.collection.mockReturnValue(mockQuery)

    // Act & Assert
    await expect(listPoolsHandler(request)).rejects.toThrow('Failed to list pools. Please try again.')
    await expect(listPoolsHandler(request)).rejects.toHaveProperty('code', 'internal')
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error listing pools',
      expect.objectContaining({
        error: 'Firestore error',
        params: {},
      })
    )
  })

  // Test Case: Error handling - Query execution fails
  it('should throw HttpsError when query execution fails', async () => {
    // Arrange
    const request = { data: {} }
    const mockQuery = createMockQuery([], 0)
    mockQuery.get.mockRejectedValue(new Error('Query execution failed'))
    firestore.collection.mockReturnValue(mockQuery)

    // Act & Assert
    await expect(listPoolsHandler(request)).rejects.toThrow('Failed to list pools. Please try again.')
    await expect(listPoolsHandler(request)).rejects.toHaveProperty('code', 'internal')
  })

  // Test Case: Handle missing createdAt timestamp
  it('should handle pools with missing createdAt timestamp', async () => {
    // Arrange
    const request = { data: {} }
    const mockDocs = [
      {
        data: () => ({
          ...mockPools[0],
          createdAt: null,
        }),
      },
    ]
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: mockDocs }),
      count: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 1 }),
        }),
      }),
    }
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    // An ISO string, not a Date: a Date returned from a callable is encoded to `{}`.
    expect(typeof result.pools[0].createdAt).toBe('string')
    expect(new Date(result.pools[0].createdAt).getTime()).not.toBeNaN()
  })

  // Test Case: Error handling - Non-Error object thrown
  it('should handle non-Error objects thrown during query execution', async () => {
    // Arrange
    const request = { data: {} }
    const mockQuery = createMockQuery([], 0)
    const nonErrorObject = { code: 'CUSTOM_ERROR', details: 'Custom error details' }
    mockQuery.get.mockRejectedValue(nonErrorObject)
    firestore.collection.mockReturnValue(mockQuery)

    // Act & Assert
    await expect(listPoolsHandler(request)).rejects.toThrow('Failed to list pools. Please try again.')
    await expect(listPoolsHandler(request)).rejects.toHaveProperty('code', 'internal')
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error listing pools',
      expect.objectContaining({
        error: '[object Object]',
        params: {},
      })
    )
  })
})
