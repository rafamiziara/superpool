import { PoolInfo } from '@superpool/types'
import { mockLogger } from '../../__tests__/setup'

// Import mocked services (already mocked in setup.ts)
const { firestore } = require('../../services')

// Import the handler to test
const { listPoolsHandler } = require('./listPools')

describe('listPoolsHandler', () => {
  const mockPools: PoolInfo[] = [
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
    },
  ]

  // Helper to create mock query chain
  const createMockQuery = (docs: PoolInfo[], totalCount: number) => {
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
      pools: mockPools,
      totalCount: 2,
      page: 1,
      limit: 20,
      hasNextPage: false,
      hasPreviousPage: false,
    })
    expect(mockLogger.info).toHaveBeenCalledWith('Listing pools', { params: {} })
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
    const ownerAddress = '0xOWNER1' // Uppercase to test lowercasing
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
  it('should enforce minimum limit of 1 for negative values', async () => {
    // Arrange
    const request = { data: { limit: -5 } }
    const mockQuery = createMockQuery(mockPools, 2)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    expect(mockQuery.limit).toHaveBeenCalledWith(1)
    expect(result.limit).toBe(1)
  })

  // Test Case: Minimum page (at least 1)
  it('should enforce minimum page of 1', async () => {
    // Arrange
    const request = { data: { page: 0 } }
    const mockQuery = createMockQuery(mockPools, 2)
    firestore.collection.mockReturnValue(mockQuery)

    // Act
    const result = await listPoolsHandler(request)

    // Assert
    expect(mockQuery.offset).toHaveBeenCalledWith(0)
    expect(result.page).toBe(1)
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
        ownerAddress: '0xOwner1',
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
    expect(mockQuery.where).toHaveBeenCalledWith('poolOwner', '==', '0xowner1')
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
    expect(result.pools[0].createdAt).toBeInstanceOf(Date)
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
