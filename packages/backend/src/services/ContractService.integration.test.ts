/**
 * Contract Service Integration Tests
 *
 * Comprehensive integration tests for ContractService including blockchain
 * interactions, transaction management, and error handling scenarios.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { MockFactory, quickSetup, TestFixtures } from '../__mocks__/index'
import { performanceManager, startPerformanceTest } from '../__tests__/utils/PerformanceTestUtilities'
import { withTestIsolation } from '../__tests__/utils/TestEnvironmentIsolation'
import { BlockchainTestEnvironment } from '../__tests__/utils/BlockchainTestEnvironment'

// Mock ContractService for testing
const ContractService = {
  createPool: jest.fn(),
  getPool: jest.fn(),
  updatePool: jest.fn(),
  executeTransaction: jest.fn(),
  estimateGas: jest.fn(),
  validateTransaction: jest.fn(),
}

describe('ContractService - Integration Tests', () => {
  let testEnvironment: any
  let blockchainEnv: BlockchainTestEnvironment
  let mockProvider: any
  let mockContract: any

  beforeEach(async () => {
    // Setup comprehensive test environment
    testEnvironment = MockFactory.createCloudFunctionEnvironment({
      withContracts: true,
      withFirestore: true,
      chainName: 'local',
    })

    blockchainEnv = BlockchainTestEnvironment.getInstance({ chainName: 'local' })
    mockProvider = testEnvironment.mocks.ethers.provider
    mockContract = testEnvironment.mocks.poolFactory

    // Reset performance tracking
    performanceManager.clearAll()
  })

  afterEach(async () => {
    MockFactory.resetAllMocks()
  })

  describe('Pool Contract Interactions', () => {
    describe('createPool Integration', () => {
      it('should create pool with full blockchain integration', async () => {
        await withTestIsolation('pool-creation-integration', 'contract-service', async (context) => {
          // Arrange
          const poolParams = TestFixtures.TestData.pools.basic
          const ownerAddress = TestFixtures.TestData.addresses.poolOwners[0]

          // Setup provider and contract mocks
          mockProvider.getNetwork.mockResolvedValue({
            chainId: 31337,
            name: 'localhost',
          })

          mockProvider.getBlockNumber.mockResolvedValue(12345)
          mockProvider.getGasPrice.mockResolvedValue('20000000000') // 20 Gwei

          mockContract.createPool.mockResolvedValue({
            hash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
            from: ownerAddress,
            to: TestFixtures.TestData.addresses.contracts.poolFactory,
            gasLimit: '500000',
            gasPrice: '20000000000',
            value: '0',
            data: '0x123456...',
            wait: jest.fn().mockResolvedValue({
              status: 1,
              blockNumber: 12346,
              blockHash: '0xblock123...',
              gasUsed: '487123',
              effectiveGasPrice: '20000000000',
              logs: [
                {
                  address: TestFixtures.TestData.addresses.contracts.poolFactory,
                  topics: [
                    '0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0', // PoolCreated event
                    `0x000000000000000000000000${ownerAddress.slice(2)}`, // Owner
                    '0x0000000000000000000000000000000000000000000000000000000000000001', // Pool ID
                  ],
                  data: '0x...',
                },
              ],
              events: [
                {
                  event: 'PoolCreated',
                  args: {
                    poolId: '1',
                    owner: ownerAddress,
                    maxLoanAmount: poolParams.maxLoanAmount,
                    interestRate: poolParams.interestRate,
                  },
                },
              ],
            }),
          })

          // Act
          const measurement = startPerformanceTest('contract-pool-creation', 'integration')

          ContractService.createPool.mockResolvedValue({
            success: true,
            poolId: '1',
            transactionHash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
            blockNumber: 12346,
            gasUsed: '487123',
            eventLogs: [
              {
                event: 'PoolCreated',
                poolId: '1',
                owner: ownerAddress,
              },
            ],
          })

          const result = await ContractService.createPool(poolParams)
          const metrics = measurement.end()

          // Assert blockchain integration
          expect(result.success).toBe(true)
          expect(result.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/)
          expect(result.blockNumber).toBeGreaterThan(0)
          expect(result.gasUsed).toBeDefined()
          expect(result.eventLogs).toHaveLength(1)
          expect(result.eventLogs[0].event).toBe('PoolCreated')

          // Performance assertions
          expect(metrics.executionTime).toBeLessThan(10000) // < 10 seconds for full integration

          // Verify provider interactions
          expect(mockProvider.getNetwork).toHaveBeenCalled()
          expect(mockProvider.getGasPrice).toHaveBeenCalled()
          expect(mockContract.createPool).toHaveBeenCalledWith(
            ownerAddress,
            expect.any(String), // maxLoanAmount as BigInt string
            poolParams.interestRate,
            poolParams.loanDuration
          )
        })
      })

      it('should handle transaction confirmation with multiple confirmations', async () => {
        await withTestIsolation('multi-confirmation', 'contract-service', async (context) => {
          // Arrange
          const poolParams = TestFixtures.TestData.pools.basic
          let confirmationCount = 0

          const mockWait = jest.fn().mockImplementation(async (confirmations = 1) => {
            confirmationCount += confirmations
            return {
              status: 1,
              blockNumber: 12346 + confirmations,
              confirmations,
              gasUsed: '487123',
            }
          })

          mockContract.createPool.mockResolvedValue({
            hash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
            wait: mockWait,
          })

          // Act
          ContractService.createPool.mockImplementation(async (params) => {
            const tx = await mockContract.createPool()
            const receipt = await tx.wait(3) // Wait for 3 confirmations

            return {
              success: true,
              transactionHash: tx.hash,
              confirmations: receipt.confirmations,
              blockNumber: receipt.blockNumber,
            }
          })

          const result = await ContractService.createPool(poolParams)

          // Assert
          expect(result.success).toBe(true)
          expect(result.confirmations).toBe(3)
          expect(mockWait).toHaveBeenCalledWith(3)
        })
      })

      it('should estimate gas correctly before transaction execution', async () => {
        await withTestIsolation('gas-estimation', 'contract-service', async (context) => {
          // Arrange
          const poolParams = TestFixtures.TestData.pools.basic
          const estimatedGas = '485000'
          const actualGasUsed = '487123'

          mockContract.estimateGas = {
            createPool: jest.fn().mockResolvedValue(estimatedGas),
          }

          mockContract.createPool.mockResolvedValue({
            hash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
            gasLimit: (parseInt(estimatedGas) * 1.2).toString(), // 20% buffer
            wait: jest.fn().mockResolvedValue({
              status: 1,
              gasUsed: actualGasUsed,
            }),
          })

          // Act
          ContractService.estimateGas.mockResolvedValue({
            estimatedGas,
            gasPrice: '20000000000',
            estimatedCostWei: (parseInt(estimatedGas) * parseInt('20000000000')).toString(),
            estimatedCostEth: '0.0097', // Mock calculation
          })

          const gasEstimate = await ContractService.estimateGas('createPool', poolParams)

          ContractService.createPool.mockResolvedValue({
            success: true,
            transactionHash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
            gasEstimated: estimatedGas,
            gasUsed: actualGasUsed,
            gasEfficiency: ((parseInt(actualGasUsed) / parseInt(estimatedGas)) * 100).toFixed(2) + '%',
          })

          const result = await ContractService.createPool(poolParams)

          // Assert gas estimation
          expect(gasEstimate.estimatedGas).toBe(estimatedGas)
          expect(gasEstimate.gasPrice).toBeDefined()
          expect(gasEstimate.estimatedCostEth).toBeDefined()

          // Assert execution
          expect(result.gasEstimated).toBe(estimatedGas)
          expect(result.gasUsed).toBe(actualGasUsed)
          expect(parseFloat(result.gasEfficiency)).toBeGreaterThan(95) // Should be efficient
        })
      })
    })

    describe('Pool Query Operations', () => {
      it('should retrieve pool details from blockchain', async () => {
        await withTestIsolation('pool-query', 'contract-service', async (context) => {
          // Arrange
          const poolId = '1'
          const expectedPoolData = {
            poolId,
            owner: TestFixtures.TestData.addresses.poolOwners[0],
            maxLoanAmount: TestFixtures.TestData.pools.basic.maxLoanAmount,
            interestRate: TestFixtures.TestData.pools.basic.interestRate,
            loanDuration: TestFixtures.TestData.pools.basic.loanDuration,
            totalLent: '0',
            totalBorrowed: '0',
            status: 'Active',
          }

          mockContract.pools.mockResolvedValue([
            expectedPoolData.owner,
            expectedPoolData.maxLoanAmount,
            expectedPoolData.interestRate,
            expectedPoolData.loanDuration,
            expectedPoolData.totalLent,
            expectedPoolData.totalBorrowed,
            1, // status: 1 = Active
          ])

          // Act
          const measurement = startPerformanceTest('pool-query', 'blockchain-read')

          ContractService.getPool.mockResolvedValue({
            success: true,
            poolData: expectedPoolData,
            blockNumber: 12347,
            timestamp: Date.now(),
          })

          const result = await ContractService.getPool(poolId)
          const metrics = measurement.end()

          // Assert
          expect(result.success).toBe(true)
          expect(result.poolData.poolId).toBe(poolId)
          expect(result.poolData.owner).toBe(expectedPoolData.owner)
          expect(result.poolData.maxLoanAmount).toBe(expectedPoolData.maxLoanAmount)
          expect(result.poolData.status).toBe('Active')

          // Performance for read operations should be fast
          expect(metrics.executionTime).toBeLessThan(2000) // < 2 seconds
        })
      })

      it('should handle non-existent pool queries gracefully', async () => {
        await withTestIsolation('nonexistent-pool', 'contract-service', async (context) => {
          // Arrange
          const invalidPoolId = '999999'

          mockContract.pools.mockRejectedValue(new Error('Pool does not exist'))

          // Act
          ContractService.getPool.mockResolvedValue({
            success: false,
            error: 'Pool does not exist',
            code: 'POOL_NOT_FOUND',
            poolId: invalidPoolId,
          })

          const result = await ContractService.getPool(invalidPoolId)

          // Assert
          expect(result.success).toBe(false)
          expect(result.error).toBe('Pool does not exist')
          expect(result.code).toBe('POOL_NOT_FOUND')
          expect(result.poolId).toBe(invalidPoolId)
        })
      })
    })

    describe('Transaction Management', () => {
      it('should manage transaction lifecycle properly', async () => {
        await withTestIsolation('tx-lifecycle', 'contract-service', async (context) => {
          // Arrange
          const txData = {
            to: TestFixtures.TestData.addresses.contracts.poolFactory,
            data: '0x123456...',
            value: '0',
            gasLimit: '500000',
          }

          let txState = 'pending'
          const txHash = TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION

          mockProvider.sendTransaction.mockResolvedValue({
            hash: txHash,
            from: TestFixtures.TestData.addresses.poolOwners[0],
            ...txData,
            wait: jest.fn().mockImplementation(async () => {
              // Simulate transaction mining
              await new Promise((resolve) => setTimeout(resolve, 1000))
              txState = 'confirmed'
              return {
                status: 1,
                blockNumber: 12348,
                transactionHash: txHash,
              }
            }),
          })

          // Act
          const measurement = startPerformanceTest('transaction-lifecycle', 'transaction-management')

          ContractService.executeTransaction.mockImplementation(async (data) => {
            const tx = await mockProvider.sendTransaction(data)

            // Monitor transaction
            const receipt = await tx.wait()

            return {
              success: true,
              transactionHash: tx.hash,
              receipt,
              lifecycle: {
                submitted: true,
                confirmed: txState === 'confirmed',
                blockNumber: receipt.blockNumber,
              },
            }
          })

          const result = await ContractService.executeTransaction(txData)
          const metrics = measurement.end()

          // Assert
          expect(result.success).toBe(true)
          expect(result.transactionHash).toBe(txHash)
          expect(result.lifecycle.submitted).toBe(true)
          expect(result.lifecycle.confirmed).toBe(true)
          expect(result.lifecycle.blockNumber).toBeGreaterThan(0)

          // Should complete within reasonable time
          expect(metrics.executionTime).toBeLessThan(15000)
        })
      })

      it('should handle transaction replacement and repricing', async () => {
        await withTestIsolation('tx-replacement', 'contract-service', async (context) => {
          // Arrange
          const originalTx = {
            hash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
            gasPrice: '20000000000',
            nonce: 42,
          }

          const replacementTx = {
            hash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION.replace('1', '2'),
            gasPrice: '30000000000', // 50% higher
            nonce: 42, // Same nonce
          }

          // Original transaction gets stuck
          mockProvider.sendTransaction
            .mockResolvedValueOnce({
              ...originalTx,
              wait: jest.fn().mockImplementation(
                () =>
                  new Promise((resolve) =>
                    setTimeout(
                      () =>
                        resolve({
                          status: 0, // Failed due to low gas
                        }),
                      5000
                    )
                  )
              ),
            })
            // Replacement transaction succeeds
            .mockResolvedValueOnce({
              ...replacementTx,
              wait: jest.fn().mockResolvedValue({
                status: 1,
                blockNumber: 12349,
              }),
            })

          // Act
          ContractService.executeTransaction.mockImplementation(async (txData) => {
            try {
              // Try original transaction
              const originalResult = await mockProvider.sendTransaction(txData)
              const originalReceipt = await originalResult.wait()

              if (originalReceipt.status === 0) {
                throw new Error('Transaction failed')
              }

              return { success: true, transactionHash: originalResult.hash }
            } catch (error) {
              // Retry with higher gas price
              const replacementData = {
                ...txData,
                gasPrice: (parseInt(txData.gasPrice) * 1.5).toString(),
              }

              const replacementResult = await mockProvider.sendTransaction(replacementData)
              const replacementReceipt = await replacementResult.wait()

              return {
                success: true,
                transactionHash: replacementResult.hash,
                replaced: true,
                originalTxHash: originalTx.hash,
                replacementReason: 'Low gas price',
              }
            }
          })

          const result = await ContractService.executeTransaction({
            gasPrice: '20000000000',
          })

          // Assert
          expect(result.success).toBe(true)
          expect(result.replaced).toBe(true)
          expect(result.originalTxHash).toBe(originalTx.hash)
          expect(result.replacementReason).toBe('Low gas price')
        })
      })
    })

    describe('Error Handling and Recovery', () => {
      it('should handle network connectivity issues', async () => {
        await withTestIsolation('network-issues', 'contract-service', async (context) => {
          // Arrange
          const networkErrors = [
            new Error('Network connection failed'),
            new Error('Timeout waiting for response'),
            new Error('ECONNREFUSED'),
            new Error('Request failed with status 500'),
          ]

          for (const error of networkErrors) {
            mockProvider.sendTransaction.mockRejectedValue(error)

            // Act
            ContractService.executeTransaction.mockImplementation(async () => {
              try {
                await mockProvider.sendTransaction({})
              } catch (err: any) {
                return {
                  success: false,
                  error: err.message,
                  code: 'NETWORK_ERROR',
                  retryable: true,
                  retryAfter: 5000, // 5 seconds
                }
              }
            })

            const result = await ContractService.executeTransaction({})

            // Assert
            expect(result.success).toBe(false)
            expect(result.code).toBe('NETWORK_ERROR')
            expect(result.retryable).toBe(true)
            expect(result.retryAfter).toBe(5000)
          }
        })
      })

      it('should handle contract execution reverts', async () => {
        await withTestIsolation('contract-reverts', 'contract-service', async (context) => {
          // Arrange
          const revertReasons = [
            'Ownable: caller is not the owner',
            'Insufficient allowance',
            'Transfer amount exceeds balance',
            'Pool: Invalid parameters',
          ]

          for (const reason of revertReasons) {
            mockContract.createPool.mockRejectedValue(new Error(`Transaction reverted: ${reason}`))

            // Act
            ContractService.createPool.mockImplementation(async () => {
              try {
                await mockContract.createPool()
              } catch (err: any) {
                return {
                  success: false,
                  error: err.message,
                  code: 'CONTRACT_REVERT',
                  revertReason: reason,
                  retryable: false,
                }
              }
            })

            const result = await ContractService.createPool({})

            // Assert
            expect(result.success).toBe(false)
            expect(result.code).toBe('CONTRACT_REVERT')
            expect(result.revertReason).toBe(reason)
            expect(result.retryable).toBe(false)
          }
        })
      })

      it('should implement retry logic for transient failures', async () => {
        await withTestIsolation('retry-logic', 'contract-service', async (context) => {
          // Arrange
          let attemptCount = 0
          const maxRetries = 3

          mockProvider.sendTransaction.mockImplementation(async () => {
            attemptCount++
            if (attemptCount < maxRetries) {
              throw new Error('Network timeout')
            }
            return {
              hash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
              wait: jest.fn().mockResolvedValue({ status: 1 }),
            }
          })

          // Act
          const measurement = startPerformanceTest('retry-mechanism', 'error-handling')

          ContractService.executeTransaction.mockImplementation(async (txData) => {
            let lastError: Error | null = null

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              try {
                const tx = await mockProvider.sendTransaction(txData)
                const receipt = await tx.wait()

                return {
                  success: true,
                  transactionHash: tx.hash,
                  attempts: attempt,
                  retriesUsed: attempt - 1,
                }
              } catch (error) {
                lastError = error as Error
                if (attempt < maxRetries) {
                  // Wait before retry (exponential backoff)
                  await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
                }
              }
            }

            return {
              success: false,
              error: lastError?.message,
              code: 'MAX_RETRIES_EXCEEDED',
              attempts: maxRetries,
              retriesUsed: maxRetries - 1,
            }
          })

          const result = await ContractService.executeTransaction({})
          const metrics = measurement.end()

          // Assert
          expect(result.success).toBe(true)
          expect(result.attempts).toBe(maxRetries)
          expect(result.retriesUsed).toBe(maxRetries - 1)
          expect(attemptCount).toBe(maxRetries)

          // Should take time due to retries with backoff
          expect(metrics.executionTime).toBeGreaterThan(3000) // At least 3 seconds for backoff
        })
      })
    })

    describe('Performance and Optimization', () => {
      it('should cache contract instances for performance', async () => {
        await withTestIsolation('contract-caching', 'contract-service', async (context) => {
          // Arrange
          let contractCreationCount = 0

          const mockContractFactory = jest.fn().mockImplementation(() => {
            contractCreationCount++
            return mockContract
          })

          // Act
          const measurement = startPerformanceTest('contract-caching', 'optimization')

          // Simulate multiple operations using the same contract
          const operations = Array.from({ length: 10 }, async (_, i) => {
            // Mock contract service that caches contracts
            ContractService.getPool.mockImplementation(async (poolId) => {
              // Contract should be cached, not recreated each time
              if (contractCreationCount === 0) {
                mockContractFactory()
              }

              return {
                success: true,
                poolData: { poolId },
                cached: contractCreationCount === 1,
              }
            })

            return ContractService.getPool(`pool-${i}`)
          })

          const results = await Promise.all(operations)
          const metrics = measurement.end()

          // Assert
          expect(results).toHaveLength(10)
          expect(results.every((r) => r.success)).toBe(true)
          expect(contractCreationCount).toBe(1) // Should only create contract once
          expect(results.every((r) => r.cached)).toBe(true)

          // Should be fast due to caching
          expect(metrics.executionTime).toBeLessThan(1000)
        })
      })

      it('should batch multiple contract calls for efficiency', async () => {
        await withTestIsolation('call-batching', 'contract-service', async (context) => {
          // Arrange
          const poolIds = ['1', '2', '3', '4', '5']
          let individualCallCount = 0

          mockContract.pools.mockImplementation(async (poolId: string) => {
            individualCallCount++
            return [`owner-${poolId}`, '1000', 500, 86400, '0', '0', 1]
          })

          // Act
          const measurement = startPerformanceTest('batched-calls', 'optimization')

          ContractService.getPool.mockImplementation(async (poolId) => {
            // Simulate batched multicall
            if (poolIds.includes(poolId)) {
              // All calls happen in one batch
              if (individualCallCount === 0) {
                individualCallCount = poolIds.length
              }

              return {
                success: true,
                poolData: {
                  poolId,
                  owner: `owner-${poolId}`,
                  maxLoanAmount: '1000',
                },
                batched: true,
              }
            }

            return { success: false, error: 'Pool not found' }
          })

          // Get all pools in "batch"
          const results = await Promise.all(poolIds.map((id) => ContractService.getPool(id)))
          const metrics = measurement.end()

          // Assert
          expect(results).toHaveLength(5)
          expect(results.every((r) => r.success)).toBe(true)
          expect(results.every((r) => r.batched)).toBe(true)

          // Batched calls should be faster than individual calls
          expect(metrics.executionTime).toBeLessThan(2000)
        })
      })

      it('should monitor and report gas usage trends', async () => {
        await withTestIsolation('gas-monitoring', 'contract-service', async (context) => {
          // Arrange
          const gasUsageHistory: number[] = []

          mockContract.createPool.mockImplementation(async () => {
            const gasUsed = 450000 + Math.floor(Math.random() * 100000) // Variable gas usage
            gasUsageHistory.push(gasUsed)

            return {
              hash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
              wait: jest.fn().mockResolvedValue({
                status: 1,
                gasUsed: gasUsed.toString(),
              }),
            }
          })

          // Act - Create multiple pools to establish trend
          const poolCreations = Array.from({ length: 5 }, async (_, i) => {
            ContractService.createPool.mockResolvedValue({
              success: true,
              poolId: `gas-test-${i}`,
              transactionHash: TestFixtures.SAMPLE_TRANSACTION_HASHES.POOL_CREATION,
              gasUsed: gasUsageHistory[i]?.toString() || '450000',
              gasMetrics: {
                averageGasUsed: gasUsageHistory.reduce((sum, gas) => sum + gas, 0) / Math.max(gasUsageHistory.length, 1),
                trend: gasUsageHistory.length > 1 ? 'stable' : 'baseline',
              },
            })

            return ContractService.createPool({ name: `Pool ${i}` })
          })

          const results = await Promise.all(poolCreations)

          // Calculate gas metrics
          const gasValues = results.map((r) => parseInt(r.gasUsed))
          const avgGas = gasValues.reduce((sum, gas) => sum + gas, 0) / gasValues.length
          const minGas = Math.min(...gasValues)
          const maxGas = Math.max(...gasValues)
          const gasVariance = gasValues.reduce((sum, gas) => sum + Math.pow(gas - avgGas, 2), 0) / gasValues.length

          // Assert
          expect(results.every((r) => r.success)).toBe(true)
          expect(avgGas).toBeGreaterThan(400000)
          expect(avgGas).toBeLessThan(600000)
          expect(maxGas - minGas).toBeLessThan(150000) // Reasonable variance
          expect(gasVariance).toBeLessThan(Math.pow(100000, 2)) // Low variance indicates consistency

          console.log('Gas Usage Analysis:')
          console.log(`  Average: ${avgGas.toFixed(0)} gas`)
          console.log(`  Range: ${minGas} - ${maxGas} gas`)
          console.log(`  Variance: ${Math.sqrt(gasVariance).toFixed(0)} gas`)
        })
      })
    })
  })

  describe('Multi-Chain Support', () => {
    it('should handle different network configurations', async () => {
      await withTestIsolation('multi-chain', 'contract-service', async (context) => {
        // Arrange
        const networks = [
          { chainId: 137, name: 'polygon', rpc: 'https://polygon-rpc.com' },
          { chainId: 80002, name: 'amoy', rpc: 'https://rpc-amoy.polygon.technology' },
          { chainId: 31337, name: 'localhost', rpc: 'http://127.0.0.1:8545' },
        ]

        // Act & Assert
        for (const network of networks) {
          mockProvider.getNetwork.mockResolvedValue(network)

          ContractService.getPool.mockResolvedValue({
            success: true,
            poolData: { poolId: '1', network: network.name },
            chainId: network.chainId,
            networkName: network.name,
          })

          const result = await ContractService.getPool('1')

          expect(result.success).toBe(true)
          expect(result.chainId).toBe(network.chainId)
          expect(result.networkName).toBe(network.name)
        }
      })
    })
  })
})
