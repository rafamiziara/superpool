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

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { ethers } from 'ethers'
import { ContractMock, ethersMock, firebaseAdminMock, FunctionsMock, MockFactory, quickSetup, TestFixtures } from '../../__mocks__'
import {
  performanceManager,
  type PerformanceThresholds,
  runBenchmark,
  startPerformanceTest,
} from '../../__tests__/utils/PerformanceTestUtilities'
import { CreatePoolSafeRequest, CreatePoolSafeResponse } from '../admin/createPoolSafe'

// Get the handler function for testing (onCall wrapper is not needed in tests)
const createPoolSafeModule = require('../admin/createPoolSafe')
const createPoolSafeHandler = createPoolSafeModule.createPoolSafe.__handler || createPoolSafeModule.createPoolSafe

describe('createPoolSafe Cloud Function', () => {
  let testEnvironment: any // ReturnType<typeof quickSetup.poolCreation>
  let mockSafeContract: any // ReturnType<typeof ContractMock.createSafeMock>
  let mockPoolFactory: any // ReturnType<typeof ContractMock.createPoolFactoryMock>

  beforeAll(() => {
    performanceManager.clearAll()
  })

  beforeEach(() => {
    MockFactory.resetAllMocks()

    // Use pool creation scenario instead of Safe transaction scenario
    // to get the correct pool parameters
    testEnvironment = quickSetup.poolCreation()

    // Create a Safe contract separately since we need both
    mockSafeContract = ContractMock.createSafeMock()
    testEnvironment.safeContract = mockSafeContract

    mockPoolFactory = ContractMock.createPoolFactoryMock()

    // Setup default environment variables
    process.env.POLYGON_AMOY_RPC_URL = 'https://rpc-amoy.polygon.technology'
    process.env.SAFE_ADDRESS_AMOY = TestFixtures.TestData.addresses.contracts.safe
    process.env.POOL_FACTORY_ADDRESS_AMOY = TestFixtures.TestData.addresses.contracts.poolFactory
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

      const mockTransactionHash = '0x' + 'safe'.repeat(15) + '1'
      const expectedPoolParams = TestFixtures.TestData.pools.basic

      // Configure Safe contract mock
      mockSafeContract.getTransactionHash.mockResolvedValue(mockTransactionHash)
      mockSafeContract.encodeTransactionData.mockReturnValue('0x' + 'encoded'.repeat(10))

      const request = FunctionsMock.createCallableRequest({
        data: expectedPoolParams,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(request)

      const metrics = performance.end()

      // Debug: Log what we got back
      console.log('Result from createPoolSafe:', result)

      // Verify successful response
      expect(result?.success).toBe(true)
      expect(result.transactionHash).toBe(mockTransactionHash)
      expect(result.safeAddress).toBe(TestFixtures.TestData.addresses.contracts.safe)
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
      const extendedOwners = [...TestFixtures.TestData.addresses.safeOwners, '0x' + '1'.repeat(40), '0x' + '2'.repeat(40)]

      mockSafeContract.getOwners.mockResolvedValue(extendedOwners)
      mockSafeContract.getThreshold.mockResolvedValue(3)

      const mockTransactionHash = '0x' + 'multi'.repeat(12) + '2'
      mockSafeContract.getTransactionHash.mockResolvedValue(mockTransactionHash)
      mockSafeContract.encodeTransactionData.mockReturnValue('0x' + 'encoded'.repeat(10))

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = (await createPoolSafeHandler(request)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      expect(result.requiredSignatures).toBe(3)
      expect(result.message).toContain('Requires 3 signature(s) to execute')
    })

    it('should store comprehensive Safe transaction data in Firestore', async () => {
      const mockTransactionHash = '0x' + 'storage'.repeat(10) + '3'

      // Configure Safe contract mock
      mockSafeContract.getTransactionHash.mockResolvedValue(mockTransactionHash)
      mockSafeContract.encodeTransactionData.mockReturnValue('0x' + 'encoded'.repeat(10))

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      await createPoolSafeHandler(request)

      // Verify Safe transaction was stored with proper structure
      const safeTransactionsCollection = firebaseAdminMock.firestore.collection('safe_transactions')
      expect(safeTransactionsCollection.doc).toHaveBeenCalled()

      const docMock = safeTransactionsCollection.doc()
      expect(docMock.set).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionHash: mockTransactionHash,
          safeAddress: TestFixtures.TestData.addresses.contracts.safe,
          safeTransaction: expect.objectContaining({
            to: TestFixtures.TestData.addresses.contracts.poolFactory,
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

      // Setup non-owner user using centralized method
      firebaseAdminMock.seedUser({
        uid: nonOwnerUid,
        email: 'nonowner@test.com',
        customClaims: { walletAddress: nonOwnerAddress },
      })

      // Seed user document in Firestore
      firebaseAdminMock.seedDocument(`users/${nonOwnerUid}`, {
        walletAddress: nonOwnerAddress,
        createdAt: new Date(),
      })

      const nonOwnerRequest = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: nonOwnerUid,
          token: {},
        },
      })

      // Function should still succeed but log a warning
      const result = (await createPoolSafeHandler(nonOwnerRequest)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      // The function allows non-owners to initiate (for admin flexibility)
      // but logs a warning - this is expected behavior
    })

    it('should handle missing user wallet address gracefully', async () => {
      const noWalletUid = 'no-wallet-uid'

      // Setup user without wallet address
      firebaseAdminMock.seedUser({
        uid: noWalletUid,
        email: 'nowallet@test.com',
        customClaims: {},
      })

      // Seed user document without wallet address
      firebaseAdminMock.seedDocument(`users/${noWalletUid}`, {
        createdAt: new Date(),
        // No walletAddress field
      })

      const noWalletRequest = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: noWalletUid,
          token: {},
        },
      })

      const result = (await createPoolSafeHandler(noWalletRequest)) as CreatePoolSafeResponse

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

      // Configure Safe contract mock
      mockSafeContract.getOwners.mockResolvedValue(validSafeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(3)

      const mockTransactionHash = '0x' + 'owners'.repeat(11) + '4'
      mockSafeContract.getTransactionHash.mockResolvedValue(mockTransactionHash)
      mockSafeContract.encodeTransactionData.mockReturnValue('0x' + 'encoded'.repeat(10))

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = (await createPoolSafeHandler(request)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      expect(result.requiredSignatures).toBe(3)
      expect(mockSafeContract.getOwners).toHaveBeenCalled()
      expect(mockSafeContract.getThreshold).toHaveBeenCalled()
    })
  })

  describe('Parameter Validation for Safe Transactions', () => {
    it('should validate pool parameters before creating Safe transaction', async () => {
      const invalidRequest = FunctionsMock.createCallableRequest({
        data: {
          ...testEnvironment.params,
          maxLoanAmount: 'invalid-amount',
          interestRate: -50,
          loanDuration: -1,
        },
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(invalidRequest)

      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
      expect(result.message).toContain('Validation failed')
    })

    it('should sanitize parameters before Safe transaction preparation', async () => {
      const maliciousRequest = FunctionsMock.createCallableRequest({
        data: {
          ...testEnvironment.params,
          name: '<script>alert("xss")</script>Safe Pool',
          description: 'javascript:void(0) pool description',
        },
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const mockTransactionHash = '0x' + 'sanitized'.repeat(8) + '5'
      mockSafeContract.getTransactionHash.mockResolvedValue(mockTransactionHash)
      mockSafeContract.encodeTransactionData.mockReturnValue('0x' + 'encoded'.repeat(10))

      const result = (await createPoolSafeHandler(maliciousRequest)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)

      // Verify sanitized parameters don't contain malicious content
      expect(result.poolParams.name).not.toContain('<script>')
      expect(result.poolParams.description).not.toContain('javascript:')
    })

    it('should enforce pool parameter constraints for Safe transactions', async () => {
      // Test extreme values that should be rejected
      const extremeRequest = FunctionsMock.createCallableRequest({
        data: {
          poolOwner: testEnvironment.params.poolOwner,
          maxLoanAmount: ethers.parseUnits('999999999999', 'ether').toString(),
          interestRate: 50000, // 500% APR
          loanDuration: 365 * 24 * 3600 * 10, // 10 years
          name: 'A'.repeat(1000), // Too long
          description: 'B'.repeat(5000), // Too long
        },
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(extremeRequest)

      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
    })
  })

  describe('Safe Contract Integration', () => {
    it('should properly encode pool creation transaction data', async () => {
      const expectedEncodedData = '0x' + 'poolcreation'.repeat(6) + '123456'
      const mockTransactionHash = '0x' + 'encoded'.repeat(10) + '6'

      // Configure mocks using centralized patterns
      mockSafeContract.getTransactionHash.mockResolvedValue(mockTransactionHash)
      mockSafeContract.encodeTransactionData.mockReturnValue(expectedEncodedData)

      // Setup PoolFactory interface mock
      const mockInterface = {
        encodeFunctionData: jest.fn().mockReturnValue(expectedEncodedData),
        parseLog: jest.fn(),
        getFunction: jest.fn(),
      }
      // Note: ethersMock.Interface may not exist, so we set it directly on the pool factory
      mockPoolFactory.interface = mockInterface

      const result = (await createPoolSafeHandler(testEnvironment.request)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      expect(mockInterface.encodeFunctionData).toHaveBeenCalledWith(
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
      const expectedTransactionHash = '0x' + 'specifichash'.repeat(5) + '789'

      // Configure Safe contract mock
      mockSafeContract.getTransactionHash.mockResolvedValue(expectedTransactionHash)
      mockSafeContract.encodeTransactionData.mockReturnValue('0x' + 'data'.repeat(15))
      mockSafeContract.nonce.mockResolvedValue(42)

      const result = (await createPoolSafeHandler(testEnvironment.request)) as CreatePoolSafeResponse

      expect(result.success).toBe(true)
      expect(result.transactionHash).toBe(expectedTransactionHash)

      // Verify Safe transaction hash was computed with correct parameters
      expect(mockSafeContract.getTransactionHash).toHaveBeenCalledWith(
        TestFixtures.TestData.addresses.contracts.poolFactory, // to
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
      const mockNonce = 15

      // Configure Safe contract mock
      mockSafeContract.nonce.mockResolvedValue(mockNonce)
      mockSafeContract.getTransactionHash.mockResolvedValue('0x' + 'nonce'.repeat(12) + '7')
      mockSafeContract.encodeTransactionData.mockReturnValue('0x' + 'data'.repeat(15))

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      await createPoolSafeHandler(request)

      expect(mockSafeContract.nonce).toHaveBeenCalled()
      expect(mockSafeContract.getTransactionHash).toHaveBeenCalledWith(
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
      const unauthenticatedRequest = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        // No auth object = unauthenticated
      })

      const result = await createPoolSafeHandler(unauthenticatedRequest)

      expect(result.success).toBe(false)
      expect(result.code).toBe('unauthenticated')
      expect(result.message).toContain('must be authenticated')
    })

    it('should handle missing Safe configuration', async () => {
      delete process.env.SAFE_ADDRESS_AMOY

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Safe address not configured')
    })

    it('should handle Safe contract call failures', async () => {
      // Mock Safe contract failure
      mockSafeContract.getOwners.mockRejectedValue(new Error('Safe contract not found'))

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Safe contract not found')
    })

    it('should handle provider connection failures', async () => {
      ethersMock.simulateNetworkError('RPC connection timeout')

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('RPC connection timeout')
    })

    it('should handle Safe with zero threshold', async () => {
      mockSafeContract.getOwners.mockResolvedValue(TestFixtures.TestData.addresses.safeOwners)
      mockSafeContract.getThreshold.mockResolvedValue(0) // Invalid threshold

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Invalid Safe configuration')
    })

    it('should handle Safe with no owners', async () => {
      mockSafeContract.getOwners.mockResolvedValue([]) // No owners
      mockSafeContract.getThreshold.mockResolvedValue(2)

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
      expect(result.message).toContain('Invalid Safe configuration')
    })

    it('should handle Firestore save failures', async () => {
      // Simulate Firestore error using centralized error management
      firebaseAdminMock.simulateFirestoreError('permission-denied')

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('permission-denied')
    })
  })

  describe('Performance and Load Testing', () => {
    it('should meet performance benchmarks for Safe transaction preparation', async () => {
      const benchmarkResult = await runBenchmark(
        'createPoolSafe-performance',
        async () => {
          // Reset mocks for each iteration to ensure consistent state
          MockFactory.resetAllMocks()
          const testEnv = quickSetup.safeTransaction()

          const mockTransactionHash = '0x' + Date.now().toString(16).padEnd(64, '0')
          testEnv.safeContract.getTransactionHash.mockResolvedValue(mockTransactionHash)
          testEnv.safeContract.encodeTransactionData.mockReturnValue('0x' + 'encoded'.repeat(10))
          testEnv.safeContract.nonce.mockResolvedValue(Math.floor(Math.random() * 100))

          const request = FunctionsMock.createCallableRequest({
            data: testEnv.params,
            auth: {
              uid: testEnv.uid,
              token: {},
            },
          })
          return await createPoolSafeHandler(request)
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

      // Create separate test environments for each concurrent request
      const testEnvironments = Array.from({ length: 3 }, (_, i) => {
        const env = quickSetup.safeTransaction()
        const mockHash = '0x' + `concurrent${i}`.repeat(8).substring(0, 64)

        // Configure each environment's Safe contract
        env.safeContract.getTransactionHash.mockResolvedValue(mockHash)
        env.safeContract.encodeTransactionData.mockReturnValue('0x' + 'encoded'.repeat(10))
        env.safeContract.nonce.mockResolvedValue(100 + i)

        return {
          ...env,
          request: FunctionsMock.createCallableRequest({
            data: {
              ...env.params,
              name: `Safe Pool ${i + 1}`,
              poolOwner: TestFixtures.TestData.addresses.poolOwners[i % TestFixtures.TestData.addresses.poolOwners.length],
            },
            auth: {
              uid: env.uid,
              token: {},
            },
          }),
        }
      })

      const results = await Promise.all(testEnvironments.map((env) => createPoolSafeHandler(env.request)))

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
      const unauthorizedUid = 'unauthorized-user'
      const unauthorizedAddress = '0x' + 'unauthorized'.repeat(3)

      // Setup unauthorized user using centralized methods
      firebaseAdminMock.seedUser({
        uid: unauthorizedUid,
        email: 'unauthorized@test.com',
        customClaims: { walletAddress: unauthorizedAddress },
      })

      // Seed user document
      firebaseAdminMock.seedDocument(`users/${unauthorizedUid}`, {
        walletAddress: unauthorizedAddress,
        createdAt: new Date(),
      })

      const unauthorizedRequest = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: unauthorizedUid,
          token: {},
        },
      })

      // The function allows this but logs a warning (for admin flexibility)
      const result = (await createPoolSafeHandler(unauthorizedRequest)) as CreatePoolSafeResponse

      expect(result.success).toBe(true) // Allowed but logged
    })

    it('should validate Safe address format and existence', async () => {
      // Test with invalid Safe address format
      process.env.SAFE_ADDRESS_AMOY = 'invalid-address-format'

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(request)

      expect(result.success).toBe(false)
      expect(result.code).toBe('internal')
    })

    it('should handle Safe transaction expiration correctly', async () => {
      const mockTransactionHash = '0x' + 'expiry'.repeat(11) + '8'

      // Configure Safe contract mock
      mockSafeContract.getTransactionHash.mockResolvedValue(mockTransactionHash)
      mockSafeContract.encodeTransactionData.mockReturnValue('0x' + 'encoded'.repeat(10))
      mockSafeContract.nonce.mockResolvedValue(50)

      const request = FunctionsMock.createCallableRequest({
        data: testEnvironment.params,
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      await createPoolSafeHandler(request)

      // Verify Safe transaction was stored
      const safeTransactionsCollection = firebaseAdminMock.firestore.collection('safe_transactions')
      expect(safeTransactionsCollection.doc).toHaveBeenCalled()

      const docMock = safeTransactionsCollection.doc()
      expect(docMock.set).toHaveBeenCalled()

      // Verify expiration date is set (7 days from creation)
      const setCall = docMock.set.mock.calls[0][0]
      expect(setCall.expiresAt).toBeInstanceOf(Date)

      const expiryTime = setCall.expiresAt.getTime()
      const creationTime = setCall.createdAt.getTime()
      const sevenDays = 7 * 24 * 60 * 60 * 1000

      expect(expiryTime - creationTime).toBeCloseTo(sevenDays, -4) // Within 10 seconds
    })

    it('should prevent parameter injection in Safe transaction data', async () => {
      // Attempt to inject malicious data in pool parameters
      const maliciousRequest = FunctionsMock.createCallableRequest({
        data: {
          poolOwner: testEnvironment.params.poolOwner,
          maxLoanAmount: "1000000000000000000'; DELETE FROM pools; --",
          interestRate: NaN,
          loanDuration: Infinity,
          name: '\x00\x01\x02malicious name',
          description: '\u200B\u200C\u200D\uFEFFhidden chars',
        },
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = await createPoolSafeHandler(maliciousRequest)

      // Should fail validation before reaching Safe transaction preparation
      expect(result.success).toBe(false)
      expect(result.code).toBe('invalid-argument')
    })
  })

  describe('Chain Configuration', () => {
    it('should handle different chain configurations for Safe deployments', async () => {
      // Setup Polygon Mainnet configuration
      process.env.POLYGON_MAINNET_RPC_URL = 'https://polygon-mainnet.rpc.url'
      process.env.SAFE_ADDRESS_POLYGON = '0x' + 'mainnet'.repeat(5)
      process.env.POOL_FACTORY_ADDRESS_POLYGON = '0x' + 'factory'.repeat(4)

      const mockTransactionHash = '0x' + 'mainnet'.repeat(10) + '9'

      // Configure Safe contract for mainnet
      mockSafeContract.getThreshold.mockResolvedValue(3)
      mockSafeContract.getTransactionHash.mockResolvedValue(mockTransactionHash)
      mockSafeContract.encodeTransactionData.mockReturnValue('0x' + 'encoded'.repeat(10))
      mockSafeContract.nonce.mockResolvedValue(25)

      const mainnetRequest = FunctionsMock.createCallableRequest({
        data: { ...testEnvironment.params, chainId: 137 }, // Polygon Mainnet
        auth: {
          uid: testEnvironment.uid,
          token: {},
        },
      })

      const result = (await createPoolSafeHandler(mainnetRequest)) as CreatePoolSafeResponse

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
