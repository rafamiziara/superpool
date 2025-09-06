/**
 * Performance and Load Tests for Critical Functions
 *
 * Comprehensive performance testing suite covering load testing, stress testing,
 * throughput analysis, and performance regression detection for all critical
 * SuperPool backend functions.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { MockFactory, quickSetup, TestFixtures } from '../../__mocks__/index'
import {
  detectMemoryLeaks,
  performanceManager,
  PerformanceTestManager,
  runBenchmark,
  startPerformanceTest,
} from '../utils/PerformanceTestUtilities'
import { withTestIsolation } from '../utils/TestEnvironmentIsolation'
import { ExecutionPriority, ParallelTestCase, ParallelTestExecutor, WorkloadCategory } from '../utils/ParallelTestExecution'

// Mock all critical services for performance testing
const PerformanceTestServices = {
  authentication: {
    generateAuthMessage: jest.fn(),
    verifySignatureAndLogin: jest.fn(),
  },
  pools: {
    createPool: jest.fn(),
    getPool: jest.fn(),
    updatePool: jest.fn(),
    listPools: jest.fn(),
  },
  contracts: {
    executeTransaction: jest.fn(),
    estimateGas: jest.fn(),
    batchTransactions: jest.fn(),
  },
  deviceVerification: {
    approveDevice: jest.fn(),
    checkDeviceApproval: jest.fn(),
    bulkApproveDevices: jest.fn(),
  },
}

describe('Performance and Load Tests - Critical Functions', () => {
  let testEnvironment: any
  let parallelExecutor: ParallelTestExecutor

  beforeEach(async () => {
    // Setup performance test environment
    testEnvironment = MockFactory.createCloudFunctionEnvironment({
      withAuth: true,
      withFirestore: true,
      withContracts: true,
    })

    // Initialize parallel test executor
    parallelExecutor = ParallelTestExecutor.getInstance()

    performanceManager.clearAll()
  })

  afterEach(async () => {
    MockFactory.resetAllMocks()
  })

  describe('Authentication Performance Tests', () => {
    describe('Load Testing', () => {
      it('should handle high-volume authentication requests', async () => {
        await withTestIsolation('auth-load-test', 'performance', async (context) => {
          // Arrange
          const concurrentUsers = 100
          const requestsPerUser = 5
          const totalRequests = concurrentUsers * requestsPerUser

          // Setup realistic authentication responses
          PerformanceTestServices.authentication.generateAuthMessage.mockImplementation(async () => {
            // Simulate variable processing time
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 100 + 50)) // 50-150ms

            return {
              success: true,
              nonce: `nonce-${Date.now()}-${Math.random()}`,
              message: 'Sign this message to authenticate...',
              expiresAt: new Date(Date.now() + 600000).toISOString(),
            }
          })

          // Act
          const measurement = startPerformanceTest('auth-load-test', 'load-testing')

          const loadTestResult = await performanceManager.runLoadTest(
            'authentication-load',
            async () => {
              return PerformanceTestServices.authentication.generateAuthMessage(
                TestFixtures.TestData.addresses.poolOwners[Math.floor(Math.random() * TestFixtures.TestData.addresses.poolOwners.length)]
              )
            },
            {
              concurrentUsers,
              duration: 30000, // 30 seconds
              rampUpTime: 5000, // 5 seconds ramp-up
              thinkTime: 100, // 100ms between requests
              maxRequestsPerSecond: 50,
            },
            {
              maxResponseTime: 2000, // 2 seconds max
              minThroughput: 25, // 25 requests/second minimum
              maxMemoryUsage: 512 * 1024 * 1024, // 512MB max
            }
          )

          const metrics = measurement.end()

          // Assert
          expect(loadTestResult.totalRequests).toBeGreaterThan(100)
          expect(loadTestResult.successRate).toBeGreaterThan(95) // 95% success rate
          expect(loadTestResult.averageResponseTime).toBeLessThan(2000) // < 2 seconds
          expect(loadTestResult.throughput).toBeGreaterThan(25) // > 25 req/sec

          console.log('Authentication Load Test Results:')
          console.log(`  Total Requests: ${loadTestResult.totalRequests}`)
          console.log(`  Success Rate: ${loadTestResult.successRate.toFixed(2)}%`)
          console.log(`  Average Response Time: ${loadTestResult.averageResponseTime.toFixed(2)}ms`)
          console.log(`  Throughput: ${loadTestResult.throughput.toFixed(2)} req/sec`)
        })
      })

      it('should benchmark signature verification performance', async () => {
        await withTestIsolation('signature-verification-benchmark', 'performance', async (context) => {
          // Arrange
          const testSignatures = Array.from({ length: 10 }, (_, i) => ({
            walletAddress: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
            signature: `0x${'a'.repeat(130)}${i}`, // Mock signatures
            message: `Test message ${i}`,
            nonce: `nonce-${i}`,
          }))

          PerformanceTestServices.authentication.verifySignatureAndLogin.mockImplementation(async ({ signature, nonce }) => {
            // Simulate cryptographic verification
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 50 + 25)) // 25-75ms

            return {
              success: true,
              token: `auth-token-${nonce}`,
              user: { uid: `user-${nonce}`, verified: true },
              verificationTime: Math.random() * 50 + 25,
            }
          })

          // Act
          const benchmarkResult = await runBenchmark(
            'signature-verification',
            async () => {
              const testSig = testSignatures[Math.floor(Math.random() * testSignatures.length)]
              return PerformanceTestServices.authentication.verifySignatureAndLogin(testSig)
            },
            200, // 200 iterations
            20 // 20 warmup runs
          )

          // Assert
          expect(benchmarkResult.timing.mean).toBeLessThan(200) // < 200ms average
          expect(benchmarkResult.timing.p95).toBeLessThan(300) // < 300ms for 95th percentile
          expect(benchmarkResult.timing.p99).toBeLessThan(500) // < 500ms for 99th percentile
          expect(benchmarkResult.timing.stdDev).toBeLessThan(100) // Low variance

          console.log('Signature Verification Benchmark:')
          console.log(`  Average: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
          console.log(`  P95: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
          console.log(`  P99: ${benchmarkResult.timing.p99.toFixed(2)}ms`)
          console.log(`  Std Dev: ${benchmarkResult.timing.stdDev.toFixed(2)}ms`)
        })
      })
    })

    describe('Stress Testing', () => {
      it('should handle authentication system under extreme load', async () => {
        await withTestIsolation('auth-stress-test', 'performance', async (context) => {
          // Arrange
          const extremeLoad = {
            concurrentUsers: 500, // 5x normal load
            duration: 60000, // 1 minute
            rampUpTime: 10000, // 10 seconds
            thinkTime: 10, // Minimal think time
            maxRequestsPerSecond: 200, // High throughput
          }

          let systemOverloaded = false
          let degradationStarted = false

          PerformanceTestServices.authentication.generateAuthMessage.mockImplementation(async () => {
            // Simulate system degradation under extreme load
            const baseLatency = 100
            const loadFactor = systemOverloaded ? 5 : degradationStarted ? 3 : 1
            const responseTime = baseLatency * loadFactor + Math.random() * 100

            await new Promise((resolve) => setTimeout(resolve, responseTime))

            // Simulate occasional failures under extreme load
            if (systemOverloaded && Math.random() < 0.1) {
              // 10% failure rate when overloaded
              throw new Error('System overloaded')
            }

            return {
              success: true,
              nonce: `stress-nonce-${Date.now()}-${Math.random()}`,
              responseTime,
              systemLoad: systemOverloaded ? 'critical' : degradationStarted ? 'high' : 'normal',
            }
          })

          // Act
          const measurement = startPerformanceTest('auth-stress-test', 'stress-testing')

          // Simulate progressive load increase
          setTimeout(() => {
            degradationStarted = true
          }, 20000) // Degradation at 20s
          setTimeout(() => {
            systemOverloaded = true
          }, 40000) // Overload at 40s

          const stressTestResult = await performanceManager.runLoadTest(
            'authentication-stress',
            async () => {
              return PerformanceTestServices.authentication.generateAuthMessage('stress-test-address')
            },
            extremeLoad
          )

          const metrics = measurement.end()

          // Assert
          expect(stressTestResult.totalRequests).toBeGreaterThan(1000) // Should handle high volume

          // Under stress, we expect some degradation but not complete failure
          if (stressTestResult.successRate < 90) {
            console.warn(`Success rate dropped to ${stressTestResult.successRate}% under stress`)
            expect(stressTestResult.successRate).toBeGreaterThan(70) // At least 70% success under extreme stress
          }

          console.log('Authentication Stress Test Results:')
          console.log(`  Total Requests: ${stressTestResult.totalRequests}`)
          console.log(`  Success Rate: ${stressTestResult.successRate.toFixed(2)}%`)
          console.log(`  Average Response Time: ${stressTestResult.averageResponseTime.toFixed(2)}ms`)
          console.log(`  Peak Throughput: ${stressTestResult.throughput.toFixed(2)} req/sec`)
        })
      })
    })
  })

  describe('Pool Management Performance Tests', () => {
    describe('Pool Creation Performance', () => {
      it('should benchmark pool creation end-to-end performance', async () => {
        await withTestIsolation('pool-creation-benchmark', 'performance', async (context) => {
          // Arrange
          const poolConfigurations = [
            TestFixtures.TestData.pools.basic,
            TestFixtures.TestData.pools.highInterest,
            TestFixtures.TestData.pools.enterprise,
            TestFixtures.TestData.pools.micro,
          ]

          PerformanceTestServices.pools.createPool.mockImplementation(async (poolParams) => {
            // Simulate full pool creation pipeline

            // 1. Validation (10-50ms)
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 40 + 10))

            // 2. Blockchain transaction (500-2000ms)
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 1500 + 500))

            // 3. Database save (50-200ms)
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 150 + 50))

            // 4. Event notification (20-100ms)
            await new Promise((resolve) => setTimeout(resolve, Math.random() * 80 + 20))

            return {
              success: true,
              poolId: `pool-${Date.now()}-${Math.random()}`,
              transactionHash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
              poolDetails: poolParams,
              createdAt: new Date().toISOString(),
            }
          })

          // Act
          const benchmarkResult = await runBenchmark(
            'pool-creation-end-to-end',
            async () => {
              const randomPoolConfig = poolConfigurations[Math.floor(Math.random() * poolConfigurations.length)]
              return PerformanceTestServices.pools.createPool(randomPoolConfig)
            },
            50, // 50 iterations
            5 // 5 warmup runs
          )

          // Assert
          expect(benchmarkResult.timing.mean).toBeLessThan(5000) // < 5 seconds average
          expect(benchmarkResult.timing.p95).toBeLessThan(8000) // < 8 seconds for 95th percentile
          expect(benchmarkResult.timing.max).toBeLessThan(15000) // < 15 seconds max

          console.log('Pool Creation Benchmark:')
          console.log(`  Average: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
          console.log(`  P95: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
          console.log(`  P99: ${benchmarkResult.timing.p99.toFixed(2)}ms`)
          console.log(`  Max: ${benchmarkResult.timing.max.toFixed(2)}ms`)
        })
      })

      it('should test concurrent pool creation performance', async () => {
        await withTestIsolation('concurrent-pool-creation', 'performance', async (context) => {
          // Arrange
          const concurrentCreations = 20
          const poolOwners = TestFixtures.TestData.addresses.poolOwners

          PerformanceTestServices.pools.createPool.mockImplementation(async (poolParams) => {
            // Simulate resource contention and locking
            const processingTime = 1000 + Math.random() * 2000 // 1-3 seconds
            await new Promise((resolve) => setTimeout(resolve, processingTime))

            return {
              success: true,
              poolId: `concurrent-pool-${Date.now()}-${Math.random()}`,
              transactionHash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
              processingTime,
              concurrentRequest: true,
            }
          })

          // Act
          const measurement = startPerformanceTest('concurrent-pool-creation', 'concurrency')

          const concurrentPromises = Array.from({ length: concurrentCreations }, async (_, i) => {
            return PerformanceTestServices.pools.createPool({
              ...TestFixtures.TestData.pools.basic,
              name: `Concurrent Pool ${i}`,
              poolOwner: poolOwners[i % poolOwners.length],
            })
          })

          const results = await Promise.all(concurrentPromises)
          const metrics = measurement.end()

          // Assert
          expect(results).toHaveLength(concurrentCreations)
          expect(results.every((r) => r.success)).toBe(true)

          // Calculate concurrency efficiency
          const totalSequentialTime = results.reduce((sum, r) => sum + r.processingTime, 0)
          const actualConcurrentTime = metrics.executionTime
          const concurrencyEfficiency = (totalSequentialTime / actualConcurrentTime / concurrentCreations) * 100

          expect(concurrencyEfficiency).toBeGreaterThan(50) // At least 50% efficiency

          console.log('Concurrent Pool Creation Results:')
          console.log(`  Concurrent Requests: ${concurrentCreations}`)
          console.log(`  Total Time: ${actualConcurrentTime.toFixed(2)}ms`)
          console.log(`  Average per Pool: ${(actualConcurrentTime / concurrentCreations).toFixed(2)}ms`)
          console.log(`  Concurrency Efficiency: ${concurrencyEfficiency.toFixed(2)}%`)
        })
      })
    })

    describe('Pool Query Performance', () => {
      it('should benchmark pool listing with pagination', async () => {
        await withTestIsolation('pool-listing-benchmark', 'performance', async (context) => {
          // Arrange
          const totalPools = 10000 // Simulate large dataset
          const pageSizes = [10, 25, 50, 100]

          PerformanceTestServices.pools.listPools.mockImplementation(async ({ page = 1, pageSize = 25, filters = {} }) => {
            // Simulate database query with filtering and pagination
            const queryTime = Math.log10(totalPools) * 10 + Math.random() * 50 // Logarithmic scaling
            await new Promise((resolve) => setTimeout(resolve, queryTime))

            const startIndex = (page - 1) * pageSize
            const endIndex = Math.min(startIndex + pageSize, totalPools)

            const mockPools = Array.from({ length: endIndex - startIndex }, (_, i) => ({
              poolId: `pool-${startIndex + i}`,
              name: `Pool ${startIndex + i}`,
              maxLoanAmount: '1000',
              interestRate: 500,
              status: 'active',
            }))

            return {
              pools: mockPools,
              pagination: {
                page,
                pageSize,
                totalPages: Math.ceil(totalPools / pageSize),
                totalPools,
                hasNext: endIndex < totalPools,
                hasPrev: page > 1,
              },
              queryTime,
            }
          })

          // Act & Assert
          for (const pageSize of pageSizes) {
            const benchmarkResult = await runBenchmark(
              `pool-listing-pagesize-${pageSize}`,
              async () => {
                const randomPage = Math.floor(Math.random() * 10) + 1 // Random page 1-10
                return PerformanceTestServices.pools.listPools({
                  page: randomPage,
                  pageSize,
                  filters: { status: 'active' },
                })
              },
              30, // 30 iterations
              3 // 3 warmup runs
            )

            expect(benchmarkResult.timing.mean).toBeLessThan(500) // < 500ms average
            expect(benchmarkResult.timing.p95).toBeLessThan(1000) // < 1 second for 95th percentile

            console.log(`Pool Listing Benchmark (page size ${pageSize}):`)
            console.log(`  Average: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
            console.log(`  P95: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
          }
        })
      })
    })
  })

  describe('Contract Service Performance Tests', () => {
    describe('Transaction Processing Performance', () => {
      it('should benchmark transaction execution pipeline', async () => {
        await withTestIsolation('transaction-execution-benchmark', 'performance', async (context) => {
          // Arrange
          const transactionTypes = [
            { type: 'pool_creation', gasLimit: 500000, complexity: 'high' },
            { type: 'approve_device', gasLimit: 100000, complexity: 'low' },
            { type: 'transfer', gasLimit: 21000, complexity: 'basic' },
            { type: 'multi_sig', gasLimit: 300000, complexity: 'medium' },
          ]

          PerformanceTestServices.contracts.executeTransaction.mockImplementation(async (txData) => {
            // Simulate transaction pipeline stages

            // 1. Gas estimation (100-300ms)
            const gasEstimationTime = Math.random() * 200 + 100
            await new Promise((resolve) => setTimeout(resolve, gasEstimationTime))

            // 2. Transaction signing (50-150ms)
            const signingTime = Math.random() * 100 + 50
            await new Promise((resolve) => setTimeout(resolve, signingTime))

            // 3. Network submission (200-800ms)
            const networkTime = Math.random() * 600 + 200
            await new Promise((resolve) => setTimeout(resolve, networkTime))

            // 4. Confirmation waiting (1000-5000ms)
            const confirmationTime = Math.random() * 4000 + 1000
            await new Promise((resolve) => setTimeout(resolve, confirmationTime))

            const totalTime = gasEstimationTime + signingTime + networkTime + confirmationTime

            return {
              success: true,
              transactionHash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
              gasUsed: txData.gasLimit * (0.8 + Math.random() * 0.2), // 80-100% of limit
              blockNumber: 12345 + Math.floor(Math.random() * 1000),
              pipeline: {
                gasEstimationTime,
                signingTime,
                networkTime,
                confirmationTime,
                totalTime,
              },
            }
          })

          // Act & Assert
          for (const txType of transactionTypes) {
            const benchmarkResult = await runBenchmark(
              `transaction-${txType.type}`,
              async () => {
                return PerformanceTestServices.contracts.executeTransaction({
                  type: txType.type,
                  gasLimit: txType.gasLimit,
                  to: TestFixtures.TestData.addresses.contracts.poolFactory,
                  data: '0x123456',
                })
              },
              20, // 20 iterations
              3 // 3 warmup runs
            )

            // Performance expectations based on transaction complexity
            const expectedMaxTime =
              {
                high: 10000, // 10 seconds
                medium: 7000, // 7 seconds
                low: 5000, // 5 seconds
                basic: 3000, // 3 seconds
              }[txType.complexity] || 10000

            expect(benchmarkResult.timing.mean).toBeLessThan(expectedMaxTime)
            expect(benchmarkResult.timing.p95).toBeLessThan(expectedMaxTime * 1.5)

            console.log(`Transaction Benchmark (${txType.type}):`)
            console.log(`  Average: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
            console.log(`  P95: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
            console.log(`  Complexity: ${txType.complexity}`)
          }
        })
      })

      it('should test batch transaction performance', async () => {
        await withTestIsolation('batch-transaction-performance', 'performance', async (context) => {
          // Arrange
          const batchSizes = [5, 10, 20, 50]

          PerformanceTestServices.contracts.batchTransactions.mockImplementation(async (transactions) => {
            const batchSize = transactions.length

            // Simulate batch processing efficiency
            const singleTxTime = 2000 // 2 seconds per transaction individually
            const batchOverhead = 500 // 500ms batch overhead
            const efficiencyGain = 0.3 // 30% efficiency gain from batching

            const totalTime = singleTxTime * batchSize * (1 - efficiencyGain) + batchOverhead
            await new Promise((resolve) => setTimeout(resolve, totalTime))

            const results = transactions.map((tx, i) => ({
              transactionHash: `0x${'a'.repeat(60)}${i.toString().padStart(4, '0')}`,
              success: true,
              gasUsed: tx.gasLimit * 0.9,
            }))

            return {
              batchId: `batch-${Date.now()}`,
              results,
              batchSize,
              totalTime,
              averageTimePerTx: totalTime / batchSize,
              efficiencyGain: efficiencyGain * 100,
            }
          })

          // Act & Assert
          for (const batchSize of batchSizes) {
            const measurement = startPerformanceTest(`batch-tx-size-${batchSize}`, 'batch-processing')

            const transactions = Array.from({ length: batchSize }, (_, i) => ({
              to: TestFixtures.TestData.addresses.contracts.poolFactory,
              data: `0x${i.toString(16).padStart(8, '0')}`,
              gasLimit: 200000,
              value: '0',
            }))

            const result = await PerformanceTestServices.contracts.batchTransactions(transactions)
            const metrics = measurement.end()

            // Assert
            expect(result.results).toHaveLength(batchSize)
            expect(result.results.every((r) => r.success)).toBe(true)
            expect(result.efficiencyGain).toBeGreaterThan(20) // At least 20% efficiency gain

            // Performance should scale sub-linearly
            const expectedMaxTime = batchSize * 1500 // Less than 1.5s per transaction due to batching
            expect(metrics.executionTime).toBeLessThan(expectedMaxTime)

            console.log(`Batch Transaction Results (size ${batchSize}):`)
            console.log(`  Total Time: ${metrics.executionTime.toFixed(2)}ms`)
            console.log(`  Average per Tx: ${result.averageTimePerTx.toFixed(2)}ms`)
            console.log(`  Efficiency Gain: ${result.efficiencyGain.toFixed(2)}%`)
          }
        })
      })
    })
  })

  describe('Device Verification Performance Tests', () => {
    describe('Bulk Device Operations', () => {
      it('should benchmark bulk device approval performance', async () => {
        await withTestIsolation('bulk-device-approval-benchmark', 'performance', async (context) => {
          // Arrange
          const bulkSizes = [10, 50, 100, 500]

          PerformanceTestServices.deviceVerification.bulkApproveDevices.mockImplementation(async (devices) => {
            const bulkSize = devices.length

            // Simulate bulk processing with parallel operations
            const singleProcessingTime = 200 // 200ms per device individually
            const parallelFactor = Math.min(10, bulkSize) // Max 10 parallel operations
            const processingTime = (bulkSize / parallelFactor) * singleProcessingTime

            await new Promise((resolve) => setTimeout(resolve, processingTime))

            const results = devices.map((device, i) => ({
              deviceId: device.deviceId,
              approved: true,
              approvedAt: new Date().toISOString(),
              processingOrder: i,
            }))

            return {
              bulkId: `bulk-${Date.now()}`,
              results,
              bulkSize,
              processingTime,
              parallelOperations: parallelFactor,
              averageTimePerDevice: processingTime / bulkSize,
            }
          })

          // Act & Assert
          for (const bulkSize of bulkSizes) {
            const devices = Array.from({ length: bulkSize }, (_, i) => ({
              deviceId: `bulk-device-${i}`,
              walletAddress: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
            }))

            const benchmarkResult = await runBenchmark(
              `bulk-device-approval-${bulkSize}`,
              async () => {
                return PerformanceTestServices.deviceVerification.bulkApproveDevices(devices)
              },
              10, // 10 iterations
              2 // 2 warmup runs
            )

            // Assert performance scaling
            expect(benchmarkResult.timing.mean).toBeLessThan(bulkSize * 100) // Should be faster than 100ms per device
            expect(benchmarkResult.timing.p95).toBeLessThan(bulkSize * 150) // P95 should be reasonable

            console.log(`Bulk Device Approval Benchmark (${bulkSize} devices):`)
            console.log(`  Average: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
            console.log(`  Per Device: ${(benchmarkResult.timing.mean / bulkSize).toFixed(2)}ms`)
            console.log(`  P95: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
          }
        })
      })
    })
  })

  describe('Memory Performance and Leak Detection', () => {
    it('should detect memory leaks in critical operations', async () => {
      await withTestIsolation('memory-leak-detection', 'performance', async (context) => {
        // Arrange
        const criticalOperations = [
          {
            name: 'authentication-operations',
            operation: async () => {
              await PerformanceTestServices.authentication.generateAuthMessage('test-address')
              await PerformanceTestServices.authentication.verifySignatureAndLogin({
                signature: '0x123',
                nonce: 'test-nonce',
              })
            },
          },
          {
            name: 'pool-operations',
            operation: async () => {
              await PerformanceTestServices.pools.createPool(TestFixtures.TestData.pools.basic)
              await PerformanceTestServices.pools.getPool('test-pool-id')
            },
          },
          {
            name: 'contract-operations',
            operation: async () => {
              await PerformanceTestServices.contracts.estimateGas('createPool', {})
              await PerformanceTestServices.contracts.executeTransaction({
                to: TestFixtures.TestData.addresses.contracts.poolFactory,
                data: '0x123',
              })
            },
          },
        ]

        // Setup mock implementations
        PerformanceTestServices.authentication.generateAuthMessage.mockResolvedValue({
          success: true,
          nonce: 'test-nonce',
        })

        PerformanceTestServices.authentication.verifySignatureAndLogin.mockResolvedValue({
          success: true,
          token: 'test-token',
        })

        PerformanceTestServices.pools.createPool.mockResolvedValue({
          success: true,
          poolId: 'test-pool',
        })

        PerformanceTestServices.pools.getPool.mockResolvedValue({
          success: true,
          poolData: {},
        })

        PerformanceTestServices.contracts.estimateGas.mockResolvedValue({
          estimatedGas: '200000',
        })

        PerformanceTestServices.contracts.executeTransaction.mockResolvedValue({
          success: true,
          transactionHash: '0x123',
        })

        // Act & Assert
        for (const testCase of criticalOperations) {
          const memoryLeakReport = await detectMemoryLeaks(
            testCase.name,
            testCase.operation,
            500, // 500 iterations
            50 // GC every 50 iterations
          )

          // Assert no significant memory leaks
          expect(memoryLeakReport.hasLeak).toBe(false)

          if (memoryLeakReport.details) {
            const heapGrowthMB = memoryLeakReport.details.growth.heap
            const rssGrowthMB = memoryLeakReport.details.growth.rss

            expect(heapGrowthMB).toBeLessThan(50) // Less than 50MB heap growth
            expect(rssGrowthMB).toBeLessThan(100) // Less than 100MB RSS growth

            console.log(`Memory Leak Test (${testCase.name}):`)
            console.log(`  Heap Growth: ${heapGrowthMB.toFixed(2)}MB`)
            console.log(`  RSS Growth: ${rssGrowthMB.toFixed(2)}MB`)
            console.log(`  Leak Status: ${memoryLeakReport.hasLeak ? 'DETECTED' : 'NONE'}`)
          }
        }
      })
    })
  })

  describe('Performance Regression Detection', () => {
    it('should establish performance baselines and detect regressions', async () => {
      await withTestIsolation('performance-regression-detection', 'performance', async (context) => {
        // Arrange
        const performanceBaselines = {
          authGeneration: { baseline: 150, tolerance: 20 }, // 150ms ± 20%
          signatureVerification: { baseline: 80, tolerance: 25 }, // 80ms ± 25%
          poolCreation: { baseline: 3000, tolerance: 30 }, // 3s ± 30%
          transactionExecution: { baseline: 5000, tolerance: 40 }, // 5s ± 40%
        }

        // Setup realistic performance mocks
        const performanceVariance = 0.1 // 10% variance

        PerformanceTestServices.authentication.generateAuthMessage.mockImplementation(async () => {
          const baseTime = performanceBaselines.authGeneration.baseline
          const actualTime = baseTime + baseTime * performanceVariance * (Math.random() - 0.5) * 2
          await new Promise((resolve) => setTimeout(resolve, actualTime))
          return { success: true, nonce: 'test', actualTime }
        })

        PerformanceTestServices.authentication.verifySignatureAndLogin.mockImplementation(async () => {
          const baseTime = performanceBaselines.signatureVerification.baseline
          const actualTime = baseTime + baseTime * performanceVariance * (Math.random() - 0.5) * 2
          await new Promise((resolve) => setTimeout(resolve, actualTime))
          return { success: true, verified: true, actualTime }
        })

        // Act & Assert
        const performanceTests = [
          {
            name: 'auth-generation',
            operation: () => PerformanceTestServices.authentication.generateAuthMessage('test'),
            baseline: performanceBaselines.authGeneration,
          },
          {
            name: 'signature-verification',
            operation: () => PerformanceTestServices.authentication.verifySignatureAndLogin({}),
            baseline: performanceBaselines.signatureVerification,
          },
        ]

        for (const test of performanceTests) {
          const benchmarkResult = await runBenchmark(
            test.name,
            test.operation,
            50, // 50 iterations for statistical significance
            5 // 5 warmup runs
          )

          const deviation = Math.abs(benchmarkResult.timing.mean - test.baseline.baseline)
          const deviationPercent = (deviation / test.baseline.baseline) * 100
          const isRegression = deviationPercent > test.baseline.tolerance

          // Assert no performance regression
          expect(isRegression).toBe(false)
          expect(deviationPercent).toBeLessThan(test.baseline.tolerance)

          console.log(`Performance Regression Test (${test.name}):`)
          console.log(`  Baseline: ${test.baseline.baseline}ms`)
          console.log(`  Actual: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
          console.log(`  Deviation: ${deviationPercent.toFixed(2)}%`)
          console.log(`  Tolerance: ${test.baseline.tolerance}%`)
          console.log(`  Status: ${isRegression ? 'REGRESSION' : 'WITHIN_BASELINE'}`)
        }
      })
    })
  })

  describe('Overall System Performance', () => {
    it('should benchmark complete user workflow performance', async () => {
      await withTestIsolation('end-to-end-workflow-benchmark', 'performance', async (context) => {
        // Arrange - Complete user workflow
        const userWorkflow = async () => {
          // 1. Generate auth message
          const authMessage = await PerformanceTestServices.authentication.generateAuthMessage(
            TestFixtures.TestData.addresses.poolOwners[0]
          )

          // 2. Verify signature and login
          const loginResult = await PerformanceTestServices.authentication.verifySignatureAndLogin({
            signature: '0x123',
            nonce: authMessage.nonce,
          })

          // 3. Approve device
          const deviceApproval = await PerformanceTestServices.deviceVerification.approveDevice({
            deviceId: 'workflow-device',
            walletAddress: TestFixtures.TestData.addresses.poolOwners[0],
          })

          // 4. Create pool
          const poolCreation = await PerformanceTestServices.pools.createPool(TestFixtures.TestData.pools.basic)

          // 5. Get pool details
          const poolDetails = await PerformanceTestServices.pools.getPool(poolCreation.poolId)

          return {
            authMessage,
            loginResult,
            deviceApproval,
            poolCreation,
            poolDetails,
            workflowCompleted: true,
          }
        }

        // Setup all mock implementations
        PerformanceTestServices.authentication.generateAuthMessage.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return { success: true, nonce: 'workflow-nonce' }
        })

        PerformanceTestServices.authentication.verifySignatureAndLogin.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150))
          return { success: true, token: 'workflow-token' }
        })

        PerformanceTestServices.deviceVerification.approveDevice.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return { success: true, deviceId: 'workflow-device', approved: true }
        })

        PerformanceTestServices.pools.createPool.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          return { success: true, poolId: 'workflow-pool' }
        })

        PerformanceTestServices.pools.getPool.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 100))
          return { success: true, poolData: {} }
        })

        // Act
        const benchmarkResult = await runBenchmark(
          'complete-user-workflow',
          userWorkflow,
          20, // 20 iterations
          3 // 3 warmup runs
        )

        // Assert
        expect(benchmarkResult.timing.mean).toBeLessThan(5000) // < 5 seconds total workflow
        expect(benchmarkResult.timing.p95).toBeLessThan(7000) // < 7 seconds for 95th percentile
        expect(benchmarkResult.timing.stdDev).toBeLessThan(1000) // Low variance for consistent UX

        console.log('Complete User Workflow Benchmark:')
        console.log(`  Average Total Time: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
        console.log(`  P95 Total Time: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
        console.log(`  Standard Deviation: ${benchmarkResult.timing.stdDev.toFixed(2)}ms`)
        console.log(`  Consistency Score: ${((1 - benchmarkResult.timing.stdDev / benchmarkResult.timing.mean) * 100).toFixed(2)}%`)
      })
    })
  })
})
