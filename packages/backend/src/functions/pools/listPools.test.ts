/**
 * Comprehensive Tests for List Pools Function
 *
 * Tests all aspects of the listPools Cloud Function including:
 * - Pool listing with pagination and filtering
 * - Firestore query optimization and performance
 * - Parameter validation and constraints
 * - Sorting and ordering functionality
 * - Error handling for various failure scenarios
 * - Performance testing for large datasets
 * - Edge cases (empty results, invalid parameters, etc.)
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import {
  detectMemoryLeaks,
  firebaseAdminMock,
  type LoadTestConfig,
  MockFactory,
  performanceManager,
  type PerformanceThresholds,
  quickSetup,
  runBenchmark,
  startPerformanceTest,
  TestFixtures,
} from '../../__mocks__'
import { listPools, ListPoolsRequest, ListPoolsResponse, PoolInfo } from './listPools'
import { HttpsError } from 'firebase-functions/v2/https'
import { AppError } from '../../utils/errorHandling'

describe('listPools Cloud Function', () => {
  let testEnvironment: any
  let mockFirestoreQuery: any
  let mockCollection: any

  beforeAll(() => {
    performanceManager.clearAll()
  })

  beforeEach(() => {
    MockFactory.resetAllMocks()
    testEnvironment = quickSetup.poolCreation()

    // Setup sophisticated Firestore query mocks
    mockFirestoreQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn(),
      count: jest.fn(),
    }

    mockCollection = {
      doc: jest.fn(),
      where: jest.fn().mockReturnValue(mockFirestoreQuery),
    }

    firebaseAdminMock.firestore.collection.mockReturnValue(mockCollection)
  })

  afterEach(() => {
    MockFactory.resetAllMocks()
  })

  afterAll(() => {
    const report = performanceManager.generateReport()
    console.log('🎯 Pool Listing Performance Report:')
    console.log(`   Total Tests: ${report.totalTests}`)
    console.log(`   Total Benchmarks: ${report.totalBenchmarks}`)
    console.log(`   Overall Average Execution Time: ${report.overallStats.averageExecutionTime.toFixed(2)}ms`)
  })

  describe('Happy Path Scenarios', () => {
    it('should return paginated pools with default parameters', async () => {
      const performance = startPerformanceTest('basic-pool-listing', 'happy-path')

      // Mock pool data
      const mockPools = Array.from({ length: 5 }, (_, i) => ({
        id: `pool-${i + 1}`,
        data: () => ({
          poolId: i + 1,
          poolAddress: `0x${(i + 1).toString().repeat(40)}`.substring(0, 42),
          poolOwner: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
          name: `Pool ${i + 1}`,
          description: `Description for Pool ${i + 1}`,
          maxLoanAmount: (1000 + i * 500).toString() + '000000000000000000', // In wei
          interestRate: 500 + i * 100, // Basis points
          loanDuration: 86400 * (7 + i), // Days in seconds
          chainId: 80002,
          createdBy: `user-${i + 1}`,
          createdAt: { toDate: () => new Date(Date.now() - i * 3600000) }, // Hours apart
          transactionHash: `0x${'tx' + i}${'0'.repeat(58)}`,
          isActive: true,
        }),
      }))

      // Mock count query
      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 25 }),
        }),
      })

      // Mock results query
      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({})

      const result = (await listPools(request)) as ListPoolsResponse

      const metrics = performance.end()

      // Verify successful response structure
      expect(result.pools).toHaveLength(5)
      expect(result.totalCount).toBe(25)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.hasNextPage).toBe(true)
      expect(result.hasPreviousPage).toBe(false)

      // Verify pool data structure
      const pool = result.pools[0]
      expect(pool).toMatchObject({
        poolId: 1,
        poolAddress: expect.stringMatching(/^0x[a-f0-9]{40}$/),
        poolOwner: expect.stringMatching(/^0x[a-f0-9]{40}$/),
        name: 'Pool 1',
        description: 'Description for Pool 1',
        maxLoanAmount: expect.stringMatching(/^\d+$/),
        interestRate: expect.any(Number),
        loanDuration: expect.any(Number),
        chainId: 80002,
        createdBy: expect.any(String),
        createdAt: expect.any(Date),
        transactionHash: expect.stringMatching(/^0x[a-f0-9]{64}$/),
        isActive: true,
      })

      // Verify Firestore query construction
      expect(mockCollection.where).toHaveBeenCalledWith('chainId', '==', 80002)
      expect(mockFirestoreQuery.where).toHaveBeenCalledWith('isActive', '==', true)
      expect(mockFirestoreQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc')
      expect(mockFirestoreQuery.offset).toHaveBeenCalledWith(0)
      expect(mockFirestoreQuery.limit).toHaveBeenCalledWith(20)

      // Performance validation
      expect(metrics.executionTime).toBeLessThan(1000) // Should complete in under 1 second
    })

    it('should handle pagination correctly for multiple pages', async () => {
      // Test page 3 with custom limit
      const mockPools = Array.from({ length: 5 }, (_, i) => ({
        id: `pool-${i + 21}`,
        data: () => ({
          poolId: i + 21,
          poolAddress: `0x${(i + 21).toString().repeat(2).padEnd(40, '0')}`,
          poolOwner: TestFixtures.TestData.addresses.poolOwners[0],
          name: `Pool ${i + 21}`,
          description: `Description ${i + 21}`,
          maxLoanAmount: '1000000000000000000',
          interestRate: 500,
          loanDuration: 86400 * 7,
          chainId: 80002,
          createdBy: 'test-user',
          createdAt: { toDate: () => new Date() },
          transactionHash: `0x${'tx' + (i + 21)}${'0'.repeat(56)}`,
          isActive: true,
        }),
      }))

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 50 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({
        page: 3,
        limit: 10,
      })

      const result = (await listPools(request)) as ListPoolsResponse

      expect(result.pools).toHaveLength(5)
      expect(result.totalCount).toBe(50)
      expect(result.page).toBe(3)
      expect(result.limit).toBe(10)
      expect(result.hasNextPage).toBe(true) // (3-1) * 10 + 5 = 25 < 50
      expect(result.hasPreviousPage).toBe(true) // page 3 > 1

      // Verify correct offset calculation
      expect(mockFirestoreQuery.offset).toHaveBeenCalledWith(20) // (3-1) * 10
      expect(mockFirestoreQuery.limit).toHaveBeenCalledWith(10)
    })

    it('should filter by owner address correctly', async () => {
      const targetOwner = TestFixtures.TestData.addresses.poolOwners[0]

      const mockPools = Array.from({ length: 3 }, (_, i) => ({
        id: `owner-pool-${i + 1}`,
        data: () => ({
          poolId: i + 100,
          poolAddress: `0x${(i + 100).toString().padEnd(40, '0')}`,
          poolOwner: targetOwner,
          name: `Owner Pool ${i + 1}`,
          description: `Pool owned by ${targetOwner}`,
          maxLoanAmount: '2000000000000000000',
          interestRate: 600,
          loanDuration: 86400 * 14,
          chainId: 80002,
          createdBy: 'owner-user',
          createdAt: { toDate: () => new Date() },
          transactionHash: `0x${'owner' + i}${'0'.repeat(56)}`,
          isActive: true,
        }),
      }))

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 3 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({
        ownerAddress: targetOwner,
      })

      const result = (await listPools(request)) as ListPoolsResponse

      expect(result.pools).toHaveLength(3)
      expect(result.totalCount).toBe(3)
      expect(result.hasNextPage).toBe(false)
      expect(result.hasPreviousPage).toBe(false)

      // Verify all returned pools have correct owner
      result.pools.forEach((pool) => {
        expect(pool.poolOwner).toBe(targetOwner)
      })

      // Verify owner filter was applied
      expect(mockFirestoreQuery.where).toHaveBeenCalledWith('poolOwner', '==', targetOwner.toLowerCase())
    })

    it('should filter by chain ID correctly', async () => {
      // Test Polygon Mainnet (chain ID 137)
      const mockPools = Array.from({ length: 2 }, (_, i) => ({
        id: `mainnet-pool-${i + 1}`,
        data: () => ({
          poolId: i + 200,
          poolAddress: `0x${(i + 200).toString().padEnd(40, '0')}`,
          poolOwner: TestFixtures.TestData.addresses.poolOwners[i],
          name: `Mainnet Pool ${i + 1}`,
          description: `Pool on Polygon Mainnet`,
          maxLoanAmount: '5000000000000000000',
          interestRate: 400,
          loanDuration: 86400 * 30,
          chainId: 137,
          createdBy: 'mainnet-user',
          createdAt: { toDate: () => new Date() },
          transactionHash: `0x${'mainnet' + i}${'0'.repeat(52)}`,
          isActive: true,
        }),
      }))

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 2 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({
        chainId: 137,
      })

      const result = (await listPools(request)) as ListPoolsResponse

      expect(result.pools).toHaveLength(2)
      result.pools.forEach((pool) => {
        expect(pool.chainId).toBe(137)
      })

      // Verify chain ID filter was applied
      expect(mockCollection.where).toHaveBeenCalledWith('chainId', '==', 137)
    })

    it('should include inactive pools when activeOnly is false', async () => {
      const mockPools = [
        {
          id: 'active-pool',
          data: () => ({
            poolId: 301,
            poolAddress: '0x' + '301'.padEnd(40, '0'),
            poolOwner: TestFixtures.TestData.addresses.poolOwners[0],
            name: 'Active Pool',
            description: 'This pool is active',
            maxLoanAmount: '1000000000000000000',
            interestRate: 500,
            loanDuration: 86400 * 7,
            chainId: 80002,
            createdBy: 'user-1',
            createdAt: { toDate: () => new Date(Date.now() - 86400000) },
            transactionHash: '0x' + 'active'.padEnd(60, '0'),
            isActive: true,
          }),
        },
        {
          id: 'inactive-pool',
          data: () => ({
            poolId: 302,
            poolAddress: '0x' + '302'.padEnd(40, '0'),
            poolOwner: TestFixtures.TestData.addresses.poolOwners[1],
            name: 'Inactive Pool',
            description: 'This pool is inactive',
            maxLoanAmount: '2000000000000000000',
            interestRate: 600,
            loanDuration: 86400 * 14,
            chainId: 80002,
            createdBy: 'user-2',
            createdAt: { toDate: () => new Date(Date.now() - 2 * 86400000) },
            transactionHash: '0x' + 'inactive'.padEnd(56, '0'),
            isActive: false,
          }),
        },
      ]

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 2 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({
        activeOnly: false,
      })

      const result = (await listPools(request)) as ListPoolsResponse

      expect(result.pools).toHaveLength(2)

      const activePool = result.pools.find((p) => p.poolId === 301)
      const inactivePool = result.pools.find((p) => p.poolId === 302)

      expect(activePool?.isActive).toBe(true)
      expect(inactivePool?.isActive).toBe(false)

      // Verify activeOnly filter was NOT applied
      expect(mockFirestoreQuery.where).not.toHaveBeenCalledWith('isActive', '==', true)
    })
  })

  describe('Parameter Validation and Edge Cases', () => {
    it('should handle minimum and maximum page values', async () => {
      const mockPools = Array.from({ length: 3 }, (_, i) => ({
        id: `edge-pool-${i}`,
        data: () => ({
          poolId: i + 400,
          poolAddress: `0x${(i + 400).toString().padEnd(40, '0')}`,
          poolOwner: TestFixtures.TestData.addresses.poolOwners[0],
          name: `Edge Pool ${i}`,
          description: 'Edge case pool',
          maxLoanAmount: '1000000000000000000',
          interestRate: 500,
          loanDuration: 86400 * 7,
          chainId: 80002,
          createdBy: 'edge-user',
          createdAt: { toDate: () => new Date() },
          transactionHash: `0x${'edge' + i}${'0'.repeat(57)}`,
          isActive: true,
        }),
      }))

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 3 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      // Test page 0 (should default to 1)
      let request = testEnvironment.functionTester.createUnauthenticatedRequest({
        page: 0,
      })

      let result = (await listPools(request)) as ListPoolsResponse
      expect(result.page).toBe(1)
      expect(mockFirestoreQuery.offset).toHaveBeenCalledWith(0)

      // Test negative page (should default to 1)
      request = testEnvironment.functionTester.createUnauthenticatedRequest({
        page: -5,
      })

      result = (await listPools(request)) as ListPoolsResponse
      expect(result.page).toBe(1)
    })

    it('should handle minimum and maximum limit values', async () => {
      const mockPools = Array.from({ length: 1 }, (_, i) => ({
        id: `limit-pool-${i}`,
        data: () => ({
          poolId: i + 500,
          poolAddress: `0x${(i + 500).toString().padEnd(40, '0')}`,
          poolOwner: TestFixtures.TestData.addresses.poolOwners[0],
          name: `Limit Pool ${i}`,
          description: 'Limit test pool',
          maxLoanAmount: '1000000000000000000',
          interestRate: 500,
          loanDuration: 86400 * 7,
          chainId: 80002,
          createdBy: 'limit-user',
          createdAt: { toDate: () => new Date() },
          transactionHash: `0x${'limit' + i}${'0'.repeat(56)}`,
          isActive: true,
        }),
      }))

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 1 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      // Test limit 0 (should default to 1)
      let request = testEnvironment.functionTester.createUnauthenticatedRequest({
        limit: 0,
      })

      let result = (await listPools(request)) as ListPoolsResponse
      expect(result.limit).toBe(1)
      expect(mockFirestoreQuery.limit).toHaveBeenCalledWith(1)

      // Test excessive limit (should cap at 100)
      request = testEnvironment.functionTester.createUnauthenticatedRequest({
        limit: 500,
      })

      result = (await listPools(request)) as ListPoolsResponse
      expect(result.limit).toBe(100)
      expect(mockFirestoreQuery.limit).toHaveBeenCalledWith(100)
    })

    it('should handle invalid owner address format', async () => {
      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 0 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: [],
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({
        ownerAddress: 'invalid-address-format',
      })

      const result = (await listPools(request)) as ListPoolsResponse

      // Should still work but normalize the address
      expect(result.pools).toHaveLength(0)
      expect(result.totalCount).toBe(0)
      expect(mockFirestoreQuery.where).toHaveBeenCalledWith('poolOwner', '==', 'invalid-address-format')
    })

    it('should handle empty result set', async () => {
      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 0 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: [],
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({})

      const result = (await listPools(request)) as ListPoolsResponse

      expect(result.pools).toEqual([])
      expect(result.totalCount).toBe(0)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.hasNextPage).toBe(false)
      expect(result.hasPreviousPage).toBe(false)
    })

    it('should handle missing createdAt field gracefully', async () => {
      const mockPools = [
        {
          id: 'no-date-pool',
          data: () => ({
            poolId: 600,
            poolAddress: '0x' + '600'.padEnd(40, '0'),
            poolOwner: TestFixtures.TestData.addresses.poolOwners[0],
            name: 'No Date Pool',
            description: 'Pool without createdAt',
            maxLoanAmount: '1000000000000000000',
            interestRate: 500,
            loanDuration: 86400 * 7,
            chainId: 80002,
            createdBy: 'no-date-user',
            // createdAt: missing
            transactionHash: '0x' + 'nodate'.padEnd(58, '0'),
            isActive: true,
          }),
        },
      ]

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 1 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({})

      const result = (await listPools(request)) as ListPoolsResponse

      expect(result.pools).toHaveLength(1)
      expect(result.pools[0].createdAt).toBeInstanceOf(Date) // Should default to new Date()
    })
  })

  describe('Error Handling', () => {
    it('should handle Firestore count query failure', async () => {
      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockRejectedValue(new Error('Count query failed')),
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({})

      const result = await listPools(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Count query failed')
    })

    it('should handle Firestore data query failure', async () => {
      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 5 }),
        }),
      })

      mockFirestoreQuery.get.mockRejectedValue(new Error('Data query failed'))

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({})

      const result = await listPools(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Data query failed')
    })

    it('should handle Firestore permission denied errors', async () => {
      firebaseAdminMock.simulateFirestoreError('permission-denied')

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({})

      const result = await listPools(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('permission-denied')
    })

    it('should handle Firestore unavailable errors', async () => {
      firebaseAdminMock.simulateFirestoreError('unavailable')

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({})

      const result = await listPools(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('unavailable')
    })

    it('should handle malformed pool documents', async () => {
      const malformedPools = [
        {
          id: 'good-pool',
          data: () => ({
            poolId: 700,
            poolAddress: '0x' + '700'.padEnd(40, '0'),
            poolOwner: TestFixtures.TestData.addresses.poolOwners[0],
            name: 'Good Pool',
            description: 'This is a good pool',
            maxLoanAmount: '1000000000000000000',
            interestRate: 500,
            loanDuration: 86400 * 7,
            chainId: 80002,
            createdBy: 'good-user',
            createdAt: { toDate: () => new Date() },
            transactionHash: '0x' + 'good'.padEnd(60, '0'),
            isActive: true,
          }),
        },
        {
          id: 'bad-pool',
          data: () => ({
            // Missing required fields
            poolId: 'invalid-id', // Should be number
            // poolAddress: missing
            // poolOwner: missing
            name: null, // Invalid type
            description: undefined, // Missing
            maxLoanAmount: -1, // Invalid value
            interestRate: 'not-a-number', // Invalid type
            loanDuration: null, // Invalid type
            chainId: 80002,
            createdBy: 'bad-user',
            createdAt: 'invalid-date', // Invalid type
            transactionHash: 'not-a-hash', // Invalid format
            isActive: 'true', // Should be boolean
          }),
        },
      ]

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 2 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: malformedPools,
      })

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({})

      const result = (await listPools(request)) as ListPoolsResponse

      // Should handle gracefully and only return valid pools
      expect(result.pools).toHaveLength(2) // Both pools returned but bad one with defaults

      const goodPool = result.pools.find((p) => p.name === 'Good Pool')
      const badPool = result.pools.find((p) => p.poolId === 0) // Default value for invalid ID

      expect(goodPool).toBeTruthy()
      expect(badPool?.poolAddress).toBe('') // Default value for missing address
      expect(badPool?.poolOwner).toBe('') // Default value for missing owner
    })
  })

  describe('Performance Testing', () => {
    it('should meet performance benchmarks for pool listing', async () => {
      const benchmarkResult = await runBenchmark(
        'listPools-performance',
        async () => {
          const mockPools = Array.from({ length: 20 }, (_, i) => ({
            id: `perf-pool-${i}`,
            data: () => ({
              poolId: i + 800,
              poolAddress: `0x${(i + 800).toString().padEnd(40, '0')}`,
              poolOwner: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
              name: `Performance Pool ${i}`,
              description: `Performance test pool ${i}`,
              maxLoanAmount: (1000 + i).toString() + '000000000000000000',
              interestRate: 500 + i * 10,
              loanDuration: 86400 * (7 + i),
              chainId: 80002,
              createdBy: `perf-user-${i}`,
              createdAt: { toDate: () => new Date(Date.now() - i * 1000) },
              transactionHash: `0x${'perf' + i}${'0'.repeat(56)}`,
              isActive: true,
            }),
          }))

          mockFirestoreQuery.count.mockReturnValue({
            get: jest.fn().mockResolvedValue({
              data: () => ({ count: Math.floor(Math.random() * 1000) + 100 }),
            }),
          })

          mockFirestoreQuery.get.mockResolvedValue({
            docs: mockPools,
          })

          const request = testEnvironment.functionTester.createUnauthenticatedRequest({
            page: Math.floor(Math.random() * 5) + 1,
            limit: 20,
          })

          return await listPools(request)
        },
        50, // 50 iterations
        5 // 5 warmup runs
      )

      // Performance assertions
      expect(benchmarkResult.timing.mean).toBeLessThan(800) // Average under 800ms
      expect(benchmarkResult.timing.p95).toBeLessThan(1200) // 95th percentile under 1.2 seconds
      expect(benchmarkResult.memory.mean).toBeLessThan(25 * 1024 * 1024) // Average under 25MB

      console.log(`📊 Pool Listing Benchmark Results:`)
      console.log(`   Average Response Time: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
      console.log(`   95th Percentile: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
      console.log(`   Memory Usage: ${(benchmarkResult.memory.mean / (1024 * 1024)).toFixed(2)}MB`)
    })

    it('should not have memory leaks during repeated listings', async () => {
      const memoryLeakReport = await detectMemoryLeaks(
        'listPools-memory-leak',
        async () => {
          const mockPools = Array.from({ length: 10 }, (_, i) => ({
            id: `leak-pool-${i}`,
            data: () => ({
              poolId: i + 900,
              poolAddress: `0x${(i + 900).toString().padEnd(40, '0')}`,
              poolOwner: TestFixtures.TestData.addresses.poolOwners[0],
              name: `Leak Test Pool ${i}`,
              description: `Memory leak test pool ${i}`,
              maxLoanAmount: '1000000000000000000',
              interestRate: 500,
              loanDuration: 86400 * 7,
              chainId: 80002,
              createdBy: 'leak-user',
              createdAt: { toDate: () => new Date() },
              transactionHash: `0x${'leak' + i}${'0'.repeat(56)}`,
              isActive: true,
            }),
          }))

          mockFirestoreQuery.count.mockReturnValue({
            get: jest.fn().mockResolvedValue({
              data: () => ({ count: 100 }),
            }),
          })

          mockFirestoreQuery.get.mockResolvedValue({
            docs: mockPools,
          })

          const request = testEnvironment.functionTester.createUnauthenticatedRequest({})

          const result = await listPools(request)

          // Cleanup to simulate real usage
          MockFactory.resetAllMocks()
          testEnvironment = quickSetup.poolCreation()

          return result
        },
        100, // 100 iterations
        10 // GC every 10 iterations
      )

      expect(memoryLeakReport.hasLeak).toBe(false)
      console.log(`🔍 Memory Leak Check: ${memoryLeakReport.report}`)
    })

    it('should handle load testing with high concurrency', async () => {
      const performance = startPerformanceTest('concurrent-pool-listings', 'load-test')

      const mockPools = Array.from({ length: 15 }, (_, i) => ({
        id: `load-pool-${i}`,
        data: () => ({
          poolId: i + 1000,
          poolAddress: `0x${(i + 1000).toString().padEnd(40, '0')}`,
          poolOwner: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
          name: `Load Test Pool ${i}`,
          description: `Load test pool ${i}`,
          maxLoanAmount: '1000000000000000000',
          interestRate: 500,
          loanDuration: 86400 * 7,
          chainId: 80002,
          createdBy: 'load-user',
          createdAt: { toDate: () => new Date() },
          transactionHash: `0x${'load' + i}${'0'.repeat(56)}`,
          isActive: true,
        }),
      }))

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 500 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      // Create different request scenarios
      const requests = [
        testEnvironment.functionTester.createUnauthenticatedRequest({}), // Default
        testEnvironment.functionTester.createUnauthenticatedRequest({ page: 2 }), // Pagination
        testEnvironment.functionTester.createUnauthenticatedRequest({ limit: 50 }), // Large limit
        testEnvironment.functionTester.createUnauthenticatedRequest({ ownerAddress: TestFixtures.TestData.addresses.poolOwners[0] }), // Owner filter
        testEnvironment.functionTester.createUnauthenticatedRequest({ activeOnly: false }), // Include inactive
      ]

      // Execute concurrent requests
      const results = await Promise.all(requests.map((request) => listPools(request)))

      const metrics = performance.end()

      // Verify all requests succeeded
      results.forEach((result) => {
        expect(result.pools).toBeDefined()
        expect(Array.isArray(result.pools)).toBe(true)
      })

      // Performance validation
      expect(metrics.executionTime).toBeLessThan(5000) // Should complete in under 5 seconds
    })

    it('should handle large datasets efficiently', async () => {
      // Simulate querying a large dataset
      const largeCount = 10000
      const mockPools = Array.from({ length: 100 }, (_, i) => ({
        id: `large-pool-${i}`,
        data: () => ({
          poolId: i + 2000,
          poolAddress: `0x${(i + 2000).toString().padEnd(40, '0')}`,
          poolOwner: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
          name: `Large Dataset Pool ${i}`,
          description: `Pool from large dataset ${i}`,
          maxLoanAmount: '1000000000000000000',
          interestRate: 500,
          loanDuration: 86400 * 7,
          chainId: 80002,
          createdBy: 'large-user',
          createdAt: { toDate: () => new Date() },
          transactionHash: `0x${'large' + i}${'0'.repeat(55)}`,
          isActive: true,
        }),
      }))

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: largeCount }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      const performance = startPerformanceTest('large-dataset-query', 'performance')

      const request = testEnvironment.functionTester.createUnauthenticatedRequest({
        limit: 100,
      })

      const result = (await listPools(request)) as ListPoolsResponse

      const metrics = performance.end()

      expect(result.pools).toHaveLength(100)
      expect(result.totalCount).toBe(largeCount)
      expect(result.hasNextPage).toBe(true)

      // Should still be efficient with large dataset
      expect(metrics.executionTime).toBeLessThan(2000) // Under 2 seconds
    })
  })

  describe('Query Optimization', () => {
    it('should optimize query for different filter combinations', async () => {
      const mockPools = []

      mockFirestoreQuery.count.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          data: () => ({ count: 0 }),
        }),
      })

      mockFirestoreQuery.get.mockResolvedValue({
        docs: mockPools,
      })

      // Test all filters combined
      const request = testEnvironment.functionTester.createUnauthenticatedRequest({
        ownerAddress: TestFixtures.TestData.addresses.poolOwners[0],
        chainId: 137,
        activeOnly: true,
        page: 2,
        limit: 25,
      })

      await listPools(request)

      // Verify optimal query construction
      expect(mockCollection.where).toHaveBeenCalledWith('chainId', '==', 137)
      expect(mockFirestoreQuery.where).toHaveBeenCalledWith('poolOwner', '==', TestFixtures.TestData.addresses.poolOwners[0].toLowerCase())
      expect(mockFirestoreQuery.where).toHaveBeenCalledWith('isActive', '==', true)
      expect(mockFirestoreQuery.orderBy).toHaveBeenCalledWith('createdAt', 'desc')
      expect(mockFirestoreQuery.offset).toHaveBeenCalledWith(25) // (2-1) * 25
      expect(mockFirestoreQuery.limit).toHaveBeenCalledWith(25)
    })

    it('should handle index optimization for common query patterns', async () => {
      // Simulate different common query patterns that should use optimal indexes
      const testCases = [
        { chainId: 80002, activeOnly: true }, // Most common: chain + active
        { ownerAddress: TestFixtures.TestData.addresses.poolOwners[0], activeOnly: true }, // Owner + active
        { chainId: 137, ownerAddress: TestFixtures.TestData.addresses.poolOwners[1] }, // Chain + owner
        { chainId: 80002 }, // Chain only
      ]

      for (const testCase of testCases) {
        mockFirestoreQuery.count.mockReturnValue({
          get: jest.fn().mockResolvedValue({
            data: () => ({ count: 0 }),
          }),
        })

        mockFirestoreQuery.get.mockResolvedValue({
          docs: [],
        })

        const request = testEnvironment.functionTester.createUnauthenticatedRequest(testCase)

        const result = (await listPools(request)) as ListPoolsResponse

        expect(result.pools).toEqual([])

        // Reset mocks for next iteration
        jest.clearAllMocks()
        firebaseAdminMock.firestore.collection.mockReturnValue(mockCollection)
        mockCollection.where.mockReturnValue(mockFirestoreQuery)
        mockFirestoreQuery.where.mockReturnThis()
        mockFirestoreQuery.orderBy.mockReturnThis()
        mockFirestoreQuery.offset.mockReturnThis()
        mockFirestoreQuery.limit.mockReturnThis()
      }
    })
  })
})
