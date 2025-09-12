/**
 * Comprehensive Tests for Pool Status Function
 *
 * Tests all aspects of the poolStatus Cloud Function including:
 * - Pool creation transaction status tracking
 * - Firestore integration for cached status data
 * - Blockchain receipt validation and parsing
 * - Event parsing for pool creation confirmation
 * - Error handling for various failure scenarios
 * - Performance testing for status checking workflows
 * - Edge cases (missing transactions, reorganizations, etc.)
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { ethers } from 'ethers'
import { ContractMock, ethersMock, firebaseAdminMock, FunctionsMock, MockFactory, quickSetup, TestFixtures } from '../../__mocks__'
import { detectMemoryLeaks, performanceManager, runBenchmark, startPerformanceTest } from '../../__tests__/utils/PerformanceTestUtilities'
import { poolStatus, PoolStatusRequest, PoolStatusResponse } from './poolStatus'
import { HttpsError } from 'firebase-functions/v2/https'
import { AppError } from '../../utils/errorHandling'

describe('poolStatus Cloud Function', () => {
  let testEnvironment: any

  beforeAll(() => {
    performanceManager.clearAll()
  })

  beforeEach(() => {
    MockFactory.resetAllMocks()
    testEnvironment = quickSetup.poolCreation()

    // Setup environment variables
    process.env.POLYGON_AMOY_RPC_URL = 'https://rpc-amoy.polygon.technology'
    process.env.POOL_FACTORY_ADDRESS_AMOY = TestFixtures.TestData.addresses.poolFactoryAddress
  })

  afterEach(() => {
    delete process.env.POLYGON_AMOY_RPC_URL
    delete process.env.POOL_FACTORY_ADDRESS_AMOY

    MockFactory.resetAllMocks()
  })

  afterAll(() => {
    const report = performanceManager.generateReport()
    console.log('🎯 Pool Status Performance Report:')
    console.log(`   Total Tests: ${report.totalTests}`)
    console.log(`   Total Benchmarks: ${report.totalBenchmarks}`)
    console.log(`   Overall Average Execution Time: ${report.overallStats.averageExecutionTime.toFixed(2)}ms`)
  })

  describe('Happy Path Scenarios', () => {
    it('should return cached completed transaction status', async () => {
      const performance = startPerformanceTest('cached-status-lookup', 'happy-path')

      const txHash = '0x' + '1'.repeat(64)
      const poolId = 123
      const poolAddress = '0x' + '2'.repeat(40)

      // Mock completed transaction in Firestore
      const completedTxData = {
        transactionHash: txHash,
        poolId,
        poolAddress,
        blockNumber: 12345,
        gasUsed: '200000',
        createdAt: { toDate: () => new Date('2024-01-01T10:00:00Z') },
        completedAt: { toDate: () => new Date('2024-01-01T10:05:00Z') },
        status: 'completed',
        chainId: 80002,
      }

      const mockDoc = {
        exists: true,
        data: () => completedTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      const metrics = performance.end()

      expect(result.status).toBe('completed')
      expect(result.transactionHash).toBe(txHash)
      expect(result.poolId).toBe(poolId)
      expect(result.poolAddress).toBe(poolAddress)
      expect(result.blockNumber).toBe(12345)
      expect(result.gasUsed).toBe('200000')
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.completedAt).toBeInstanceOf(Date)

      // Should not call blockchain provider for cached data
      expect(ethersMock.provider.getTransactionReceipt).not.toHaveBeenCalled()

      // Performance validation
      expect(metrics.executionTime).toBeLessThan(500) // Should be very fast for cached data
    })

    it('should return cached failed transaction status', async () => {
      const txHash = '0x' + '3'.repeat(64)

      const failedTxData = {
        transactionHash: txHash,
        status: 'failed',
        error: 'Transaction reverted',
        createdAt: { toDate: () => new Date('2024-01-01T10:00:00Z') },
        chainId: 80002,
      }

      const mockDoc = {
        exists: true,
        data: () => failedTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      expect(result.status).toBe('failed')
      expect(result.transactionHash).toBe(txHash)
      expect(result.error).toBe('Transaction reverted')
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.poolId).toBeUndefined()
      expect(result.poolAddress).toBeUndefined()
    })

    it('should check blockchain for pending transaction and update to completed', async () => {
      const txHash = '0x' + '4'.repeat(64)
      const poolId = 456
      const poolAddress = '0x' + '5'.repeat(40)

      // Mock pending transaction in Firestore
      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date('2024-01-01T10:00:00Z') },
        poolParams: {
          poolOwner: TestFixtures.TestData.addresses.poolOwners[0],
          name: 'Test Pool',
          description: 'Test Description',
          maxLoanAmount: '1000000000000000000',
          interestRate: 500,
          loanDuration: 86400,
        },
        createdBy: 'test-uid',
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      const mockUpdateDoc = {
        update: jest.fn().mockResolvedValue(undefined),
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest
          .fn()
          .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(mockDoc) })
          .mockReturnValueOnce(mockUpdateDoc)
          .mockReturnValue({ set: jest.fn(), get: jest.fn().mockResolvedValue({ exists: false }) }),
      })

      // Mock successful transaction receipt
      const mockReceipt = {
        status: 1,
        blockNumber: 23456,
        gasUsed: ethers.parseUnits('180000', 'wei'),
        logs: [
          {
            topics: ['0x' + 'pool'.repeat(15) + '1'],
            data: '0x' + 'eventdata'.repeat(8),
          },
        ],
      }

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(mockReceipt)

      // Mock event parsing
      const mockPoolFactory = {
        interface: {
          parseLog: jest.fn().mockImplementation((log) => {
            if (log === mockReceipt.logs[0]) {
              return {
                name: 'PoolCreated',
                args: { poolId, poolAddress },
              }
            }
            return null
          }),
        },
      }

      // Setup contract mock to return the mockPoolFactory interface
      // Contract mock will be handled by centralized system

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      expect(result.status).toBe('completed')
      expect(result.transactionHash).toBe(txHash)
      expect(result.poolId).toBe(poolId)
      expect(result.poolAddress).toBe(poolAddress)
      expect(result.blockNumber).toBe(23456)
      expect(result.gasUsed).toBe('180000')

      // Verify Firestore was updated
      expect(mockUpdateDoc.update).toHaveBeenCalledWith({
        status: 'completed',
        poolId,
        poolAddress,
        blockNumber: 23456,
        gasUsed: '180000',
        completedAt: expect.any(Date),
      })

      // Verify pool document was created
      expect(firebaseAdminMock.firestore.collection).toHaveBeenCalledWith('pools')
    })

    it('should detect failed transaction on blockchain and update status', async () => {
      const txHash = '0x' + '6'.repeat(64)

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date('2024-01-01T10:00:00Z') },
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      const mockUpdateDoc = {
        update: jest.fn().mockResolvedValue(undefined),
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest
          .fn()
          .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(mockDoc) })
          .mockReturnValueOnce(mockUpdateDoc),
      })

      // Mock failed transaction receipt (status: 0)
      const mockReceipt = {
        status: 0, // Failed
        blockNumber: 34567,
        gasUsed: ethers.parseUnits('50000', 'wei'),
        logs: [],
      }

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(mockReceipt)

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      expect(result.status).toBe('failed')
      expect(result.transactionHash).toBe(txHash)
      expect(result.error).toBe('Transaction reverted')
      expect(result.blockNumber).toBe(34567)
      expect(result.gasUsed).toBe('50000')

      // Verify Firestore was updated with failure
      expect(mockUpdateDoc.update).toHaveBeenCalledWith({
        status: 'failed',
        blockNumber: 34567,
        gasUsed: '50000',
        error: 'Transaction reverted',
        completedAt: expect.any(Date),
      })
    })

    it('should return pending status when transaction not yet mined', async () => {
      const txHash = '0x' + '7'.repeat(64)

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date('2024-01-01T10:00:00Z') },
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      // Mock no receipt yet (still pending)
      ethersMock.provider.getTransactionReceipt.mockResolvedValue(null)

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      expect(result.status).toBe('pending')
      expect(result.transactionHash).toBe(txHash)
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.poolId).toBeUndefined()
      expect(result.poolAddress).toBeUndefined()
    })
  })

  describe('Parameter Validation', () => {
    it('should reject missing transaction hash', async () => {
      const request = FunctionsMock.createUnauthenticatedRequest({})

      const result = await poolStatus(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
      expect(result.message).toContain('Transaction hash is required')
    })

    it('should handle different transaction hash formats', async () => {
      const testCases = [
        '0x' + '8'.repeat(64), // Standard format
        '8'.repeat(64), // Without 0x prefix
        '0x' + '9'.repeat(64).toUpperCase(), // Uppercase
        '0x' + 'a'.repeat(64).toLowerCase(), // Lowercase
      ]

      for (const txHash of testCases) {
        const mockDoc = { exists: false }

        firebaseAdminMock.firestore.collection.mockReturnValue({
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockDoc),
          }),
        })

        const request = FunctionsMock.createUnauthenticatedRequest({
          transactionHash: txHash,
        })

        const result = (await poolStatus(request)) as PoolStatusResponse

        expect(result.status).toBe('not_found')
        expect(result.transactionHash).toBe(txHash.toLowerCase())
      }
    })

    it('should handle different chain IDs correctly', async () => {
      const txHash = '0x' + 'a'.repeat(64)

      // Test with Polygon Mainnet
      const mainnetTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 137, // Polygon Mainnet
        createdAt: { toDate: () => new Date() },
      }

      const mockDoc = {
        exists: true,
        data: () => mainnetTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      // Setup mainnet environment
      process.env.POLYGON_MAINNET_RPC_URL = 'https://polygon-mainnet.rpc.url'
      process.env.POOL_FACTORY_ADDRESS_POLYGON = '0x' + 'b'.repeat(40)

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(null) // Still pending

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
        chainId: 137,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      expect(result.status).toBe('pending')
      expect(result.transactionHash).toBe(txHash)

      // Cleanup
      delete process.env.POLYGON_MAINNET_RPC_URL
      delete process.env.POOL_FACTORY_ADDRESS_POLYGON
    })
  })

  describe('Error Handling', () => {
    it('should handle transaction not found in database', async () => {
      const txHash = '0x' + 'notfound'.repeat(6) + '12'

      const mockDoc = { exists: false }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      expect(result.status).toBe('not_found')
      expect(result.transactionHash).toBe(txHash)
    })

    it('should handle provider connection failures gracefully', async () => {
      const txHash = '0x' + 'b'.repeat(64)

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      // Mock provider error
      ethersMock.provider.getTransactionReceipt.mockRejectedValue(new Error('Network connection failed'))

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      // Should return pending status when can't check blockchain
      expect(result.status).toBe('pending')
      expect(result.transactionHash).toBe(txHash)
    })

    it('should handle missing environment configuration', async () => {
      delete process.env.POLYGON_AMOY_RPC_URL

      const txHash = '0x' + 'c'.repeat(64)

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = await poolStatus(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('RPC URL not configured')
    })

    it('should handle missing pool creation event in successful transaction', async () => {
      const txHash = '0x' + 'd'.repeat(64)

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      // Mock successful receipt but no pool creation event
      const mockReceipt = {
        status: 1,
        blockNumber: 45678,
        gasUsed: ethers.parseUnits('100000', 'wei'),
        logs: [], // No logs
      }

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(mockReceipt)

      const mockPoolFactory = {
        interface: {
          parseLog: jest.fn().mockReturnValue(null), // No parseable events
        },
      }

      // Setup contract mock to return the mockPoolFactory interface
      // Contract mock will be handled by centralized system

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = await poolStatus(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Pool creation event not found')
    })

    it('should handle Firestore operation failures', async () => {
      const txHash = '0x' + 'e'.repeat(64)

      // Mock Firestore error
      firebaseAdminMock.simulateFirestoreError('unavailable')

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = await poolStatus(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('unavailable')
    })

    it('should handle contract address not configured', async () => {
      delete process.env.POOL_FACTORY_ADDRESS_AMOY

      const txHash = '0x' + 'f'.repeat(64)

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      ethersMock.provider.getTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [],
      })

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = await poolStatus(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('PoolFactory address not configured')
    })
  })

  describe('Edge Cases', () => {
    it('should handle blockchain reorganization scenarios', async () => {
      const txHash = '0x' + '1234'.repeat(16)

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      // Mock receipt that indicates reorganization
      ethersMock.provider.getTransactionReceipt.mockResolvedValue(null)

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      // Should still return pending if receipt not found
      expect(result.status).toBe('pending')
      expect(result.transactionHash).toBe(txHash)
    })

    it('should handle very old pending transactions', async () => {
      const txHash = '0x' + 'old'.repeat(16)

      // Transaction from 30 days ago
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 30)

      const oldTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => oldDate },
      }

      const mockDoc = {
        exists: true,
        data: () => oldTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(null)

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      expect(result.status).toBe('pending')
      expect(result.createdAt).toEqual(oldDate)
    })

    it('should handle concurrent status checks for same transaction', async () => {
      const performance = startPerformanceTest('concurrent-status-checks', 'concurrency')

      const txHash = '0x' + 'concurrent'.repeat(6) + '123'
      const poolId = 999
      const poolAddress = '0x' + '999'.repeat(13) + '999'

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
        poolParams: TestFixtures.TestData.pools.basic,
        createdBy: 'test-uid',
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      const mockUpdateDoc = {
        update: jest.fn().mockResolvedValue(undefined),
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest
          .fn()
          .mockReturnValue({ get: jest.fn().mockResolvedValue(mockDoc) })
          .mockReturnValue(mockUpdateDoc)
          .mockReturnValue({ set: jest.fn(), get: jest.fn().mockResolvedValue({ exists: false }) }),
      })

      const mockReceipt = {
        status: 1,
        blockNumber: 56789,
        gasUsed: ethers.parseUnits('150000', 'wei'),
        logs: [{ topics: [], data: '0x' }],
      }

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(mockReceipt)

      const mockPoolFactory = {
        interface: {
          parseLog: jest.fn().mockReturnValue({
            name: 'PoolCreated',
            args: { poolId, poolAddress },
          }),
        },
      }

      // Setup contract mock to return the mockPoolFactory interface
      // Contract mock will be handled by centralized system

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      // Execute concurrent requests
      const results = await Promise.all([poolStatus(request), poolStatus(request), poolStatus(request)])

      const metrics = performance.end()

      // All should return same result
      results.forEach((result) => {
        expect(result.status).toBe('completed')
        expect(result.poolId).toBe(poolId)
        expect(result.poolAddress).toBe(poolAddress)
      })

      // Performance validation
      expect(metrics.executionTime).toBeLessThan(5000) // Should complete in under 5 seconds
    })

    it('should handle malformed transaction receipts', async () => {
      const txHash = '0x' + 'malformed'.repeat(7) + '1'

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      // Mock malformed receipt
      const malformedReceipt = {
        status: 1,
        blockNumber: 'invalid', // Should be number
        gasUsed: 'also-invalid', // Should be BigInt
        logs: 'not-an-array', // Should be array
      }

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(malformedReceipt)

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = await poolStatus(request)

      // Should handle gracefully and return error
      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
    })
  })

  describe('Performance Testing', () => {
    it('should meet performance benchmarks for status checking', async () => {
      const benchmarkResult = await runBenchmark(
        'poolStatus-performance',
        async () => {
          const txHash = '0x' + Date.now().toString(16).padEnd(64, '0')

          const completedTxData = {
            transactionHash: txHash,
            status: 'completed',
            poolId: Math.floor(Math.random() * 1000),
            poolAddress:
              '0x' +
              Math.floor(Math.random() * 1000)
                .toString(16)
                .padEnd(40, '0'),
            blockNumber: Math.floor(Math.random() * 1000000),
            gasUsed: '200000',
            createdAt: { toDate: () => new Date() },
            completedAt: { toDate: () => new Date() },
            chainId: 80002,
          }

          const mockDoc = {
            exists: true,
            data: () => completedTxData,
          }

          firebaseAdminMock.firestore.collection.mockReturnValue({
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(mockDoc),
            }),
          })

          const request = FunctionsMock.createUnauthenticatedRequest({
            transactionHash: txHash,
          })

          return await poolStatus(request)
        },
        50, // 50 iterations
        5 // 5 warmup runs
      )

      // Performance assertions
      expect(benchmarkResult.timing.mean).toBeLessThan(300) // Average under 300ms
      expect(benchmarkResult.timing.p95).toBeLessThan(500) // 95th percentile under 500ms
      expect(benchmarkResult.memory.mean).toBeLessThan(20 * 1024 * 1024) // Average under 20MB

      console.log(`📊 Pool Status Benchmark Results:`)
      console.log(`   Average Response Time: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
      console.log(`   95th Percentile: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
      console.log(`   Memory Usage: ${(benchmarkResult.memory.mean / (1024 * 1024)).toFixed(2)}MB`)
    })

    it('should not have memory leaks during repeated status checks', async () => {
      const memoryLeakReport = await detectMemoryLeaks(
        'poolStatus-memory-leak',
        async () => {
          const txHash = '0x' + Date.now().toString(16).padEnd(64, '0')

          const completedTxData = {
            transactionHash: txHash,
            status: 'completed',
            poolId: Math.floor(Math.random() * 1000),
            poolAddress:
              '0x' +
              Math.floor(Math.random() * 1000)
                .toString(16)
                .padEnd(40, '0'),
            blockNumber: Math.floor(Math.random() * 1000000),
            gasUsed: '200000',
            createdAt: { toDate: () => new Date() },
            completedAt: { toDate: () => new Date() },
            chainId: 80002,
          }

          const mockDoc = {
            exists: true,
            data: () => completedTxData,
          }

          firebaseAdminMock.firestore.collection.mockReturnValue({
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(mockDoc),
            }),
          })

          const request = FunctionsMock.createUnauthenticatedRequest({
            transactionHash: txHash,
          })

          const result = await poolStatus(request)

          // Cleanup
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

    it('should handle high frequency status polling efficiently', async () => {
      const performance = startPerformanceTest('high-frequency-polling', 'load-test')

      const txHash = '0x' + 'polling'.repeat(8) + '123'

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(mockDoc),
        }),
      })

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(null) // Still pending

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      // Simulate high frequency polling (20 requests)
      const promises = Array.from({ length: 20 }, () => poolStatus(request))
      const results = await Promise.all(promises)

      const metrics = performance.end()

      // All should return pending
      results.forEach((result) => {
        expect(result.status).toBe('pending')
      })

      // Should handle efficiently
      expect(metrics.executionTime).toBeLessThan(3000) // Under 3 seconds for 20 requests
    })
  })

  describe('Integration Testing', () => {
    it('should properly integrate with different pool factory contract versions', async () => {
      const txHash = '0x' + 'integration'.repeat(6) + '1'
      const poolId = 777
      const poolAddress = '0x' + '777'.repeat(13) + '777'

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
        poolParams: TestFixtures.TestData.pools.basic,
        createdBy: 'test-uid',
      }

      const mockDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      const mockUpdateDoc = {
        update: jest.fn().mockResolvedValue(undefined),
      }

      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest
          .fn()
          .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(mockDoc) })
          .mockReturnValueOnce(mockUpdateDoc)
          .mockReturnValue({ set: jest.fn(), get: jest.fn().mockResolvedValue({ exists: false }) }),
      })

      const mockReceipt = {
        status: 1,
        blockNumber: 67890,
        gasUsed: ethers.parseUnits('220000', 'wei'),
        logs: [
          {
            topics: [
              '0xpool_created_signature', // Event signature
              ethers.zeroPadValue(ethers.toBeHex(poolId), 32), // Pool ID
              ethers.zeroPadValue(poolAddress, 32), // Pool address
            ],
            data: ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'string', 'uint256', 'uint256', 'uint256'],
              [
                pendingTxData.poolParams.poolOwner,
                pendingTxData.poolParams.name,
                pendingTxData.poolParams.maxLoanAmount,
                pendingTxData.poolParams.interestRate,
                pendingTxData.poolParams.loanDuration,
              ]
            ),
          },
        ],
      }

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(mockReceipt)

      const mockPoolFactory = {
        interface: {
          parseLog: jest.fn().mockImplementation((log) => {
            if (log === mockReceipt.logs[0]) {
              return {
                name: 'PoolCreated',
                args: {
                  poolId,
                  poolAddress,
                  poolOwner: pendingTxData.poolParams.poolOwner,
                  name: pendingTxData.poolParams.name,
                  maxLoanAmount: pendingTxData.poolParams.maxLoanAmount,
                  interestRate: pendingTxData.poolParams.interestRate,
                  loanDuration: pendingTxData.poolParams.loanDuration,
                },
              }
            }
            return null
          }),
        },
      }

      // Setup contract mock to return the mockPoolFactory interface
      // Contract mock will be handled by centralized system

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      expect(result.status).toBe('completed')
      expect(result.poolId).toBe(poolId)
      expect(result.poolAddress).toBe(poolAddress)

      // Verify comprehensive event parsing
      expect(mockPoolFactory.interface.parseLog).toHaveBeenCalledWith(mockReceipt.logs[0])
    })

    it('should handle pool document already exists scenario', async () => {
      const txHash = '0x' + 'existing'.repeat(8) + '2'
      const poolId = 888
      const poolAddress = '0x' + '888'.repeat(13) + '888'

      const pendingTxData = {
        transactionHash: txHash,
        status: 'pending',
        chainId: 80002,
        createdAt: { toDate: () => new Date() },
        poolParams: TestFixtures.TestData.pools.basic,
        createdBy: 'test-uid',
      }

      const mockTxDoc = {
        exists: true,
        data: () => pendingTxData,
      }

      const mockPoolDoc = {
        exists: true, // Pool already exists
      }

      const mockUpdateDoc = {
        update: jest.fn().mockResolvedValue(undefined),
      }

      firebaseAdminMock.firestore.collection.mockImplementation((collection) => {
        if (collection === 'pool_creation_transactions') {
          return {
            doc: jest
              .fn()
              .mockReturnValueOnce({ get: jest.fn().mockResolvedValue(mockTxDoc) })
              .mockReturnValueOnce(mockUpdateDoc),
          }
        } else if (collection === 'pools') {
          return {
            doc: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(mockPoolDoc),
              set: jest.fn(), // Should not be called if exists
            }),
          }
        }
        return { doc: jest.fn() }
      })

      const mockReceipt = {
        status: 1,
        blockNumber: 78901,
        gasUsed: ethers.parseUnits('190000', 'wei'),
        logs: [{}],
      }

      ethersMock.provider.getTransactionReceipt.mockResolvedValue(mockReceipt)

      const mockPoolFactory = {
        interface: {
          parseLog: jest.fn().mockReturnValue({
            name: 'PoolCreated',
            args: { poolId, poolAddress },
          }),
        },
      }

      // Setup contract mock to return the mockPoolFactory interface
      // Contract mock will be handled by centralized system

      const request = FunctionsMock.createUnauthenticatedRequest({
        transactionHash: txHash,
      })

      const result = (await poolStatus(request)) as PoolStatusResponse

      expect(result.status).toBe('completed')
      expect(result.poolId).toBe(poolId)
      expect(result.poolAddress).toBe(poolAddress)

      // Transaction should be updated
      expect(mockUpdateDoc.update).toHaveBeenCalled()
    })
  })
})
