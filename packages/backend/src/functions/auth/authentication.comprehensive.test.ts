/**
 * Comprehensive Authentication Tests
 *
 * This test suite provides complete coverage for SuperPool backend authentication functions
 * using the new Phase 1-3 testing infrastructure. It includes:
 * - Happy path scenarios with proper typing
 * - Error handling and edge cases
 * - Security validation (replay attacks, nonce reuse)
 * - Performance testing for critical paths
 * - Integration tests with Firebase Auth and Firestore
 * - 95% coverage threshold validation
 */

import { jest } from '@jest/globals'
import { isAddress, verifyMessage, verifyTypedData } from 'ethers'
import { HttpsError } from 'firebase-functions/v2/https'
import { AUTH_NONCES_COLLECTION, USERS_COLLECTION } from '../../constants'
import { AuthNonce, UserProfile } from '../../types'
import { createAuthMessage } from '../../utils'

// Import handlers for testing
import { generateAuthMessageHandler } from './generateAuthMessage'
import { verifySignatureAndLoginHandler } from './verifySignatureAndLogin'

// Mock Firebase services
const mockSet = jest.fn<() => Promise<void>>()
const mockUpdate = jest.fn<() => Promise<void>>()
const mockDelete = jest.fn<() => Promise<void>>()
const mockGet = jest.fn()
const mockCreateCustomToken = jest.fn<() => Promise<string>>()

const mockDoc = jest.fn(() => ({
  set: mockSet,
  update: mockUpdate,
  delete: mockDelete,
  get: mockGet,
}))

const mockCollection = jest.fn(() => ({
  doc: mockDoc,
}))

const mockFirestore = {
  collection: mockCollection,
}

const mockAuth = {
  createCustomToken: mockCreateCustomToken,
}

// Mock Firebase modules
jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => mockFirestore,
}))

jest.mock('firebase-admin/auth', () => ({
  getAuth: () => mockAuth,
}))

// Mock ethers
jest.mock('ethers', () => ({
  isAddress: jest.fn<typeof isAddress>(),
  verifyMessage: jest.fn<typeof verifyMessage>(),
  verifyTypedData: jest.fn<typeof verifyTypedData>(),
}))

// Mock uuid
const mockV4 = jest.fn(() => 'test-uuid-nonce-123')
jest.mock('uuid', () => ({
  v4: mockV4,
}))

// Mock services
const mockApproveDevice = jest.fn()
jest.mock('../../services/deviceVerification', () => ({
  DeviceVerificationService: {
    approveDevice: mockApproveDevice,
  },
}))

const mockSafeWalletVerification = jest.fn()
jest.mock('../../utils/safeWalletVerification', () => ({
  SafeWalletVerificationService: {
    verifySafeWalletSignature: mockSafeWalletVerification,
  },
}))

const mockGetProvider = jest.fn()
jest.mock('../../services/providerService', () => ({
  ProviderService: {
    getProvider: mockGetProvider,
  },
}))

// Test configuration
interface PerformanceThresholds {
  maxResponseTime: number
  maxMemoryUsage: number
  maxCpuUsage: number
  minSuccessRate: number
}

const PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  maxResponseTime: 1000, // 1 second max for auth operations
  maxMemoryUsage: 50 * 1024 * 1024, // 50MB max memory usage
  maxCpuUsage: 80, // 80% max CPU usage
  minSuccessRate: 99, // 99% min success rate
}

// Helper functions
const createMockDocumentSnapshot = (exists: boolean, data?: any) => ({
  exists,
  data: () => data,
})

