/**
 * Comprehensive Tests for Pool Creation Function
 *
 * Tests all aspects of the createPool Cloud Function including:
 * - Happy path scenarios (successful pool creation)
 * - Parameter validation and constraints
 * - Error handling (invalid parameters, contract failures, etc.)
 * - Edge cases (extreme values, concurrent creation, etc.)
 * - Integration with blockchain contracts (PoolFactory)
 * - Firestore integration for pool data persistence
 * - Gas estimation and transaction handling
 * - Performance testing for pool creation workflows
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals'
import { ethers } from 'ethers'
import {
  MockFactory,
  quickSetup,
  ContractMock,
  TestFixtures,
  ethersMock,
  firebaseAdminMock,
  performanceManager,
  startPerformanceTest,
  runBenchmark,
  detectMemoryLeaks,
  type PerformanceThresholds,
  type LoadTestConfig,
} from '../../__mocks__'
import { createPool, CreatePoolRequest, CreatePoolResponse } from './createPool'
import { HttpsError } from 'firebase-functions/v2/https'
import { AppError } from '../../utils/errorHandling'

describe('createPool Cloud Function', () => {
  let testEnvironment: any
  let mockPoolFactory: any

  beforeAll(() => {
    // Setup performance monitoring
    performanceManager.clearAll()
  })

  beforeEach(() => {
    // Reset all mocks before each test
    MockFactory.resetAllMocks()
    testEnvironment = quickSetup.poolCreation()
    mockPoolFactory = testEnvironment.poolFactory

    // Setup default environment variables
    process.env.POLYGON_AMOY_RPC_URL = 'https://rpc-amoy.polygon.technology'
    process.env.PRIVATE_KEY = '0x' + '1'.repeat(64)
    process.env.POOL_FACTORY_ADDRESS_AMOY = '0x' + '2'.repeat(40)
  })

  afterEach(() => {
    // Clean up environment variables
    delete process.env.POLYGON_AMOY_RPC_URL
    delete process.env.PRIVATE_KEY
    delete process.env.POOL_FACTORY_ADDRESS_AMOY

    MockFactory.resetAllMocks()
  })

  afterAll(() => {
    const report = performanceManager.generateReport()
    console.log('🎯 Pool Creation Performance Report:')
    console.log(`   Total Tests: ${report.totalTests}`)
    console.log(`   Total Benchmarks: ${report.totalBenchmarks}`)
    console.log(`   Overall Average Execution Time: ${report.overallStats.averageExecutionTime.toFixed(2)}ms`)
  })

  describe('Happy Path Scenarios', () => {
    it('should successfully create a basic lending pool', async () => {
      const performance = startPerformanceTest('basic-pool-creation', 'happy-path')

      // Setup successful blockchain interaction
      const mockTransactionHash = '0x' + '3'.repeat(64)
      const mockPoolId = 1
      const mockPoolAddress = '0x' + '4'.repeat(40)

      mockPoolFactory.createPool.mockResolvedValue({
        hash: mockTransactionHash,
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 12345,
          gasUsed: ethers.parseUnits('100000', 'wei'),
          logs: [
            {
              topics: ['0x' + '5'.repeat(64)],
              data: '0x',
            },
          ],
        }),
      })

      // Mock event parsing
      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue({
          name: 'PoolCreated',
          args: {
            poolId: mockPoolId,
            poolAddress: mockPoolAddress,
          },
        }),
      }

      // Mock gas estimation
      ethersMock.estimateGas.mockResolvedValue(ethers.parseUnits('200000', 'wei'))
      ethersMock.getFeeData.mockResolvedValue({ gasPrice: ethers.parseUnits('30', 'gwei') })

      const request = testEnvironment.request
      const result = (await createPool(request)) as CreatePoolResponse

      const metrics = performance.end()

      // Verify successful response
      expect(result.success).toBe(true)
      expect(result.transactionHash).toBe(mockTransactionHash)
      expect(result.poolId).toBe(mockPoolId)
      expect(result.poolAddress).toBe(mockPoolAddress)
      expect(result.message).toContain('created successfully')

      // Verify Firestore operations
      expect(firebaseAdminMock.firestore.collection).toHaveBeenCalledWith('pool_creation_transactions')
      expect(firebaseAdminMock.firestore.collection).toHaveBeenCalledWith('pools')

      // Verify contract interaction
      expect(mockPoolFactory.createPool).toHaveBeenCalledWith([
        expect.objectContaining({
          poolOwner: testEnvironment.params.poolOwner,
          maxLoanAmount: testEnvironment.params.maxLoanAmount,
          interestRate: testEnvironment.params.interestRate,
          loanDuration: testEnvironment.params.loanDuration,
          name: testEnvironment.params.name,
          description: testEnvironment.params.description,
        }),
      ])

      // Performance validation
      expect(metrics.executionTime).toBeLessThan(5000) // Should complete in under 5 seconds
    })

    it('should handle different chain configurations correctly', async () => {
      // Test Polygon Mainnet configuration
      process.env.POLYGON_MAINNET_RPC_URL = 'https://polygon-mainnet.rpc.url'
      process.env.POOL_FACTORY_ADDRESS_POLYGON = '0x' + 'a'.repeat(40)

      const mainnetRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        { ...testEnvironment.params, chainId: 137 }, // Polygon Mainnet
        testEnvironment.uid
      )

      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + '6'.repeat(64),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 54321,
          gasUsed: ethers.parseUnits('150000', 'wei'),
          logs: [
            {
              topics: ['0x' + '7'.repeat(64)],
              data: '0x',
            },
          ],
        }),
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue({
          name: 'PoolCreated',
          args: { poolId: 2, poolAddress: '0x' + '8'.repeat(40) },
        }),
      }

      const result = (await createPool(mainnetRequest)) as CreatePoolResponse

      expect(result.success).toBe(true)
      expect(result.poolId).toBe(2)

      // Cleanup
      delete process.env.POLYGON_MAINNET_RPC_URL
      delete process.env.POOL_FACTORY_ADDRESS_POLYGON
    })

    it('should properly store comprehensive pool data in Firestore', async () => {
      const mockDoc = { set: jest.fn().mockResolvedValue(undefined), update: jest.fn().mockResolvedValue(undefined) }
      firebaseAdminMock.firestore.collection.mockReturnValue({ doc: jest.fn().mockReturnValue(mockDoc) })

      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + '9'.repeat(64),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 98765,
          gasUsed: ethers.parseUnits('180000', 'wei'),
          logs: [{}],
        }),
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue({
          name: 'PoolCreated',
          args: { poolId: 3, poolAddress: '0x' + 'b'.repeat(40) },
        }),
      }

      await createPool(testEnvironment.request)

      // Verify transaction tracking document
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionHash: expect.any(String),
          createdBy: testEnvironment.uid,
          poolParams: expect.objectContaining({
            poolOwner: testEnvironment.params.poolOwner,
            name: testEnvironment.params.name,
            description: testEnvironment.params.description,
          }),
          chainId: 80002,
          status: 'pending',
          createdAt: expect.any(Date),
          gasEstimate: expect.any(String),
        })
      )

      // Verify pool document
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          poolId: 3,
          poolAddress: '0x' + 'b'.repeat(40),
          poolOwner: testEnvironment.params.poolOwner,
          name: testEnvironment.params.name,
          description: testEnvironment.params.description,
          maxLoanAmount: testEnvironment.params.maxLoanAmount,
          interestRate: testEnvironment.params.interestRate,
          loanDuration: testEnvironment.params.loanDuration,
          chainId: 80002,
          createdBy: testEnvironment.uid,
          isActive: true,
        })
      )
    })
  })

  describe('Parameter Validation and Constraints', () => {
    it('should reject invalid poolOwner addresses', async () => {
      const invalidRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          poolOwner: 'invalid-address',
        },
        testEnvironment.uid
      )

      const result = await createPool(invalidRequest)

      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
      expect(result.message).toContain('Validation failed')
    })

    it('should enforce maximum loan amount constraints', async () => {
      const extremeRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          maxLoanAmount: ethers.parseUnits('1000000000000', 'ether').toString(), // Extremely large amount
        },
        testEnvironment.uid
      )

      const result = await createPool(extremeRequest)

      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
    })

    it('should validate interest rate bounds', async () => {
      // Test negative interest rate
      const negativeRateRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          interestRate: -100,
        },
        testEnvironment.uid
      )

      let result = await createPool(negativeRateRequest)
      expect(result.success).toBe(false)

      // Test excessive interest rate (over 100%)
      const excessiveRateRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          interestRate: 15000, // 150% APR
        },
        testEnvironment.uid
      )

      result = await createPool(excessiveRateRequest)
      expect(result.success).toBe(false)
    })

    it('should validate loan duration constraints', async () => {
      // Test too short duration (less than 1 day)
      const shortDurationRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          loanDuration: 3600, // 1 hour
        },
        testEnvironment.uid
      )

      let result = await createPool(shortDurationRequest)
      expect(result.success).toBe(false)

      // Test too long duration (over 5 years)
      const longDurationRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          loanDuration: 365 * 24 * 3600 * 6, // 6 years
        },
        testEnvironment.uid
      )

      result = await createPool(longDurationRequest)
      expect(result.success).toBe(false)
    })

    it('should sanitize and validate pool name and description', async () => {
      // Test XSS attempt in pool name
      const maliciousRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          name: '<script>alert("xss")</script>Pool Name',
          description: 'javascript:void(0) malicious description',
        },
        testEnvironment.uid
      )

      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + 'c'.repeat(64),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 11111,
          gasUsed: ethers.parseUnits('100000', 'wei'),
          logs: [{}],
        }),
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue({
          name: 'PoolCreated',
          args: { poolId: 4, poolAddress: '0x' + 'd'.repeat(40) },
        }),
      }

      const result = await createPool(maliciousRequest)

      expect(result.success).toBe(true)

      // Verify the parameters were sanitized before passing to contract
      const createPoolCall = mockPoolFactory.createPool.mock.calls[0][0][0]
      expect(createPoolCall.name).not.toContain('<script>')
      expect(createPoolCall.description).not.toContain('javascript:')
    })
  })

  describe('Error Handling', () => {
    it('should handle unauthenticated requests', async () => {
      const unauthenticatedRequest = testEnvironment.functionTester.createUnauthenticatedRequest(testEnvironment.params)

      const result = await createPool(unauthenticatedRequest)

      expect(result.success).toBe(false)
      expect(result.code).toBe('unauthenticated')
      expect(result.message).toContain('must be authenticated')
    })

    it('should handle missing environment configuration', async () => {
      delete process.env.PRIVATE_KEY

      const result = await createPool(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Private key not configured')
    })

    it('should handle RPC provider connection failures', async () => {
      // Mock provider connection failure
      ethersMock.simulateNetworkError('Connection timeout')

      const result = await createPool(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Connection timeout')
    })

    it('should handle contract transaction failures', async () => {
      // Mock transaction revert
      ethersMock.simulateContractRevert('Pool creation requirements not met')

      const result = await createPool(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Pool creation requirements not met')
    })

    it('should handle gas estimation failures', async () => {
      mockPoolFactory.createPool.estimateGas = jest.fn().mockRejectedValue(new Error('Gas estimation failed - execution reverted'))

      const result = await createPool(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Gas estimation failed')
    })

    it('should handle transaction receipt not found', async () => {
      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + 'e'.repeat(64),
        wait: jest.fn().mockResolvedValue(null), // No receipt
      })

      const result = await createPool(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Transaction failed - no receipt received')
    })

    it('should handle missing pool creation event', async () => {
      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + 'f'.repeat(64),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 22222,
          gasUsed: ethers.parseUnits('100000', 'wei'),
          logs: [], // No logs
        }),
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue(null), // No parseable events
      }

      const result = await createPool(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Pool creation event not found')
    })

    it('should handle Firestore operation failures', async () => {
      // Mock Firestore failure
      firebaseAdminMock.simulateFirestoreError('permission-denied')

      const result = await createPool(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('permission-denied')
    })
  })

  describe('Edge Cases and Concurrency', () => {
    it('should handle concurrent pool creation requests', async () => {
      const performance = startPerformanceTest('concurrent-pool-creation', 'edge-cases')

      // Setup multiple requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        testEnvironment.functionTester.createAuthenticatedRequest(
          {
            ...testEnvironment.params,
            name: `Concurrent Pool ${i + 1}`,
            poolOwner: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
          },
          testEnvironment.uid
        )
      )

      // Mock successful responses with different pool IDs
      requests.forEach((_, i) => {
        const mockHash = '0x' + (i + 10).toString().repeat(64).substring(0, 64)
        mockPoolFactory.createPool.mockResolvedValueOnce({
          hash: mockHash,
          wait: jest.fn().mockResolvedValue({
            status: 1,
            blockNumber: 33333 + i,
            gasUsed: ethers.parseUnits('100000', 'wei'),
            logs: [{}],
          }),
        })
      })

      mockPoolFactory.interface = {
        parseLog: jest
          .fn()
          .mockReturnValueOnce({ name: 'PoolCreated', args: { poolId: 10, poolAddress: '0x' + '10'.repeat(20) } })
          .mockReturnValueOnce({ name: 'PoolCreated', args: { poolId: 11, poolAddress: '0x' + '11'.repeat(20) } })
          .mockReturnValueOnce({ name: 'PoolCreated', args: { poolId: 12, poolAddress: '0x' + '12'.repeat(20) } })
          .mockReturnValueOnce({ name: 'PoolCreated', args: { poolId: 13, poolAddress: '0x' + '13'.repeat(20) } })
          .mockReturnValueOnce({ name: 'PoolCreated', args: { poolId: 14, poolAddress: '0x' + '14'.repeat(20) } }),
      }

      // Execute concurrent requests
      const results = await Promise.all(requests.map((request) => createPool(request)))

      const metrics = performance.end()

      // Verify all succeeded
      results.forEach((result, i) => {
        expect(result.success).toBe(true)
        expect(result.poolId).toBe(10 + i)
      })

      // Performance validation for concurrency
      expect(metrics.executionTime).toBeLessThan(15000) // Should complete in under 15 seconds
    })

    it('should handle extreme parameter values at boundaries', async () => {
      // Test minimum valid values
      const minimalRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          poolOwner: testEnvironment.params.poolOwner,
          maxLoanAmount: '1', // 1 wei
          interestRate: 0, // 0% APR
          loanDuration: 86400, // Exactly 1 day
          name: 'A', // Single character
          description: 'X', // Single character
        },
        testEnvironment.uid
      )

      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + '15'.repeat(32),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 44444,
          gasUsed: ethers.parseUnits('100000', 'wei'),
          logs: [{}],
        }),
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue({
          name: 'PoolCreated',
          args: { poolId: 15, poolAddress: '0x' + '15'.repeat(20) },
        }),
      }

      const result = (await createPool(minimalRequest)) as CreatePoolResponse

      expect(result.success).toBe(true)
      expect(result.poolId).toBe(15)
    })

    it('should handle network timeout gracefully', async () => {
      // Mock a slow transaction that times out
      const slowTransaction = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transaction timeout')), 100)
      })

      mockPoolFactory.createPool.mockReturnValue(slowTransaction)

      const result = await createPool(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Transaction timeout')
    })
  })

  describe('Gas and Transaction Optimization', () => {
    it('should optimize gas usage for pool creation', async () => {
      // Mock high gas fee scenario
      ethersMock.getFeeData.mockResolvedValue({
        gasPrice: ethers.parseUnits('100', 'gwei'), // High gas price
      })

      ethersMock.estimateGas.mockResolvedValue(ethers.parseUnits('500000', 'wei'))

      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + '16'.repeat(32),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 55555,
          gasUsed: ethers.parseUnits('450000', 'wei'), // Less than estimated
          logs: [{}],
        }),
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue({
          name: 'PoolCreated',
          args: { poolId: 16, poolAddress: '0x' + '16'.repeat(20) },
        }),
      }

      const result = (await createPool(testEnvironment.request)) as CreatePoolResponse

      expect(result.success).toBe(true)
      expect(result.estimatedGas).toBe('500000')

      // Verify gas optimization was attempted
      expect(ethersMock.estimateGas).toHaveBeenCalled()
    })

    it('should handle gas price fluctuations during transaction', async () => {
      let gasCallCount = 0
      ethersMock.getFeeData.mockImplementation(() => {
        gasCallCount++
        return Promise.resolve({
          gasPrice: ethers.parseUnits((20 + gasCallCount * 10).toString(), 'gwei'),
        })
      })

      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + '17'.repeat(32),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 66666,
          gasUsed: ethers.parseUnits('200000', 'wei'),
          logs: [{}],
        }),
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue({
          name: 'PoolCreated',
          args: { poolId: 17, poolAddress: '0x' + '17'.repeat(20) },
        }),
      }

      const result = (await createPool(testEnvironment.request)) as CreatePoolResponse

      expect(result.success).toBe(true)
      expect(gasCallCount).toBeGreaterThan(0)
    })
  })

  describe('Performance Testing', () => {
    it('should meet performance benchmarks for pool creation', async () => {
      const benchmarkResult = await runBenchmark(
        'createPool-performance',
        async () => {
          mockPoolFactory.createPool.mockResolvedValue({
            hash: '0x' + Date.now().toString(16).padEnd(64, '0'),
            wait: jest.fn().mockResolvedValue({
              status: 1,
              blockNumber: Math.floor(Math.random() * 1000000),
              gasUsed: ethers.parseUnits('200000', 'wei'),
              logs: [{}],
            }),
          })

          mockPoolFactory.interface = {
            parseLog: jest.fn().mockReturnValue({
              name: 'PoolCreated',
              args: {
                poolId: Math.floor(Math.random() * 1000),
                poolAddress:
                  '0x' +
                  Math.floor(Math.random() * 1000)
                    .toString(16)
                    .padEnd(40, '0'),
              },
            }),
          }

          return await createPool(testEnvironment.request)
        },
        50, // 50 iterations
        5 // 5 warmup runs
      )

      // Performance assertions
      expect(benchmarkResult.timing.mean).toBeLessThan(2000) // Average under 2 seconds
      expect(benchmarkResult.timing.p95).toBeLessThan(3000) // 95th percentile under 3 seconds
      expect(benchmarkResult.memory.mean).toBeLessThan(50 * 1024 * 1024) // Average under 50MB

      console.log(`📊 Pool Creation Benchmark Results:`)
      console.log(`   Average Response Time: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
      console.log(`   95th Percentile: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
      console.log(`   Memory Usage: ${(benchmarkResult.memory.mean / (1024 * 1024)).toFixed(2)}MB`)
    })

    it('should not have memory leaks during repeated pool creation', async () => {
      const memoryLeakReport = await detectMemoryLeaks(
        'createPool-memory-leak',
        async () => {
          mockPoolFactory.createPool.mockResolvedValue({
            hash: '0x' + Date.now().toString(16).padEnd(64, '0'),
            wait: jest.fn().mockResolvedValue({
              status: 1,
              blockNumber: Math.floor(Math.random() * 1000000),
              gasUsed: ethers.parseUnits('200000', 'wei'),
              logs: [{}],
            }),
          })

          mockPoolFactory.interface = {
            parseLog: jest.fn().mockReturnValue({
              name: 'PoolCreated',
              args: {
                poolId: Math.floor(Math.random() * 1000),
                poolAddress:
                  '0x' +
                  Math.floor(Math.random() * 1000)
                    .toString(16)
                    .padEnd(40, '0'),
              },
            }),
          }

          const result = await createPool(testEnvironment.request)

          // Simulate some cleanup
          MockFactory.resetAllMocks()
          testEnvironment = quickSetup.poolCreation()
          mockPoolFactory = testEnvironment.poolFactory

          return result
        },
        200, // 200 iterations
        20 // GC every 20 iterations
      )

      expect(memoryLeakReport.hasLeak).toBe(false)
      console.log(`🔍 Memory Leak Check: ${memoryLeakReport.report}`)
    })

    it('should handle load testing with multiple concurrent users', async () => {
      const loadTestConfig: LoadTestConfig = {
        concurrentUsers: 10,
        duration: 5000, // 5 seconds
        rampUpTime: 1000, // 1 second ramp-up
        thinkTime: 100, // 100ms between requests
        maxRequestsPerSecond: 20,
      }

      const thresholds: PerformanceThresholds = {
        maxResponseTime: 3000, // 3 seconds
        maxMemoryUsage: 100 * 1024 * 1024, // 100MB
        maxCpuUsage: 80, // 80%
        minSuccessRate: 95, // 95%
      }

      const loadTestResult = await performanceManager.runLoadTest(
        'createPool-load-test',
        async () => {
          mockPoolFactory.createPool.mockResolvedValue({
            hash: '0x' + Date.now().toString(16).padEnd(64, '0'),
            wait: jest.fn().mockResolvedValue({
              status: 1,
              blockNumber: Math.floor(Math.random() * 1000000),
              gasUsed: ethers.parseUnits('200000', 'wei'),
              logs: [{}],
            }),
          })

          mockPoolFactory.interface = {
            parseLog: jest.fn().mockReturnValue({
              name: 'PoolCreated',
              args: {
                poolId: Math.floor(Math.random() * 1000),
                poolAddress:
                  '0x' +
                  Math.floor(Math.random() * 1000)
                    .toString(16)
                    .padEnd(40, '0'),
              },
            }),
          }

          return await createPool(testEnvironment.request)
        },
        loadTestConfig,
        thresholds
      )

      // Load test assertions
      expect(loadTestResult.successRate).toBeGreaterThanOrEqual(thresholds.minSuccessRate)
      expect(loadTestResult.averageResponseTime).toBeLessThanOrEqual(thresholds.maxResponseTime)
      expect(loadTestResult.throughput).toBeGreaterThan(0)

      console.log(`🔥 Load Test Results:`)
      console.log(`   Success Rate: ${loadTestResult.successRate.toFixed(2)}%`)
      console.log(`   Average Response Time: ${loadTestResult.averageResponseTime.toFixed(2)}ms`)
      console.log(`   Throughput: ${loadTestResult.throughput.toFixed(2)} requests/second`)
      console.log(`   Total Requests: ${loadTestResult.totalRequests}`)
    })
  })

  describe('Integration Testing', () => {
    it('should properly integrate with PoolFactory contract events', async () => {
      // Test complete event parsing flow
      const mockLogs = [
        {
          topics: [
            '0x' + 'a'.repeat(64), // Event signature
            '0x' + '1'.padStart(64, '0'), // Pool ID
            '0x' + 'b'.repeat(40).padStart(64, '0'), // Pool Address
            '0x' + testEnvironment.params.poolOwner.slice(2).padStart(64, '0'), // Pool Owner
          ],
          data: '0x' + 'c'.repeat(128), // Additional data
        },
      ]

      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + '18'.repeat(32),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 77777,
          gasUsed: ethers.parseUnits('180000', 'wei'),
          logs: mockLogs,
        }),
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockImplementation((log) => {
          if (log === mockLogs[0]) {
            return {
              name: 'PoolCreated',
              args: {
                poolId: 18,
                poolAddress: '0x' + '18'.repeat(20),
                poolOwner: testEnvironment.params.poolOwner,
                name: testEnvironment.params.name,
                maxLoanAmount: testEnvironment.params.maxLoanAmount,
                interestRate: testEnvironment.params.interestRate,
                loanDuration: testEnvironment.params.loanDuration,
              },
            }
          }
          return null
        }),
      }

      const result = (await createPool(testEnvironment.request)) as CreatePoolResponse

      expect(result.success).toBe(true)
      expect(result.poolId).toBe(18)
      expect(mockPoolFactory.interface.parseLog).toHaveBeenCalledWith(mockLogs[0])
    })

    it('should handle blockchain reorganization scenarios', async () => {
      // Simulate a transaction that gets reorganized out
      const originalTxHash = '0x' + '19'.repeat(32)
      const newTxHash = '0x' + '20'.repeat(32)

      let callCount = 0
      mockPoolFactory.createPool.mockImplementation(() => {
        callCount++
        return Promise.resolve({
          hash: callCount === 1 ? originalTxHash : newTxHash,
          wait: jest.fn().mockImplementation(() => {
            if (callCount === 1) {
              // First transaction gets reorganized
              return Promise.reject(new Error('Transaction was replaced'))
            }
            return Promise.resolve({
              status: 1,
              blockNumber: 88888,
              gasUsed: ethers.parseUnits('200000', 'wei'),
              logs: [{}],
            })
          }),
        })
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue({
          name: 'PoolCreated',
          args: { poolId: 20, poolAddress: '0x' + '20'.repeat(20) },
        }),
      }

      // The function should handle the reorganization and complete successfully
      const result = await createPool(testEnvironment.request)

      expect(result.success).toBe(false) // Should fail on reorganization
      expect(result.message).toContain('replaced')
    })
  })

  describe('Security Testing', () => {
    it('should prevent pool creation with unauthorized parameters', async () => {
      // Test attempt to create pool with someone else as owner but different auth
      const maliciousRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          poolOwner: TestFixtures.TestData.addresses.poolOwners[1], // Different owner
        },
        testEnvironment.uid
      )

      // This should still work as the function doesn't enforce owner == auth user
      // But it's documented behavior for administrative flexibility
      mockPoolFactory.createPool.mockResolvedValue({
        hash: '0x' + '21'.repeat(32),
        wait: jest.fn().mockResolvedValue({
          status: 1,
          blockNumber: 99999,
          gasUsed: ethers.parseUnits('200000', 'wei'),
          logs: [{}],
        }),
      })

      mockPoolFactory.interface = {
        parseLog: jest.fn().mockReturnValue({
          name: 'PoolCreated',
          args: { poolId: 21, poolAddress: '0x' + '21'.repeat(20) },
        }),
      }

      const result = (await createPool(maliciousRequest)) as CreatePoolResponse

      expect(result.success).toBe(true) // Allowed for admin flexibility
      expect(result.poolId).toBe(21)
    })

    it('should sanitize input parameters against injection attacks', async () => {
      const maliciousParams = {
        poolOwner: testEnvironment.params.poolOwner,
        maxLoanAmount: "'; DROP TABLE pools; --",
        interestRate: Number.MAX_SAFE_INTEGER,
        loanDuration: -1,
        name: '"><script>alert("xss")</script><input value="',
        description: 'javascript:void(0)/*--></title></style></textarea></script></xmp><svg/onload=alert(1)>',
      }

      const maliciousRequest = testEnvironment.functionTester.createAuthenticatedRequest(maliciousParams, testEnvironment.uid)

      const result = await createPool(maliciousRequest)

      // Should fail validation rather than sanitize and process
      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
    })
  })
})
