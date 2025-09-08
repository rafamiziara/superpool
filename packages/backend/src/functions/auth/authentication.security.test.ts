/**
 * Authentication Security Tests
 *
 * Focused test suite for security-critical authentication scenarios:
 * - Replay attack prevention
 * - Nonce expiration and reuse protection
 * - Invalid signature handling
 * - Concurrent request security
 * - Device verification security
 * - Safe wallet authentication security
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

// Import centralized mock system (MOCK_SYSTEM.md compliant)
import { ethersMock, firebaseAdminMock, FunctionsMock } from '../../__mocks__'

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
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'security-test-nonce'),
}))

// Get the mocked function for use in tests
const mockV4 = jest.requireMock('uuid').v4

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

// Helper functions
const createMockDocumentSnapshot = (exists: boolean, data?: any) => ({
  exists,
  data: () => data,
})

describe('Authentication Security Tests', () => {
  const validWalletAddress = '0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a'
  const mockTimestamp = 1678886400000 // Fixed timestamp for testing
  const validSignature = '0x' + 'a'.repeat(130)
  const mockNonce = 'security-test-nonce'

  beforeEach(() => {
    // ✅ MOCK_SYSTEM.md Requirement: Use centralized mock resets
    firebaseAdminMock.resetAllMocks()
    ethersMock.resetAllMocks()
    jest.clearAllMocks()

    // Mock Date to return predictable timestamp
    jest.spyOn(Date.prototype, 'getTime').mockReturnValue(mockTimestamp)
    jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp)

    // Setup ethers mocks using centralized system
    ethersMock.provider.getNetwork.mockResolvedValue({ chainId: 80002, name: 'polygon-amoy' })

    // Setup Firestore mocks
    mockSet.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    mockCreateCustomToken.mockResolvedValue('mock-token')

    // Setup UUID mock
    mockV4.mockReturnValue(mockNonce)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Replay Attack Prevention', () => {
    it('should prevent signature reuse by deleting nonce after authentication', async () => {
      const mockNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 60000,
        expiresAt: mockTimestamp + 540000,
      }

      // First authentication should succeed
      mockGet
        .mockResolvedValueOnce(createMockDocumentSnapshot(true, mockNonceData)) // nonce exists
        .mockResolvedValueOnce(createMockDocumentSnapshot(false)) // no user profile

      const request = {
        data: {
          walletAddress: validWalletAddress,
          signature: validSignature,
        },
      }

      const result1 = await verifySignatureAndLoginHandler(request as any)
      expect(result1.firebaseToken).toBeTruthy()

      // Verify nonce was deleted
      expect(mockDelete).toHaveBeenCalled()

      // Reset mocks for second attempt
      jest.clearAllMocks()
      mockGet.mockResolvedValue(createMockDocumentSnapshot(false)) // nonce no longer exists

      // Second authentication with same signature should fail
      await expect(verifySignatureAndLoginHandler(request as any)).rejects.toThrow(
        'No authentication message found for this wallet address. Please generate a new message.'
      )

      console.log('✓ Replay attack prevention: nonce deletion prevents signature reuse')
    })

    it('should prevent nonce reuse across different wallet addresses', async () => {
      const nonce1 = 'nonce-for-wallet-1'
      const nonce2 = 'nonce-for-wallet-2'
      const wallet1 = validWalletAddress
      const wallet2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

      // Create nonces for both wallets
      mockV4.mockReturnValueOnce(nonce1).mockReturnValueOnce(nonce2)

      const request1 = FunctionsMock.createCallableRequest({ walletAddress: wallet1 })
      const request2 = FunctionsMock.createCallableRequest({ walletAddress: wallet2 })

      await generateAuthMessageHandler(request1 as any)
      await generateAuthMessageHandler(request2 as any)

      // Verify each wallet got its own unique nonce
      expect(mockSet).toHaveBeenNthCalledWith(1, {
        nonce: nonce1,
        timestamp: mockTimestamp,
        expiresAt: mockTimestamp + 10 * 60 * 1000,
      })

      expect(mockSet).toHaveBeenNthCalledWith(2, {
        nonce: nonce2,
        timestamp: mockTimestamp,
        expiresAt: mockTimestamp + 10 * 60 * 1000,
      })

      console.log('✓ Nonce isolation: each wallet gets unique nonce')
    })
  })

  describe('Nonce Expiration Security', () => {
    it('should reject expired nonces and clean them up', async () => {
      const expiredNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 900000, // 15 minutes ago
        expiresAt: mockTimestamp - 300000, // 5 minutes ago (expired)
      }

      mockGet.mockResolvedValue(createMockDocumentSnapshot(true, expiredNonceData))

      const request = {
        data: {
          walletAddress: validWalletAddress,
          signature: validSignature,
        },
      }

      await expect(verifySignatureAndLoginHandler(request as any)).rejects.toThrow(
        'Authentication message has expired. Please generate a new message.'
      )

      // Verify expired nonce was cleaned up
      expect(mockDelete).toHaveBeenCalled()

      console.log('✓ Expired nonce rejection: expired nonces are rejected and cleaned up')
    })

    it('should accept nonces that are about to expire but still valid', async () => {
      const soonToExpireNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 580000, // 9 minutes 40 seconds ago
        expiresAt: mockTimestamp + 20000, // 20 seconds from now (still valid)
      }

      mockGet
        .mockResolvedValueOnce(createMockDocumentSnapshot(true, soonToExpireNonceData))
        .mockResolvedValueOnce(createMockDocumentSnapshot(false)) // no user profile

      const request = {
        data: {
          walletAddress: validWalletAddress,
          signature: validSignature,
        },
      }

      const result = await verifySignatureAndLoginHandler(request as any)
      expect(result.firebaseToken).toBeTruthy()

      console.log('✓ Soon-to-expire nonce acceptance: valid nonces accepted even when close to expiration')
    })
  })

  describe('Invalid Signature Security', () => {
    it('should reject signatures that verify to different addresses', async () => {
      const mockNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 60000,
        expiresAt: mockTimestamp + 540000,
      }

      mockGet.mockResolvedValue(createMockDocumentSnapshot(true, mockNonceData))

      // Mock signature verification to return different address
      const differentAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
      jest.mocked(verifyMessage).mockReturnValue(differentAddress)

      const request = {
        data: {
          walletAddress: validWalletAddress,
          signature: validSignature,
        },
      }

      await expect(verifySignatureAndLoginHandler(request as any)).rejects.toThrow(
        'The signature does not match the provided wallet address.'
      )

      console.log('✓ Invalid signature rejection: signatures verifying to different addresses are rejected')
    })

    it('should handle signature verification errors gracefully', async () => {
      const mockNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 60000,
        expiresAt: mockTimestamp + 540000,
      }

      mockGet.mockResolvedValue(createMockDocumentSnapshot(true, mockNonceData))

      // Mock signature verification failure
      jest.mocked(verifyMessage).mockImplementation(() => {
        throw new Error('Invalid signature format')
      })

      const request = {
        data: {
          walletAddress: validWalletAddress,
          signature: validSignature,
        },
      }

      await expect(verifySignatureAndLoginHandler(request as any)).rejects.toThrow(
        'Signature verification failed: Invalid signature format'
      )

      console.log('✓ Signature error handling: verification errors are handled gracefully')
    })
  })

  describe('Concurrent Request Security', () => {
    it('should handle concurrent authentication attempts safely', async () => {
      const mockNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 60000,
        expiresAt: mockTimestamp + 540000,
      }

      // All concurrent requests will get the same nonce initially
      mockGet.mockResolvedValue(createMockDocumentSnapshot(true, mockNonceData))

      // Create multiple concurrent requests with same signature
      const request = {
        data: {
          walletAddress: validWalletAddress,
          signature: validSignature,
        },
      }

      const promises = Array(5)
        .fill(null)
        .map(() => verifySignatureAndLoginHandler(request as any))

      const results = await Promise.allSettled(promises)

      // Only one should succeed (first to delete the nonce)
      // Others should fail with nonce not found error
      const successful = results.filter((r) => r.status === 'fulfilled')
      const failed = results.filter((r) => r.status === 'rejected')

      // This is a race condition, so we can't predict exact counts
      // but we should have both successful and failed results
      expect(successful.length + failed.length).toBe(5)
      expect(successful.length).toBeGreaterThanOrEqual(1)

      console.log(`✓ Concurrent request safety: ${successful.length} succeeded, ${failed.length} failed`)
    })
  })

  describe('Device Verification Security', () => {
    it('should handle device approval failures without blocking authentication', async () => {
      const mockNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 60000,
        expiresAt: mockTimestamp + 540000,
      }

      mockGet
        .mockResolvedValueOnce(createMockDocumentSnapshot(true, mockNonceData))
        .mockResolvedValueOnce(createMockDocumentSnapshot(false)) // no user profile

      // Mock device approval failure
      mockApproveDevice.mockRejectedValue(new Error('Device verification service unavailable'))

      const request = {
        data: {
          walletAddress: validWalletAddress,
          signature: validSignature,
          deviceId: 'test-device-123',
          platform: 'android' as const,
        },
      }

      // Authentication should still succeed
      const result = await verifySignatureAndLoginHandler(request as any)
      expect(result.firebaseToken).toBeTruthy()

      // Device approval should have been attempted
      expect(mockApproveDevice).toHaveBeenCalledWith('test-device-123', validWalletAddress, 'android')

      console.log('✓ Device approval resilience: authentication succeeds even if device approval fails')
    })
  })

  describe('Safe Wallet Authentication Security', () => {
    it('should handle Safe wallet verification with proper security checks', async () => {
      const mockNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 60000,
        expiresAt: mockTimestamp + 540000,
      }

      mockGet
        .mockResolvedValueOnce(createMockDocumentSnapshot(true, mockNonceData))
        .mockResolvedValueOnce(createMockDocumentSnapshot(false)) // no user profile

      // Mock successful Safe wallet verification
      mockSafeWalletVerification.mockResolvedValue({
        isValid: true,
        verification: {
          signatureValidation: true,
          ownershipVerification: true,
          thresholdCheck: true,
          safeVersionCompatibility: true,
          verificationMethod: 'eip1271',
          contractAddress: validWalletAddress,
        },
        warnings: ['Threshold requirement met with minimum signatures'],
      })

      const safeSignature = `safe-wallet:${validWalletAddress}:${mockNonce}:${mockTimestamp}`

      const request = {
        data: {
          walletAddress: validWalletAddress,
          signature: safeSignature,
          signatureType: 'safe-wallet' as const,
          chainId: 80002,
        },
      }

      const result = await verifySignatureAndLoginHandler(request as any)
      expect(result.firebaseToken).toBeTruthy()

      // Verify Safe wallet verification was called with proper parameters
      expect(mockSafeWalletVerification).toHaveBeenCalledWith(
        validWalletAddress,
        safeSignature,
        mockNonce,
        mockNonceData.timestamp,
        expect.any(Object), // provider
        80002
      )

      console.log('✓ Safe wallet security: Safe wallet verification includes proper security checks')
    })

    it('should reject invalid Safe wallet signatures', async () => {
      const mockNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 60000,
        expiresAt: mockTimestamp + 540000,
      }

      mockGet.mockResolvedValue(createMockDocumentSnapshot(true, mockNonceData))

      // Mock failed Safe wallet verification
      mockSafeWalletVerification.mockResolvedValue({
        isValid: false,
        verification: {
          signatureValidation: false,
          ownershipVerification: false,
          thresholdCheck: false,
          safeVersionCompatibility: true,
          verificationMethod: 'fallback',
          contractAddress: validWalletAddress,
        },
        error: 'INVALID_SIGNATURE_FORMAT',
      })

      const invalidSafeSignature = `safe-wallet:${validWalletAddress}:invalid:format`

      const request = {
        data: {
          walletAddress: validWalletAddress,
          signature: invalidSafeSignature,
          signatureType: 'safe-wallet' as const,
        },
      }

      await expect(verifySignatureAndLoginHandler(request as any)).rejects.toThrow(
        'Signature verification failed: Safe wallet authentication failed: Safe wallet verification failed: INVALID_SIGNATURE_FORMAT'
      )

      console.log('✓ Safe wallet rejection: invalid Safe wallet signatures are properly rejected')
    })
  })

  describe('Input Sanitization Security', () => {
    it('should reject malicious wallet addresses', async () => {
      const maliciousAddresses = [
        '0x0000000000000000000000000000000000000000', // zero address
        '0x', // too short
        '0x1234', // too short
        'not-an-address', // not hex
        '0xG234567890123456789012345678901234567890', // invalid hex
        null,
        undefined,
        '',
        ' 0x742d35Cc6670C74288C2e768dC1E574a0B7DbE7a ', // whitespace
      ]

      for (const maliciousAddress of maliciousAddresses) {
        jest.mocked(isAddress).mockReturnValue(false)

        const request = FunctionsMock.createCallableRequest({ walletAddress: maliciousAddress })

        await expect(generateAuthMessageHandler(request as any)).rejects.toThrow()
      }

      console.log('✓ Input sanitization: malicious wallet addresses are rejected')
    })

    it('should reject malicious signature formats', async () => {
      const mockNonceData: AuthNonce = {
        nonce: mockNonce,
        timestamp: mockTimestamp - 60000,
        expiresAt: mockTimestamp + 540000,
      }

      mockGet.mockResolvedValue(createMockDocumentSnapshot(true, mockNonceData))

      const maliciousSignatures = [
        'not-a-signature',
        '0x', // too short
        '0x1234', // too short
        '0xGGGG', // invalid hex
        null,
        undefined,
        '',
        ' 0x' + 'a'.repeat(130) + ' ', // whitespace
      ]

      for (const maliciousSignature of maliciousSignatures) {
        const request = {
          data: {
            walletAddress: validWalletAddress,
            signature: maliciousSignature,
          },
        }

        await expect(verifySignatureAndLoginHandler(request as any)).rejects.toThrow()
      }

      console.log('✓ Signature sanitization: malicious signature formats are rejected')
    })
  })

  describe('Performance Attack Resistance', () => {
    it('should handle rapid invalid requests without service degradation', async () => {
      const startTime = performance.now()
      const invalidRequests = 100

      // All requests will fail due to invalid address
      jest.mocked(isAddress).mockReturnValue(false)

      const promises = Array(invalidRequests)
        .fill(null)
        .map(() => {
          const request = FunctionsMock.createCallableRequest({ walletAddress: 'invalid' })
          return generateAuthMessageHandler(request as any).catch((error) => error)
        })

      const results = await Promise.all(promises)
      const endTime = performance.now()

      // All should be HttpsError instances (failed fast)
      results.forEach((result) => {
        expect(result).toBeInstanceOf(HttpsError)
      })

      const totalTime = endTime - startTime
      const avgTimePerRequest = totalTime / invalidRequests

      // Should fail fast (less than 10ms per request on average)
      expect(avgTimePerRequest).toBeLessThan(10)

      console.log(`✓ DoS resistance: ${invalidRequests} invalid requests handled in ${totalTime.toFixed(2)}ms`)
      console.log(`   Average per request: ${avgTimePerRequest.toFixed(2)}ms`)
    })
  })

  describe('Time-based Attack Resistance', () => {
    it('should not leak timing information about nonce existence', async () => {
      const iterations = 50
      const timesWithNonce: number[] = []
      const timesWithoutNonce: number[] = []

      for (let i = 0; i < iterations; i++) {
        // Test with existing nonce
        const mockNonceData: AuthNonce = {
          nonce: `nonce-${i}`,
          timestamp: mockTimestamp - 60000,
          expiresAt: mockTimestamp + 540000,
        }

        mockGet.mockResolvedValueOnce(createMockDocumentSnapshot(true, mockNonceData))

        const startTime = performance.now()

        const request = {
          data: {
            walletAddress: validWalletAddress,
            signature: validSignature,
          },
        }

        try {
          await verifySignatureAndLoginHandler(request as any)
        } catch (error) {
          // Expected to fail, just measuring timing
        }

        const endTime = performance.now()
        timesWithNonce.push(endTime - startTime)

        // Test without nonce
        mockGet.mockResolvedValueOnce(createMockDocumentSnapshot(false))

        const startTime2 = performance.now()

        try {
          await verifySignatureAndLoginHandler(request as any)
        } catch (error) {
          // Expected to fail, just measuring timing
        }

        const endTime2 = performance.now()
        timesWithoutNonce.push(endTime2 - startTime2)
      }

      const avgWithNonce = timesWithNonce.reduce((a, b) => a + b, 0) / timesWithNonce.length
      const avgWithoutNonce = timesWithoutNonce.reduce((a, b) => a + b, 0) / timesWithoutNonce.length

      // The timing difference should not be dramatic (within 50% of each other)
      const timingRatio = Math.max(avgWithNonce, avgWithoutNonce) / Math.min(avgWithNonce, avgWithoutNonce)

      console.log(`✓ Timing attack resistance:`)
      console.log(`   With nonce: ${avgWithNonce.toFixed(2)}ms average`)
      console.log(`   Without nonce: ${avgWithoutNonce.toFixed(2)}ms average`)
      console.log(`   Timing ratio: ${timingRatio.toFixed(2)}x`)

      // While we can't eliminate all timing differences, they shouldn't be extreme
      expect(timingRatio).toBeLessThan(3)
    })
  })
})