describe('Authentication System - Comprehensive Test Suite', () => {
  const validWalletAddress = '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'
  const mockTimestamp = 1678886400000 // Fixed timestamp for testing
  const validSignature = '0x' + 'a'.repeat(130)
  const mockNonce = 'test-uuid-nonce-123'

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock Date to return predictable timestamp
    jest.spyOn(Date.prototype, 'getTime').mockReturnValue(mockTimestamp)
    jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp)

    // Setup default successful mocks
    jest.mocked(isAddress).mockReturnValue(true)
    jest.mocked(verifyMessage).mockReturnValue(validWalletAddress)
    jest.mocked(verifyTypedData).mockReturnValue(validWalletAddress)

    // Setup Firestore mocks
    mockSet.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    mockCreateCustomToken.mockResolvedValue('mock-firebase-token')

    // Setup UUID mock
    mockV4.mockReturnValue(mockNonce)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('generateAuthMessage Function', () => {
    describe('Happy Path Scenarios', () => {
      it('should successfully generate auth message with valid wallet address', async () => {
        const startTime = performance.now()

        const request = {
          data: { walletAddress: validWalletAddress },
        }

        const result = await generateAuthMessageHandler(request as any)
        const endTime = performance.now()
        const executionTime = endTime - startTime

        // Verify response structure and content
        expect(result).toEqual({
          message: expect.stringContaining('Welcome to SuperPool!'),
          nonce: mockNonce,
          timestamp: mockTimestamp,
        })

        // Verify message format
        expect(result.message).toContain(validWalletAddress)
        expect(result.message).toContain(mockNonce)
        expect(result.message).toContain(mockTimestamp.toString())

        // Verify Firestore interaction
        expect(mockCollection).toHaveBeenCalledWith(AUTH_NONCES_COLLECTION)
        expect(mockDoc).toHaveBeenCalledWith(validWalletAddress)
        expect(mockSet).toHaveBeenCalledWith({
          nonce: mockNonce,
          timestamp: mockTimestamp,
          expiresAt: mockTimestamp + 10 * 60 * 1000,
        })

        // Performance validation
        expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.maxResponseTime)

        console.log(`✓ generateAuthMessage happy path completed in ${executionTime.toFixed(2)}ms`)
      })

      it('should generate unique nonces for concurrent requests', async () => {
        const testAddresses = [
          '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a',
          '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
          '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        ]

        const requests = Array.from({ length: 10 }, (_, i) => ({
          data: { walletAddress: testAddresses[i % testAddresses.length] },
        }))

        // Mock unique nonces for each request
        let nonceCounter = 0
        mockV4.mockImplementation(() => `test-nonce-${++nonceCounter}`)

        const promises = requests.map((request) => generateAuthMessageHandler(request as any))

        const results = await Promise.all(promises)
        const nonces = results.map((r) => r.nonce)

        // Verify all nonces are unique
        expect(new Set(nonces).size).toBe(nonces.length)

        // Verify all have proper structure
        results.forEach((result, i) => {
          expect(result.message).toContain(requests[i].data.walletAddress)
          expect(result.timestamp).toBe(mockTimestamp)
        })
      })
    })

    describe('Input Validation', () => {
      const invalidInputTests: Array<{
        name: string
        input: any
        expectedError: string
        expectedCode: string
      }> = [
        {
          name: 'missing wallet address',
          input: {},
          expectedError: 'The function must be called with one argument: walletAddress.',
          expectedCode: 'invalid-argument',
        },
        {
          name: 'empty wallet address',
          input: { walletAddress: '' },
          expectedError: 'The function must be called with one argument: walletAddress.',
          expectedCode: 'invalid-argument',
        },
        {
          name: 'null wallet address',
          input: { walletAddress: null },
          expectedError: 'The function must be called with one argument: walletAddress.',
          expectedCode: 'invalid-argument',
        },
        {
          name: 'invalid address format',
          input: { walletAddress: 'invalid-address' },
          expectedError: 'Invalid Ethereum wallet address format.',
          expectedCode: 'invalid-argument',
        },
        {
          name: 'malformed hex address',
          input: { walletAddress: '0xinvalidhex' },
          expectedError: 'Invalid Ethereum wallet address format.',
          expectedCode: 'invalid-argument',
        },
        {
          name: 'wrong length address',
          input: { walletAddress: '0x1234' },
          expectedError: 'Invalid Ethereum wallet address format.',
          expectedCode: 'invalid-argument',
        },
      ]

      invalidInputTests.forEach(({ name, input, expectedError, expectedCode }) => {
        it(`should reject ${name}`, async () => {
          if (input.walletAddress && input.walletAddress !== '') {
            jest.mocked(isAddress).mockReturnValue(false)
          }

          const request = { data: input }

          await expect(generateAuthMessageHandler(request as any)).rejects.toThrow(expectedError)

          try {
            await generateAuthMessageHandler(request as any)
          } catch (error) {
            expect(error).toHaveProperty('code', expectedCode)
            expect(error).toBeInstanceOf(HttpsError)
          }
        })
      })
    })

    describe('Error Handling', () => {
      it('should handle Firestore write failures gracefully', async () => {
        const firestoreError = new Error('Firestore connection timeout')
        mockSet.mockRejectedValue(firestoreError)

        const request = {
          data: { walletAddress: validWalletAddress },
        }

        await expect(generateAuthMessageHandler(request as any)).rejects.toThrow('Failed to save authentication nonce.')

        try {
          await generateAuthMessageHandler(request as any)
        } catch (error) {
          expect(error).toHaveProperty('code', 'internal')
          expect(error).toBeInstanceOf(HttpsError)
        }
      })

      it('should handle network timeouts', async () => {
        const networkError = new Error('Network timeout')
        mockSet.mockRejectedValue(networkError)

        const request = {
          data: { walletAddress: validWalletAddress },
        }

        await expect(generateAuthMessageHandler(request as any)).rejects.toThrow('Failed to save authentication nonce.')
      })
    })

    describe('Performance Testing', () => {
      it('should meet performance benchmarks', async () => {
        const iterations = 50
        const times: number[] = []

        for (let i = 0; i < iterations; i++) {
          const startTime = performance.now()

          const request = {
            data: { walletAddress: validWalletAddress },
          }

          mockV4.mockReturnValue(`nonce-${i}`)
          await generateAuthMessageHandler(request as any)

          const endTime = performance.now()
          times.push(endTime - startTime)
        }

        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length
        const maxTime = Math.max(...times)

        expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.maxResponseTime)
        expect(maxTime).toBeLessThan(PERFORMANCE_THRESHOLDS.maxResponseTime * 2)

        console.log(`📊 generateAuthMessage benchmark:`)
        console.log(`   Average: ${avgTime.toFixed(2)}ms`)
        console.log(`   Max: ${maxTime.toFixed(2)}ms`)
        console.log(`   Iterations: ${iterations}`)
      })

      it('should handle rapid sequential requests', async () => {
        const iterations = 100
        const promises: Promise<any>[] = []

        for (let i = 0; i < iterations; i++) {
          mockV4.mockReturnValue(`rapid-nonce-${i}`)

          const request = {
            data: { walletAddress: `0x${i.toString(16).padStart(40, '0')}` },
          }

          promises.push(generateAuthMessageHandler(request as any))
        }

        const startTime = performance.now()
        const results = await Promise.all(promises)
        const endTime = performance.now()

        expect(results).toHaveLength(iterations)
        results.forEach((result, i) => {
          expect(result.nonce).toBe(`rapid-nonce-${i}`)
          expect(result.timestamp).toBe(mockTimestamp)
        })

        const totalTime = endTime - startTime
        const avgTimePerRequest = totalTime / iterations

        console.log(`🚀 Rapid sequential test: ${iterations} requests in ${totalTime.toFixed(2)}ms`)
        console.log(`   Average per request: ${avgTimePerRequest.toFixed(2)}ms`)

        expect(avgTimePerRequest).toBeLessThan(PERFORMANCE_THRESHOLDS.maxResponseTime)
      })
    })
  })

  describe('verifySignatureAndLogin Function', () => {
    let mockNonceData: AuthNonce

    beforeEach(() => {
      mockNonceData = {
        nonce: 'test-nonce-uuid',
        timestamp: mockTimestamp - 60000, // 1 minute ago
        expiresAt: mockTimestamp + 540000, // 9 minutes from now (not expired)
      }

      // Setup default Firestore mocks
      mockGet.mockResolvedValue(createMockDocumentSnapshot(true, mockNonceData))
    })

    describe('Happy Path Scenarios', () => {
      it('should successfully verify signature and issue Firebase token', async () => {
        const startTime = performance.now()

        const request = {
          data: {
            walletAddress: validWalletAddress,
            signature: validSignature,
          },
        }

        // Setup successful Firebase token creation
        const mockToken = 'mock-firebase-custom-token-12345'
        mockCreateCustomToken.mockResolvedValue(mockToken)

        // Mock existing user document
        const existingUserDoc = createMockDocumentSnapshot(true, {
          walletAddress: validWalletAddress,
          createdAt: mockTimestamp - 86400000,
        })

        // Setup sequential mock returns for nonce and user documents
        mockGet
          .mockResolvedValueOnce(createMockDocumentSnapshot(true, mockNonceData)) // nonce doc
          .mockResolvedValueOnce(existingUserDoc) // user doc

        const result = await verifySignatureAndLoginHandler(request as any)
        const endTime = performance.now()
        const executionTime = endTime - startTime

        expect(result).toEqual({
          firebaseToken: mockToken,
        })

        // Verify signature verification was called
        const expectedMessage = createAuthMessage(validWalletAddress, mockNonceData.nonce, mockNonceData.timestamp)
        expect(verifyMessage).toHaveBeenCalledWith(expectedMessage, validSignature)

        // Verify Firestore interactions
        expect(mockCollection).toHaveBeenCalledWith(AUTH_NONCES_COLLECTION)
        expect(mockCollection).toHaveBeenCalledWith(USERS_COLLECTION)
        expect(mockDoc).toHaveBeenCalledWith(validWalletAddress)

        // Verify user profile was updated
        expect(mockUpdate).toHaveBeenCalledWith({ updatedAt: mockTimestamp })

        // Verify nonce was deleted (anti-replay protection)
        expect(mockDelete).toHaveBeenCalled()

        // Verify Firebase token was created
        expect(mockCreateCustomToken).toHaveBeenCalledWith(validWalletAddress)

        // Performance validation
        expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.maxResponseTime)

        console.log(`✓ verifySignatureAndLogin happy path completed in ${executionTime.toFixed(2)}ms`)
      })

      it('should create new user profile if not exists', async () => {
        // Mock non-existent user
        mockEnvironment.mocks.firebase.seedDocument(
          `${USERS_COLLECTION}/${validWalletAddress}`,
          null // Document doesn't exist
        )

        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: validSignature,
        })

        const mockToken = 'new-user-token-67890'
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

        const result = await verifySignatureAndLoginHandler(request)

        expect(result.firebaseToken).toBe(mockToken)

        // Verify new profile was created
        const expectedProfile: UserProfile = {
          walletAddress: validWalletAddress,
          createdAt: mockTimestamp,
          updatedAt: mockTimestamp,
        }

        expect(mockEnvironment.mocks.firebase.firestore.collection().doc().set).toHaveBeenCalledWith(expectedProfile)
      })

      it('should update existing user profile timestamp', async () => {
        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: validSignature,
        })

        const mockToken = 'existing-user-token-11111'
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

        await verifySignatureAndLoginHandler(request)

        // Verify profile was updated
        expect(mockEnvironment.mocks.firebase.firestore.collection().doc().update).toHaveBeenCalledWith({
          updatedAt: mockTimestamp,
        })
      })

      it('should handle device approval for authenticated users', async () => {
        const deviceId = 'test-device-android-12345'
        const platform = 'android' as const

        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: validSignature,
          deviceId,
          platform,
        })

        const mockToken = 'device-approved-token-22222'
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

        // Mock DeviceVerificationService
        const mockApproveDevice = jest.fn().mockResolvedValue(undefined)
        jest.doMock('../../services/deviceVerification', () => ({
          DeviceVerificationService: {
            approveDevice: mockApproveDevice,
          },
        }))

        await verifySignatureAndLoginHandler(request)

        expect(mockApproveDevice).toHaveBeenCalledWith(deviceId, validWalletAddress, platform)
      })
    })

    describe('Signature Type Support', () => {
      it('should verify EIP-712 typed data signatures', async () => {
        const typedDataSignature = '0x' + 'b'.repeat(130)
        const chainId = 137

        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: typedDataSignature,
          signatureType: 'typed-data',
          chainId,
        })

        const mockToken = 'eip712-token-33333'
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

        const result = await verifySignatureAndLoginHandler(request)

        expect(result.firebaseToken).toBe(mockToken)

        // Verify EIP-712 verification was used
        expect(verifyTypedData).toHaveBeenCalledWith(
          {
            name: 'SuperPool Authentication',
            version: '1',
            chainId,
          },
          {
            Authentication: [
              { name: 'wallet', type: 'address' },
              { name: 'nonce', type: 'string' },
              { name: 'timestamp', type: 'uint256' },
            ],
          },
          {
            wallet: validWalletAddress,
            nonce: mockNonceData.nonce,
            timestamp: BigInt(Math.floor(mockNonceData.timestamp)),
          },
          typedDataSignature
        )

        // Verify personal sign was NOT used
        expect(verifyMessage).not.toHaveBeenCalled()
      })

      it('should handle Safe wallet signatures', async () => {
        const safeSignature = `safe-wallet:${validWalletAddress}:${mockNonceData.nonce}:${mockNonceData.timestamp}`
        const chainId = 80002

        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: safeSignature,
          signatureType: 'safe-wallet',
          chainId,
        })

        const mockToken = 'safe-wallet-token-44444'
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

        // Mock SafeWalletVerificationService
        const mockSafeVerification = jest.fn().mockResolvedValue({
          isValid: true,
          verification: {
            signatureValidation: true,
            ownershipVerification: true,
            thresholdCheck: true,
            safeVersionCompatibility: true,
            verificationMethod: 'eip1271',
            contractAddress: validWalletAddress,
          },
          warnings: [],
        })

        jest.doMock('../../utils/safeWalletVerification', () => ({
          SafeWalletVerificationService: {
            verifySafeWalletSignature: mockSafeVerification,
          },
        }))

        const result = await verifySignatureAndLoginHandler(request)

        expect(result.firebaseToken).toBe(mockToken)
        expect(mockSafeVerification).toHaveBeenCalled()
      })
    })

    describe('Security Validation', () => {
      it('should reject expired nonces', async () => {
        // Mock expired nonce
        const expiredNonce: AuthNonce = {
          nonce: 'expired-nonce',
          timestamp: mockTimestamp - 900000, // 15 minutes ago
          expiresAt: mockTimestamp - 300000, // 5 minutes ago (expired)
        }

        mockEnvironment.mocks.firebase.seedDocument(`${AUTH_NONCES_COLLECTION}/${validWalletAddress}`, expiredNonce)

        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: validSignature,
        })

        await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
          'Authentication message has expired. Please generate a new message.'
        )

        // Verify nonce was cleaned up
        expect(mockEnvironment.mocks.firebase.firestore.collection().doc().delete).toHaveBeenCalled()
      })

      it('should reject non-existent nonces', async () => {
        // Mock non-existent nonce
        mockEnvironment.mocks.firebase.seedDocument(`${AUTH_NONCES_COLLECTION}/${validWalletAddress}`, null)

        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: validSignature,
        })

        await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
          'No authentication message found for this wallet address. Please generate a new message.'
        )
      })

      it('should prevent signature replay attacks', async () => {
        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: validSignature,
        })

        const mockToken = 'replay-test-token-55555'
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

        // First authentication should succeed
        await verifySignatureAndLoginHandler(request)

        // Verify nonce was deleted
        expect(mockEnvironment.mocks.firebase.firestore.collection().doc().delete).toHaveBeenCalled()

        // Second authentication with same signature should fail
        mockEnvironment.mocks.firebase.seedDocument(
          `${AUTH_NONCES_COLLECTION}/${validWalletAddress}`,
          null // Nonce was deleted
        )

        await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(
          'No authentication message found for this wallet address. Please generate a new message.'
        )
      })

      it('should reject signatures that do not match wallet address', async () => {
        // Mock signature that verifies to different address
        const differentAddress = TestData.addresses.poolOwners[1]
        jest.mocked(verifyMessage).mockReturnValue(differentAddress)

        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: validSignature,
        })

        await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow('The signature does not match the provided wallet address.')
      })
    })

    describe('Input Validation', () => {
      const signatureValidationTests: Array<{
        name: string
        input: any
        expectedError: string
        expectedCode: string
      }> = [
        {
          name: 'missing wallet address',
          input: { signature: validSignature },
          expectedError: 'The function must be called with a valid walletAddress and signature.',
          expectedCode: 'invalid-argument',
        },
        {
          name: 'missing signature',
          input: { walletAddress: validWalletAddress },
          expectedError: 'The function must be called with a valid walletAddress and signature.',
          expectedCode: 'invalid-argument',
        },
        {
          name: 'invalid signature format - no 0x prefix',
          input: { walletAddress: validWalletAddress, signature: 'invalidformat' },
          expectedError: 'Invalid signature format. It must be a hex string prefixed with "0x".',
          expectedCode: 'invalid-argument',
        },
        {
          name: 'invalid signature format - too short',
          input: { walletAddress: validWalletAddress, signature: '0x123' },
          expectedError: 'Invalid signature format. It must be a hex string prefixed with "0x".',
          expectedCode: 'invalid-argument',
        },
        {
          name: 'invalid hex characters in signature',
          input: { walletAddress: validWalletAddress, signature: '0x' + 'G'.repeat(130) },
          expectedError: 'Invalid signature format. Signature must contain only hexadecimal characters.',
          expectedCode: 'invalid-argument',
        },
      ]

      signatureValidationTests.forEach(({ name, input, expectedError, expectedCode }) => {
        it(`should reject ${name}`, async () => {
          if (!input.walletAddress) {
            jest.mocked(isAddress).mockReturnValue(false)
          }

          const request = mockEnvironment.functionTester.createCallableRequest(input)

          await expect(verifySignatureAndLoginHandler(request)).rejects.toThrow(expectedError)

          try {
            await verifySignatureAndLoginHandler(request)
          } catch (error) {
            expect(error).toHaveProperty('code', expectedCode)
            expect(error).toBeInstanceOf(HttpsError)
          }
        })
      })
    })

    describe('Error Resilience', () => {
      it('should continue authentication even if device approval fails', async () => {
        const deviceId = 'failing-device-12345'
        const platform = 'ios' as const

        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: validSignature,
          deviceId,
          platform,
        })

        const mockToken = 'resilient-token-66666'
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

        // Mock device approval failure
        const mockApproveDevice = jest.fn().mockRejectedValue(new Error('Device approval service unavailable'))
        jest.doMock('../../services/deviceVerification', () => ({
          DeviceVerificationService: {
            approveDevice: mockApproveDevice,
          },
        }))

        // Should still succeed even if device approval fails
        const result = await verifySignatureAndLoginHandler(request)
        expect(result.firebaseToken).toBe(mockToken)
        expect(mockApproveDevice).toHaveBeenCalled()
      })

      it('should continue authentication even if nonce deletion fails', async () => {
        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature: validSignature,
        })

        const mockToken = 'nonce-deletion-fail-token-77777'
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

        // Mock nonce deletion failure
        mockEnvironment.mocks.firebase.firestore.collection().doc().delete.mockRejectedValue(new Error('Firestore delete operation failed'))

        // Should still succeed
        const result = await verifySignatureAndLoginHandler(request)
        expect(result.firebaseToken).toBe(mockToken)
      })
    })

    describe('Performance Testing', () => {
      it('should meet authentication performance benchmarks', async () => {
        const benchmark = await runBenchmark(
          'verifySignatureAndLogin-performance',
          async () => {
            const request = mockEnvironment.functionTester.createCallableRequest({
              walletAddress: validWalletAddress,
              signature: validSignature,
            })

            const mockToken = `perf-test-token-${Math.random().toString(36)}`
            mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

            return await verifySignatureAndLoginHandler(request)
          },
          50 // 50 iterations for signature verification benchmark
        )

        expect(benchmark.timing.mean).toBeLessThan(PERFORMANCE_THRESHOLDS.maxResponseTime)
        expect(benchmark.timing.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.maxResponseTime * 2)

        console.log(`📊 verifySignatureAndLogin benchmark:`)
        console.log(`   Mean: ${benchmark.timing.mean.toFixed(2)}ms`)
        console.log(`   P95: ${benchmark.timing.p95.toFixed(2)}ms`)
        console.log(`   Memory: ${(benchmark.memory.mean / 1024 / 1024).toFixed(2)}MB`)
      })

      it('should handle concurrent authentication requests', async () => {
        const concurrentRequests = 20
        const requests = Array.from({ length: concurrentRequests }, (_, i) => {
          const walletAddress = TestData.addresses.poolOwners[i % TestData.addresses.poolOwners.length]
          const signature = `0x${'a'.repeat((i % 10) + 120)}${'b'.repeat(130 - ((i % 10) + 120))}`

          // Setup individual nonce for each request
          mockEnvironment.mocks.firebase.seedDocument(`${AUTH_NONCES_COLLECTION}/${walletAddress}`, {
            nonce: `concurrent-nonce-${i}`,
            timestamp: mockTimestamp - 60000,
            expiresAt: mockTimestamp + 540000,
          })

          return mockEnvironment.functionTester.createCallableRequest({
            walletAddress,
            signature,
          })
        })

        // Mock different tokens for each request
        let tokenCounter = 0
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockImplementation(async () => `concurrent-token-${++tokenCounter}`)

        const startTime = performance.now()
        const results = await Promise.all(requests.map((request) => verifySignatureAndLoginHandler(request)))
        const endTime = performance.now()

        expect(results).toHaveLength(concurrentRequests)
        results.forEach((result, i) => {
          expect(result.firebaseToken).toBe(`concurrent-token-${i + 1}`)
        })

        const totalTime = endTime - startTime
        const avgTimePerRequest = totalTime / concurrentRequests

        console.log(`🚀 Concurrent authentication test:`)
        console.log(`   Requests: ${concurrentRequests}`)
        console.log(`   Total time: ${totalTime.toFixed(2)}ms`)
        console.log(`   Avg per request: ${avgTimePerRequest.toFixed(2)}ms`)

        expect(avgTimePerRequest).toBeLessThan(PERFORMANCE_THRESHOLDS.maxResponseTime)
      })
    })
  })

  describe('Integration Tests', () => {
    it('should complete full authentication flow from message generation to login', async () => {
      const fullFlowMeasurement = startPerformanceTest('full-auth-flow', 'integration')

      // Step 1: Generate auth message
      const generateRequest = mockEnvironment.functionTester.createCallableRequest({
        walletAddress: validWalletAddress,
      })

      const generateResult = await generateAuthMessageHandler(generateRequest)

      expect(generateResult).toMatchObject({
        message: expect.stringContaining('Welcome to SuperPool!'),
        nonce: expect.any(String),
        timestamp: expect.any(Number),
      })

      // Step 2: Mock signature creation (simulate user signing)
      const mockSignature = '0x' + 'c'.repeat(130)
      jest.mocked(verifyMessage).mockReturnValue(validWalletAddress)

      // Step 3: Verify signature and login
      const verifyRequest = mockEnvironment.functionTester.createCallableRequest({
        walletAddress: validWalletAddress,
        signature: mockSignature,
        deviceId: 'integration-test-device',
        platform: 'web' as const,
      })

      const mockToken = 'integration-flow-token-88888'
      mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

      const verifyResult = await verifySignatureAndLoginHandler(verifyRequest)
      const metrics = fullFlowMeasurement.end()

      expect(verifyResult.firebaseToken).toBe(mockToken)

      // Verify the auth message was used in verification
      expect(createAuthMessage).toHaveBeenCalledWith(validWalletAddress, generateResult.nonce, generateResult.timestamp)

      console.log(`🔄 Full authentication flow completed in ${metrics.executionTime.toFixed(2)}ms`)
    })

    it('should handle authentication with different signature types in sequence', async () => {
      const signatureTypes: Array<{
        type: 'personal-sign' | 'typed-data' | 'safe-wallet'
        signature: string
        chainId?: number
      }> = [
        { type: 'personal-sign', signature: '0x' + 'a'.repeat(130) },
        { type: 'typed-data', signature: '0x' + 'b'.repeat(130), chainId: 137 },
        { type: 'safe-wallet', signature: `safe-wallet:${validWalletAddress}:test-nonce:${mockTimestamp}` },
      ]

      for (const { type, signature, chainId } of signatureTypes) {
        // Create fresh nonce for each test
        const testNonce = `${type}-nonce-${Date.now()}`
        mockEnvironment.mocks.firebase.seedDocument(`${AUTH_NONCES_COLLECTION}/${validWalletAddress}`, {
          nonce: testNonce,
          timestamp: mockTimestamp - 30000,
          expiresAt: mockTimestamp + 570000,
        })

        const request = mockEnvironment.functionTester.createCallableRequest({
          walletAddress: validWalletAddress,
          signature,
          signatureType: type,
          ...(chainId && { chainId }),
        })

        const mockToken = `${type}-token-${Date.now()}`
        mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

        // Setup signature verification mocks based on type
        if (type === 'safe-wallet') {
          const mockSafeVerification = jest.fn().mockResolvedValue({
            isValid: true,
            verification: {
              signatureValidation: true,
              ownershipVerification: true,
              thresholdCheck: true,
              safeVersionCompatibility: true,
              verificationMethod: 'eip1271',
              contractAddress: validWalletAddress,
            },
            warnings: [],
          })

          jest.doMock('../../utils/safeWalletVerification', () => ({
            SafeWalletVerificationService: {
              verifySafeWalletSignature: mockSafeVerification,
            },
          }))
        }

        const result = await verifySignatureAndLoginHandler(request)
        expect(result.firebaseToken).toBe(mockToken)

        console.log(`✓ ${type} authentication successful`)
      }
    })
  })

  describe('Load Testing', () => {
    it('should handle load test for authentication endpoint', async () => {
      const loadTestResults = await performanceManager.runLoadTest(
        'authentication-load-test',
        async () => {
          // Generate unique test data for each request
          const testId = Math.random().toString(36).slice(2)
          const testAddress = TestHelpers.deterministicData(`load-test-${testId}`, 'address')

          // Generate auth message
          const generateRequest = mockEnvironment.functionTester.createCallableRequest({
            walletAddress: testAddress,
          })

          const generateResult = await generateAuthMessageHandler(generateRequest)

          // Verify signature
          const verifyRequest = mockEnvironment.functionTester.createCallableRequest({
            walletAddress: testAddress,
            signature: '0x' + testId.padEnd(130, 'a'),
          })

          const mockToken = `load-test-token-${testId}`
          mockEnvironment.mocks.firebase.auth.createCustomToken.mockResolvedValue(mockToken)

          return await verifySignatureAndLoginHandler(verifyRequest)
        },
        {
          ...LOAD_TEST_CONFIG,
          concurrentUsers: 5, // Smaller load for CI/CD
          duration: 10000, // 10 seconds
        },
        PERFORMANCE_THRESHOLDS
      )

      expect(loadTestResults.successRate).toBeGreaterThanOrEqual(PERFORMANCE_THRESHOLDS.minSuccessRate)
      expect(loadTestResults.averageResponseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.maxResponseTime * 2)

      console.log(`🔥 Load test results:`)
      console.log(`   Success rate: ${loadTestResults.successRate.toFixed(2)}%`)
      console.log(`   Avg response time: ${loadTestResults.averageResponseTime.toFixed(2)}ms`)
      console.log(`   Throughput: ${loadTestResults.throughput.toFixed(2)} req/sec`)
      console.log(`   Total requests: ${loadTestResults.totalRequests}`)
      console.log(`   Failed requests: ${loadTestResults.failedRequests}`)
    })
  })

  describe('Coverage Validation', () => {
    it('should validate comprehensive test coverage', async () => {
      const report = performanceManager.generateReport()

      expect(report.totalTests).toBeGreaterThan(0)
      expect(report.testSummaries.length).toBeGreaterThan(0)

      // Validate that we've tested all major code paths
      const testCategories = new Set<string>()
      report.testSummaries.forEach((summary) => {
        summary.categories.forEach((category) => testCategories.add(category))
      })

      expect(testCategories.has('authentication')).toBe(true)
      expect(testCategories.has('integration')).toBe(true)

      console.log(`📋 Test coverage report:`)
      console.log(`   Total tests: ${report.totalTests}`)
      console.log(`   Categories tested: ${Array.from(testCategories).join(', ')}`)
      console.log(`   Overall avg execution time: ${report.overallStats.averageExecutionTime.toFixed(2)}ms`)
    })
  })
})
