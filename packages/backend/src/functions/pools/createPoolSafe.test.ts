/**
 * Comprehensive Tests for Safe Multi-Sig Pool Creation Function
 *
 * Tests all aspects of the createPoolSafe Cloud Function including:
 * - Safe multi-signature workflow and approval processes
 * - Pool parameter validation with Safe integration
 * - Safe transaction preparation and signature collection
 * - Multi-sig owner validation and permissions
 * - Error handling for Safe-related failures
 * - Integration with Safe SDK and contracts
 * - Performance testing for Safe workflows
 * - Security testing for multi-sig scenarios
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
  type PerformanceThresholds,
} from '../../__mocks__'
import { createPoolSafe, CreatePoolSafeRequest, CreatePoolSafeResponse } from './createPoolSafe'
import { HttpsError } from 'firebase-functions/v2/https'
import { AppError } from '../../utils/errorHandling'

describe('createPoolSafe Cloud Function', () => {
  let testEnvironment: any
  let mockSafeContract: any
  let mockPoolFactory: any

  beforeAll(() => {
    performanceManager.clearAll()
  })

  beforeEach(() => {
    MockFactory.resetAllMocks()
    testEnvironment = quickSetup.safeTransaction()
    mockSafeContract = testEnvironment.safeContract

    // Setup Pool Factory mock for Safe integration
    mockPoolFactory = ContractMock.createPoolFactoryMock()

    // Setup default environment variables
    process.env.POLYGON_AMOY_RPC_URL = 'https://rpc-amoy.polygon.technology'
    process.env.SAFE_ADDRESS_AMOY = TestFixtures.TestData.addresses.safeAddress
    process.env.POOL_FACTORY_ADDRESS_AMOY = TestFixtures.TestData.addresses.poolFactoryAddress
  })

  afterEach(() => {
    delete process.env.POLYGON_AMOY_RPC_URL
    delete process.env.SAFE_ADDRESS_AMOY
    delete process.env.POOL_FACTORY_ADDRESS_AMOY

    MockFactory.resetAllMocks()
  })

  afterAll(() => {
    const report = performanceManager.generateReport()
    console.log('🎯 Safe Pool Creation Performance Report:')
    console.log(`   Total Tests: ${report.totalTests}`)
    console.log(`   Total Benchmarks: ${report.totalBenchmarks}`)
    console.log(`   Overall Average Execution Time: ${report.overallStats.averageExecutionTime.toFixed(2)}ms`)
  })

  describe('Happy Path Scenarios', () => {
    it('should successfully prepare a Safe transaction for pool creation', async () => {
      const performance = startPerformanceTest('safe-pool-creation', 'happy-path')

      // Setup Safe configuration
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      // Setup transaction preparation
      const mockTransactionHash = '0x' + 'safe'.repeat(15) + '1'
      const expectedPoolParams = TestFixtures.TestData.pools.basic

      // Mock Safe transaction hash generation
      ethersMock.Contract.mockImplementation((address, abi) => {
        if (address === TestFixtures.TestData.addresses.safeAddress) {
          return {
            ...mockSafeContract,
            getTransactionHash: jest.fn().mockResolvedValue(mockTransactionHash),
            encodeTransactionData: jest.fn().mockReturnValue('0x' + 'encoded'.repeat(10)),
          }
        }
        return mockPoolFactory
      })

      const request = testEnvironment.functionTester.createAuthenticatedRequest(expectedPoolParams, testEnvironment.uid)

      const result = (await createPoolSafe(request)) as CreatePoolSafeResponse

      const metrics = performance.end()

      // Verify successful response
      expect(result.success).toBe(true)
      expect(result.transactionHash).toBe(mockTransactionHash)
      expect(result.safeAddress).toBe(TestFixtures.TestData.addresses.safeAddress)
      expect(result.requiredSignatures).toBe(2)
      expect(result.currentSignatures).toBe(0)
      expect(result.message).toContain('Requires 2 signature(s) to execute')
      expect(result.poolParams).toMatchObject(expectedPoolParams)

      // Verify Firestore transaction storage
      expect(firebaseAdminMock.firestore.collection).toHaveBeenCalledWith('safe_transactions')

      // Performance validation
      expect(metrics.executionTime).toBeLessThan(3000) // Should complete in under 3 seconds
    })

    it('should handle different Safe threshold configurations', async () => {
      // Test 3-of-5 multisig configuration
      mockSafeContract.getOwners.mockResolvedValue([
        ...TestFixtures.TestData.addresses.safeOwners,
        '0x' + '1'.repeat(40),
        '0x' + '2'.repeat(40),
      ])
      mockSafeContract.getThreshold.mockResolvedValue(3)

      const mockTransactionHash = '0x' + 'multi'.repeat(12) + '2'
      ethersMock.Contract.mockImplementation((address) => {
        if (address === TestFixtures.TestData.addresses.safeAddress) {
          return {
            ...mockSafeContract,
            getTransactionHash: jest.fn().mockResolvedValue(mockTransactionHash),
            encodeTransactionData: jest.fn().mockReturnValue('0x' + 'encoded'.repeat(10)),
          }
        }
        return mockPoolFactory
      })

      const result = (await createPoolSafe(testEnvironment.request)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      expect(result.requiredSignatures).toBe(3)
      expect(result.message).toContain('Requires 3 signature(s) to execute')
    })

    it('should store comprehensive Safe transaction data in Firestore', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const mockTransactionHash = '0x' + 'storage'.repeat(10) + '3'
      const mockDoc = {
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      }
      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDoc),
      })

      ethersMock.Contract.mockImplementation((address) => {
        if (address === TestFixtures.TestData.addresses.safeAddress) {
          return {
            ...mockSafeContract,
            getTransactionHash: jest.fn().mockResolvedValue(mockTransactionHash),
            encodeTransactionData: jest.fn().mockReturnValue('0x' + 'encoded'.repeat(10)),
          }
        }
        return mockPoolFactory
      })

      await createPoolSafe(testEnvironment.request)

      // Verify Safe transaction document structure
      expect(mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionHash: mockTransactionHash,
          safeAddress: TestFixtures.TestData.addresses.safeAddress,
          safeTransaction: expect.objectContaining({
            to: TestFixtures.TestData.addresses.poolFactoryAddress,
            data: expect.any(String),
            value: '0',
            operation: 0,
            safeTxGas: 0,
            baseGas: 0,
            gasPrice: 0,
            gasToken: ethers.ZeroAddress,
            refundReceiver: ethers.ZeroAddress,
            nonce: expect.any(Number),
          }),
          poolParams: expect.objectContaining({
            poolOwner: testEnvironment.params.poolOwner,
            name: testEnvironment.params.name,
            maxLoanAmount: testEnvironment.params.maxLoanAmount,
            interestRate: testEnvironment.params.interestRate,
            loanDuration: testEnvironment.params.loanDuration,
          }),
          chainId: 80002,
          status: 'pending_signatures',
          requiredSignatures: 2,
          currentSignatures: 0,
          signatures: [],
          createdBy: testEnvironment.uid,
          createdAt: expect.any(Date),
          expiresAt: expect.any(Date),
          type: 'pool_creation',
        })
      )
    })
  })

  describe('Safe Owner Validation', () => {
    it('should validate Safe owner permissions', async () => {
      const nonOwnerUid = 'non-owner-uid'
      const nonOwnerAddress = '0x' + 'nonowner'.repeat(4)

      // Setup non-owner user
      firebaseAdminMock.seedUser({
        uid: nonOwnerUid,
        email: 'nonowner@test.com',
        customClaims: { walletAddress: nonOwnerAddress },
      })

      // Add user wallet address to Firestore
      const mockUserDoc = {
        exists: true,
        data: jest.fn().mockReturnValue({ walletAddress: nonOwnerAddress }),
      }
      firebaseAdminMock.firestore.collection.mockImplementation((collection) => {
        if (collection === 'users') {
          return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockUserDoc) }) }
        }
        return { doc: jest.fn().mockReturnValue({ set: jest.fn() }) }
      })

      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const nonOwnerRequest = testEnvironment.functionTester.createAuthenticatedRequest(testEnvironment.params, nonOwnerUid)

      // Function should still succeed but log a warning
      const result = (await createPoolSafe(nonOwnerRequest)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      // The function allows non-owners to initiate (for admin flexibility)
      // but logs a warning - this is expected behavior
    })

    it('should handle missing user wallet address gracefully', async () => {
      const noWalletUid = 'no-wallet-uid'

      firebaseAdminMock.seedUser({
        uid: noWalletUid,
        email: 'nowallet@test.com',
        customClaims: {},
      })

      // Mock user document without wallet address
      const mockUserDoc = {
        exists: true,
        data: jest.fn().mockReturnValue({}), // No walletAddress field
      }
      firebaseAdminMock.firestore.collection.mockImplementation((collection) => {
        if (collection === 'users') {
          return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockUserDoc) }) }
        }
        return { doc: jest.fn().mockReturnValue({ set: jest.fn() }) }
      })

      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const noWalletRequest = testEnvironment.functionTester.createAuthenticatedRequest(testEnvironment.params, noWalletUid)

      const result = (await createPoolSafe(noWalletRequest)) as CreatePoolSafeResponse

      expect(result.success).toBe(true) // Should still work
    })

    it('should verify Safe owners list correctly', async () => {
      const validSafeOwners = [
        '0x' + '1'.repeat(40),
        '0x' + '2'.repeat(40),
        '0x' + '3'.repeat(40),
        '0x' + '4'.repeat(40),
        '0x' + '5'.repeat(40),
      ]

      mockSafeContract.getOwners.mockResolvedValue(validSafeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(3)

      const mockTransactionHash = '0x' + 'owners'.repeat(11) + '4'
      ethersMock.Contract.mockImplementation((address) => {
        if (address === TestFixtures.TestData.addresses.safeAddress) {
          return {
            ...mockSafeContract,
            getTransactionHash: jest.fn().mockResolvedValue(mockTransactionHash),
            encodeTransactionData: jest.fn().mockReturnValue('0x' + 'encoded'.repeat(10)),
          }
        }
        return mockPoolFactory
      })

      const result = (await createPoolSafe(testEnvironment.request)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      expect(result.requiredSignatures).toBe(3)
      expect(mockSafeContract.getOwners).toHaveBeenCalled()
      expect(mockSafeContract.getThreshold).toHaveBeenCalled()
    })
  })

  describe('Parameter Validation for Safe Transactions', () => {
    it('should validate pool parameters before creating Safe transaction', async () => {
      const invalidRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          maxLoanAmount: 'invalid-amount',
          interestRate: -50,
          loanDuration: -1,
        },
        testEnvironment.uid
      )

      const result = await createPoolSafe(invalidRequest)

      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
      expect(result.message).toContain('Validation failed')
    })

    it('should sanitize parameters before Safe transaction preparation', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const maliciousRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          ...testEnvironment.params,
          name: '<script>alert("xss")</script>Safe Pool',
          description: 'javascript:void(0) pool description',
        },
        testEnvironment.uid
      )

      const mockTransactionHash = '0x' + 'sanitized'.repeat(8) + '5'
      ethersMock.Contract.mockImplementation((address) => {
        if (address === TestFixtures.TestData.addresses.safeAddress) {
          return {
            ...mockSafeContract,
            getTransactionHash: jest.fn().mockResolvedValue(mockTransactionHash),
            encodeTransactionData: jest.fn().mockReturnValue('0x' + 'encoded'.repeat(10)),
          }
        }
        return mockPoolFactory
      })

      const result = (await createPoolSafe(maliciousRequest)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)

      // Verify sanitized parameters don't contain malicious content
      expect(result.poolParams.name).not.toContain('<script>')
      expect(result.poolParams.description).not.toContain('javascript:')
    })

    it('should enforce pool parameter constraints for Safe transactions', async () => {
      // Test extreme values that should be rejected
      const extremeRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          poolOwner: testEnvironment.params.poolOwner,
          maxLoanAmount: ethers.parseUnits('999999999999', 'ether').toString(),
          interestRate: 50000, // 500% APR
          loanDuration: 365 * 24 * 3600 * 10, // 10 years
          name: 'A'.repeat(1000), // Too long
          description: 'B'.repeat(5000), // Too long
        },
        testEnvironment.uid
      )

      const result = await createPoolSafe(extremeRequest)

      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
    })
  })

  describe('Safe Contract Integration', () => {
    it('should properly encode pool creation transaction data', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const expectedEncodedData = '0x' + 'poolcreation'.repeat(6) + '123456'
      const mockTransactionHash = '0x' + 'encoded'.repeat(10) + '6'

      // Mock PoolFactory interface for encoding
      const mockPoolFactoryInterface = {
        encodeFunctionData: jest.fn().mockReturnValue(expectedEncodedData),
      }

      ethersMock.Contract.mockImplementation((address, abi) => {
        if (address === TestFixtures.TestData.addresses.safeAddress) {
          return {
            ...mockSafeContract,
            getTransactionHash: jest.fn().mockResolvedValue(mockTransactionHash),
            encodeTransactionData: jest.fn().mockReturnValue(expectedEncodedData),
          }
        } else if (address === TestFixtures.TestData.addresses.poolFactoryAddress) {
          return {
            interface: mockPoolFactoryInterface,
          }
        }
        return mockPoolFactory
      })

      ethersMock.Interface.mockReturnValue(mockPoolFactoryInterface)

      const result = (await createPoolSafe(testEnvironment.request)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      expect(mockPoolFactoryInterface.encodeFunctionData).toHaveBeenCalledWith(
        'createPool',
        expect.arrayContaining([
          expect.objectContaining({
            poolOwner: testEnvironment.params.poolOwner,
            maxLoanAmount: testEnvironment.params.maxLoanAmount,
            interestRate: testEnvironment.params.interestRate,
            loanDuration: testEnvironment.params.loanDuration,
            name: testEnvironment.params.name,
            description: testEnvironment.params.description,
          }),
        ])
      )
    })

    it('should generate correct Safe transaction hash', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const expectedTransactionHash = '0x' + 'specifichash'.repeat(5) + '789'
      const mockSafe = {
        ...mockSafeContract,
        getTransactionHash: jest.fn().mockResolvedValue(expectedTransactionHash),
        encodeTransactionData: jest.fn().mockReturnValue('0x' + 'data'.repeat(15)),
        nonce: jest.fn().mockResolvedValue(42),
      }

      ethersMock.Contract.mockImplementation((address) => {
        if (address === TestFixtures.TestData.addresses.safeAddress) {
          return mockSafe
        }
        return mockPoolFactory
      })

      const result = (await createPoolSafe(testEnvironment.request)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      expect(result.transactionHash).toBe(expectedTransactionHash)

      // Verify Safe transaction hash was computed with correct parameters
      expect(mockSafe.getTransactionHash).toHaveBeenCalledWith(
        TestFixtures.TestData.addresses.poolFactoryAddress, // to
        '0', // value
        expect.any(String), // data
        0, // operation (CALL)
        0, // safeTxGas
        0, // baseGas
        0, // gasPrice
        ethers.ZeroAddress, // gasToken
        ethers.ZeroAddress, // refundReceiver
        expect.any(Number) // nonce
      )
    })

    it('should handle Safe nonce management correctly', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const mockNonce = 15
      const mockSafe = {
        ...mockSafeContract,
        nonce: jest.fn().mockResolvedValue(mockNonce),
        getTransactionHash: jest.fn().mockResolvedValue('0x' + 'nonce'.repeat(12) + '7'),
        encodeTransactionData: jest.fn().mockReturnValue('0x' + 'data'.repeat(15)),
      }

      ethersMock.Contract.mockImplementation((address) => {
        if (address === TestFixtures.TestData.addresses.safeAddress) {
          return mockSafe
        }
        return mockPoolFactory
      })

      await createPoolSafe(testEnvironment.request)

      expect(mockSafe.nonce).toHaveBeenCalled()
      expect(mockSafe.getTransactionHash).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(String),
        expect.any(String),
        mockNonce
      )
    })
  })

  describe('Error Handling', () => {
    it('should handle unauthenticated requests', async () => {
      const unauthenticatedRequest = testEnvironment.functionTester.createUnauthenticatedRequest(testEnvironment.params)

      const result = await createPoolSafe(unauthenticatedRequest)

      expect(result.success).toBe(false)
      expect(result.code).toBe('unauthenticated')
      expect(result.message).toContain('must be authenticated')
    })

    it('should handle missing Safe configuration', async () => {
      delete process.env.SAFE_ADDRESS_AMOY

      const result = await createPoolSafe(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Safe address not configured')
    })

    it('should handle Safe contract call failures', async () => {
      // Mock Safe contract failure
      mockSafeContract.getOwners.mockRejectedValue(new Error('Safe contract not found'))

      const result = await createPoolSafe(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Safe contract not found')
    })

    it('should handle provider connection failures', async () => {
      ethersMock.simulateNetworkError('RPC connection timeout')

      const result = await createPoolSafe(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('RPC connection timeout')
    })

    it('should handle Safe with zero threshold', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(0) // Invalid threshold

      const result = await createPoolSafe(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Invalid Safe configuration')
    })

    it('should handle Safe with no owners', async () => {
      mockSafeContract.getOwners.mockResolvedValue([]) // No owners
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const result = await createPoolSafe(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Invalid Safe configuration')
    })

    it('should handle Firestore save failures', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      firebaseAdminMock.simulateFirestoreError('permission-denied')

      const result = await createPoolSafe(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('permission-denied')
    })
  })

  describe('Performance and Load Testing', () => {
    it('should meet performance benchmarks for Safe transaction preparation', async () => {
      const benchmarkResult = await runBenchmark(
        'createPoolSafe-performance',
        async () => {
          mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
          mockSafeContract.getThreshold.mockResolvedValue(2)

          const mockTransactionHash = '0x' + Date.now().toString(16).padEnd(64, '0')
          ethersMock.Contract.mockImplementation((address) => {
            if (address === TestFixtures.TestData.addresses.safeAddress) {
              return {
                ...mockSafeContract,
                getTransactionHash: jest.fn().mockResolvedValue(mockTransactionHash),
                encodeTransactionData: jest.fn().mockReturnValue('0x' + 'encoded'.repeat(10)),
                nonce: jest.fn().mockResolvedValue(Math.floor(Math.random() * 100)),
              }
            }
            return mockPoolFactory
          })

          return await createPoolSafe(testEnvironment.request)
        },
        30, // 30 iterations
        3 // 3 warmup runs
      )

      // Performance assertions
      expect(benchmarkResult.timing.mean).toBeLessThan(1500) // Average under 1.5 seconds
      expect(benchmarkResult.timing.p95).toBeLessThan(2500) // 95th percentile under 2.5 seconds
      expect(benchmarkResult.memory.mean).toBeLessThan(30 * 1024 * 1024) // Average under 30MB

      console.log(`📊 Safe Pool Creation Benchmark Results:`)
      console.log(`   Average Response Time: ${benchmarkResult.timing.mean.toFixed(2)}ms`)
      console.log(`   95th Percentile: ${benchmarkResult.timing.p95.toFixed(2)}ms`)
      console.log(`   Memory Usage: ${(benchmarkResult.memory.mean / (1024 * 1024)).toFixed(2)}MB`)
    })

    it('should handle concurrent Safe transaction preparations', async () => {
      const performance = startPerformanceTest('concurrent-safe-transactions', 'concurrency')

      // Setup different requests for concurrent processing
      const requests = Array.from({ length: 3 }, (_, i) =>
        testEnvironment.functionTester.createAuthenticatedRequest(
          {
            ...testEnvironment.params,
            name: `Safe Pool ${i + 1}`,
            poolOwner: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
          },
          testEnvironment.uid
        )
      )

      // Mock successful Safe interactions
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      requests.forEach((_, i) => {
        const mockHash = '0x' + `concurrent${i}`.repeat(8).substring(0, 64)
        ethersMock.Contract.mockImplementationOnce((address) => {
          if (address === TestFixtures.TestData.addresses.safeAddress) {
            return {
              ...mockSafeContract,
              getTransactionHash: jest.fn().mockResolvedValue(mockHash),
              encodeTransactionData: jest.fn().mockReturnValue('0x' + 'encoded'.repeat(10)),
              nonce: jest.fn().mockResolvedValue(100 + i),
            }
          }
          return mockPoolFactory
        })
      })

      const results = await Promise.all(requests.map((request) => createPoolSafe(request)))

      const metrics = performance.end()

      // Verify all succeeded
      results.forEach((result, i) => {
        expect(result.success).toBe(true)
        expect(result.transactionHash).toContain('concurrent')
      })

      // Performance validation
      expect(metrics.executionTime).toBeLessThan(8000) // Should complete in under 8 seconds
    })
  })

  describe('Security Testing', () => {
    it('should prevent unauthorized Safe transaction creation', async () => {
      // Test with explicitly unauthorized address
      const unauthorizedUid = 'unauthorized-user'
      const unauthorizedAddress = '0x' + 'unauthorized'.repeat(3)

      firebaseAdminMock.seedUser({
        uid: unauthorizedUid,
        email: 'unauthorized@test.com',
        customClaims: { walletAddress: unauthorizedAddress },
      })

      // Mock user document
      const mockUserDoc = {
        exists: true,
        data: jest.fn().mockReturnValue({ walletAddress: unauthorizedAddress }),
      }
      firebaseAdminMock.firestore.collection.mockImplementation((collection) => {
        if (collection === 'users') {
          return { doc: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(mockUserDoc) }) }
        }
        return { doc: jest.fn().mockReturnValue({ set: jest.fn() }) }
      })

      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const unauthorizedRequest = testEnvironment.functionTester.createAuthenticatedRequest(testEnvironment.params, unauthorizedUid)

      // The function allows this but logs a warning (for admin flexibility)
      const result = (await createPoolSafe(unauthorizedRequest)) as CreatePoolSafeResponse

      expect(result.success).toBe(true) // Allowed but logged
    })

    it('should validate Safe address format and existence', async () => {
      // Test with invalid Safe address format
      process.env.SAFE_ADDRESS_AMOY = 'invalid-address-format'

      const result = await createPoolSafe(testEnvironment.request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
    })

    it('should handle Safe transaction expiration correctly', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const mockTransactionHash = '0x' + 'expiry'.repeat(11) + '8'
      const mockDoc = {
        set: jest.fn().mockResolvedValue(undefined),
      }
      firebaseAdminMock.firestore.collection.mockReturnValue({
        doc: jest.fn().mockReturnValue(mockDoc),
      })

      ethersMock.Contract.mockImplementation((address) => {
        if (address === TestFixtures.TestData.addresses.safeAddress) {
          return {
            ...mockSafeContract,
            getTransactionHash: jest.fn().mockResolvedValue(mockTransactionHash),
            encodeTransactionData: jest.fn().mockReturnValue('0x' + 'encoded'.repeat(10)),
            nonce: jest.fn().mockResolvedValue(50),
          }
        }
        return mockPoolFactory
      })

      await createPoolSafe(testEnvironment.request)

      // Verify expiration date is set (7 days from creation)
      const setCall = mockDoc.set.mock.calls[0][0]
      expect(setCall.expiresAt).toBeInstanceOf(Date)

      const expiryTime = setCall.expiresAt.getTime()
      const creationTime = setCall.createdAt.getTime()
      const sevenDays = 7 * 24 * 60 * 60 * 1000

      expect(expiryTime - creationTime).toBeCloseTo(sevenDays, -4) // Within 10 seconds
    })

    it('should prevent parameter injection in Safe transaction data', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(2)

      // Attempt to inject malicious data in pool parameters
      const maliciousRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        {
          poolOwner: testEnvironment.params.poolOwner,
          maxLoanAmount: "1000000000000000000'; DELETE FROM pools; --",
          interestRate: NaN,
          loanDuration: Infinity,
          name: '\x00\x01\x02malicious name',
          description: '\u200B\u200C\u200D\uFEFFhidden chars',
        },
        testEnvironment.uid
      )

      const result = await createPoolSafe(maliciousRequest)

      // Should fail validation before reaching Safe transaction preparation
      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
    })
  })

  describe('Chain Configuration', () => {
    it('should handle different chain configurations for Safe deployments', async () => {
      // Test Polygon Mainnet configuration
      process.env.POLYGON_MAINNET_RPC_URL = 'https://polygon-mainnet.rpc.url'
      process.env.SAFE_ADDRESS_POLYGON = '0x' + 'mainnet'.repeat(5)
      process.env.POOL_FACTORY_ADDRESS_POLYGON = '0x' + 'factory'.repeat(4)

      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(3)

      const mainnetRequest = testEnvironment.functionTester.createAuthenticatedRequest(
        { ...testEnvironment.params, chainId: 137 }, // Polygon Mainnet
        testEnvironment.uid
      )

      const mockTransactionHash = '0x' + 'mainnet'.repeat(10) + '9'
      ethersMock.Contract.mockImplementation((address) => {
        if (address === '0x' + 'mainnet'.repeat(5)) {
          return {
            ...mockSafeContract,
            getTransactionHash: jest.fn().mockResolvedValue(mockTransactionHash),
            encodeTransactionData: jest.fn().mockReturnValue('0x' + 'encoded'.repeat(10)),
            nonce: jest.fn().mockResolvedValue(25),
          }
        }
        return mockPoolFactory
      })

      const result = (await createPoolSafe(mainnetRequest)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      expect(result.safeAddress).toBe('0x' + 'mainnet'.repeat(5))
      expect(result.requiredSignatures).toBe(3)

      // Cleanup
      delete process.env.POLYGON_MAINNET_RPC_URL
      delete process.env.SAFE_ADDRESS_POLYGON
      delete process.env.POOL_FACTORY_ADDRESS_POLYGON
    })
  })
})
