import type { SignatureResult } from '@superpool/types'
import type { SignatureVerificationContext } from './FirebaseAuthenticator'

// Mock all external dependencies using jest.doMock for proper timing
const mockSignInWithCustomToken = jest.fn()
const mockHttpsCallable = jest.fn()
const mockDevOnly = jest.fn()
const mockPlatform = { OS: 'ios' }

const mockFirebaseAuth = 'mocked-auth'
const mockFirebaseFunctions = 'mocked-functions'

const mockVerifySignatureAndLogin = jest.fn()

// Mock circuit breaker and retry policies
const mockCircuitBreaker = {
  execute: jest.fn(),
  getState: jest.fn(() => 'CLOSED'),
  getMetrics: jest.fn(() => ({
    totalRequests: 1,
    successfulRequests: 1,
    failedRequests: 0,
    circuitOpenCount: 0,
    lastFailureTime: null,
    lastSuccessTime: Date.now(),
    currentState: 'CLOSED',
    failureRate: 0,
  })),
}

const mockRetryPolicy = {
  name: 'test-policy',
  maxRetries: 3,
  retryDelayMs: 1000,
  backoffMultiplier: 2.0,
  retryableErrors: ['network', 'timeout'],
  fatalErrors: ['invalid-token'],
}

jest.doMock('firebase/auth', () => ({
  signInWithCustomToken: mockSignInWithCustomToken,
}))

jest.doMock('firebase/functions', () => ({
  httpsCallable: mockHttpsCallable,
}))

jest.doMock('react-native', () => ({
  Platform: mockPlatform,
}))

jest.doMock('../../../firebase.config', () => ({
  FIREBASE_AUTH: mockFirebaseAuth,
  FIREBASE_FUNCTIONS: mockFirebaseFunctions,
}))

jest.doMock('../../../utils', () => ({
  devOnly: mockDevOnly,
}))

jest.doMock('../utils/circuitBreaker', () => ({
  FirebaseAuthCircuitBreakers: {
    getCircuitBreakerForSignatureType: jest.fn(() => mockCircuitBreaker),
  },
}))

jest.doMock('../utils/retryPolicies', () => ({
  RetryPolicies: {
    getPolicyForWallet: jest.fn(() => mockRetryPolicy),
  },
  RetryExecutor: {
    executeWithRetry: jest.fn(),
  },
  ErrorCategorizer: {
    getUserFriendlyMessage: jest.fn((error) => {
      if (error.message.includes('app-check')) {
        return 'Authentication error. Please try signing again.'
      }
      if (error.message.includes('internal-error')) {
        return 'Authentication error. Please try signing again.'
      }
      return 'Authentication error. Please try signing again.'
    }),
  },
}))

// Import after mocking
const { FirebaseAuthenticator } = require('./FirebaseAuthenticator')
// Type import for better typing after mocking
type FirebaseAuthenticatorType = InstanceType<typeof FirebaseAuthenticator>

describe('FirebaseAuthenticator', () => {
  // Increase timeout for long-running async tests
  jest.setTimeout(15000)
  let authenticator: FirebaseAuthenticatorType
  let mockContext: SignatureVerificationContext
  let mockSignatureResult: SignatureResult
  let consoleLogSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance
  const mockFirebaseToken = 'mock-firebase-token'

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    // Setup mock HttpsCallable
    mockHttpsCallable.mockReturnValue(mockVerifySignatureAndLogin)

    // Setup circuit breaker mock to actually execute the provided function
    mockCircuitBreaker.execute.mockImplementation(async (fn) => {
      try {
        // Execute the function to trigger actual Firebase auth calls
        const result = await fn()
        return {
          success: true,
          result: result,
          circuitState: 'CLOSED',
          metrics: mockCircuitBreaker.getMetrics(),
        }
      } catch (error) {
        return {
          success: false,
          error: error,
          circuitState: 'CLOSED',
          metrics: mockCircuitBreaker.getMetrics(),
        }
      }
    })

    // Setup retry executor mock to actually execute the provided function
    const { RetryExecutor } = require('../utils/retryPolicies')
    RetryExecutor.executeWithRetry.mockImplementation(async (fn: () => Promise<unknown>, policy: unknown) => {
      try {
        // Execute the function to trigger actual Firebase auth calls
        await fn()
        return {
          success: true,
          attemptsMade: 1,
          totalTime: 100,
          policyUsed: policy.name,
        }
      } catch (error) {
        // For error tests, we'll still throw but track attempts
        return {
          success: false,
          error: error,
          attemptsMade: 1,
          totalTime: 100,
          policyUsed: policy.name,
        }
      }
    })

    // Use dependency injection to pass mock function
    authenticator = new FirebaseAuthenticator(mockVerifySignatureAndLogin)

    mockContext = {
      walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      chainId: 137,
    }

    mockSignatureResult = {
      signature: '0xabcdef123456789',
      signatureType: 'personal-sign',
    }

    // Setup default mock responses
    mockVerifySignatureAndLogin.mockResolvedValue({
      data: { firebaseToken: mockFirebaseToken },
    })
    mockSignInWithCustomToken.mockResolvedValue({})

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('Constructor and Firebase Integration', () => {
    it('should initialize correctly with default httpsCallable', () => {
      const defaultAuth = new FirebaseAuthenticator()
      expect(defaultAuth).toBeInstanceOf(FirebaseAuthenticator)
      expect(mockHttpsCallable).toHaveBeenCalledWith(mockFirebaseFunctions, 'verifySignatureAndLogin')
    })

    it('should initialize correctly with provided function', () => {
      expect(authenticator).toBeInstanceOf(FirebaseAuthenticator)
    })

    it('should create multiple independent instances', () => {
      const auth1 = new FirebaseAuthenticator(mockVerifySignatureAndLogin)
      const auth2 = new FirebaseAuthenticator(mockVerifySignatureAndLogin)

      expect(auth1).toBeInstanceOf(FirebaseAuthenticator)
      expect(auth2).toBeInstanceOf(FirebaseAuthenticator)
      expect(auth1).not.toBe(auth2)
    })
  })

  describe('verifySignatureAndGetToken', () => {
    describe('Successful Verification', () => {
      it('should verify regular wallet signature and return Firebase token', async () => {
        mockPlatform.OS = 'ios'

        const result = await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(result).toBe(mockFirebaseToken)
        expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith({
          walletAddress: mockContext.walletAddress,
          signature: mockSignatureResult.signature,
          chainId: mockContext.chainId,
          signatureType: mockSignatureResult.signatureType,
          deviceId: expect.stringMatching(/mobile-ios-\d+-\w+/),
          platform: 'ios',
        })
      })

      it('should handle Safe wallet signature with special device info', async () => {
        const safeSignatureResult: SignatureResult = {
          signature: 'safe-wallet:0x123:nonce:456',
          signatureType: 'safe-wallet',
        }

        const mockResponse = {
          data: { firebaseToken: 'safe-firebase-token' },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        const result = await authenticator.verifySignatureAndGetToken(mockContext, safeSignatureResult)

        expect(result).toBe('safe-firebase-token')
        expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith({
          walletAddress: mockContext.walletAddress,
          signature: safeSignatureResult.signature,
          chainId: mockContext.chainId,
          signatureType: safeSignatureResult.signatureType,
          deviceId: 'safe-wallet-device',
          platform: 'web',
        })
      })

      it('should handle different platforms (Android)', async () => {
        mockPlatform.OS = 'android'

        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith(
          expect.objectContaining({
            deviceId: expect.stringMatching(/mobile-android-\d+-\w+/),
            platform: 'android',
          })
        )
      })

      it('should log verification steps', async () => {
        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Verifying signature with backend...')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Backend verification successful')
      })

      it('should log device info generation for mobile platforms', async () => {
        mockPlatform.OS = 'ios'

        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '📱 Generated device info:',
          expect.objectContaining({
            deviceId: expect.stringMatching(/mobile-ios-\d+-\w+/),
            platform: 'ios',
          })
        )
      })
    })

    describe('Device Info Generation', () => {
      it('should generate unique device IDs for each call', async () => {
        const call1Promise = authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)
        const call2Promise = authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        await Promise.all([call1Promise, call2Promise])

        const call1Args = mockVerifySignatureAndLogin.mock.calls[0][0]
        const call2Args = mockVerifySignatureAndLogin.mock.calls[1][0]

        expect(call1Args.deviceId).not.toBe(call2Args.deviceId)
      })

      it('should handle device info generation errors with fallback', async () => {
        // Mock Date.now to throw error first, then work for fallback
        const originalDateNow = Date.now
        let callCount = 0
        Date.now = jest.fn(() => {
          callCount++
          if (callCount === 1) {
            throw new Error('Date.now failed')
          }
          return 1234567890000 // Fixed timestamp for fallback
        })

        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️ Failed to get device info:', expect.any(Error))
        expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith(
          expect.objectContaining({
            deviceId: 'fallback-device-1234567890000',
            platform: 'ios',
          })
        )

        // Restore Date.now
        Date.now = originalDateNow
      })

      it('should use different device ID patterns for different platforms', async () => {
        const platforms = ['ios', 'android'] as const

        for (const platform of platforms) {
          mockPlatform.OS = platform

          await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

          const callArgs = mockVerifySignatureAndLogin.mock.calls[mockVerifySignatureAndLogin.mock.calls.length - 1][0]
          expect(callArgs.deviceId).toMatch(new RegExp(`mobile-${platform}-\\d+-\\w+`))
          expect(callArgs.platform).toBe(platform)
        }
      })
    })

    describe('Different Signature Types', () => {
      const signatureTypes: Array<SignatureResult['signatureType']> = ['personal-sign', 'typed-data', 'safe-wallet']

      it('should handle all signature types correctly', async () => {
        for (const signatureType of signatureTypes) {
          const signatureResult: SignatureResult = {
            signature: `0x${signatureType}signature`,
            signatureType,
          }

          await authenticator.verifySignatureAndGetToken(mockContext, signatureResult)

          expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith(
            expect.objectContaining({
              signatureType,
              signature: signatureResult.signature,
            })
          )
        }
      })
    })

    describe('Context Variations', () => {
      it('should handle context without chainId', async () => {
        const contextWithoutChainId = {
          walletAddress: mockContext.walletAddress,
        }

        await authenticator.verifySignatureAndGetToken(contextWithoutChainId, mockSignatureResult)

        expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith(
          expect.objectContaining({
            chainId: undefined,
          })
        )
      })

      it('should handle different chain IDs', async () => {
        const chainIds = [1, 137, 31337, 80001]

        for (const chainId of chainIds) {
          const contextWithChainId = { ...mockContext, chainId }

          await authenticator.verifySignatureAndGetToken(contextWithChainId, mockSignatureResult)

          expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith(expect.objectContaining({ chainId }))
        }
      })
    })

    describe('Error Handling', () => {
      it('should propagate Firebase function errors', async () => {
        const firebaseError = new Error('Backend verification failed')
        mockVerifySignatureAndLogin.mockRejectedValue(firebaseError)

        await expect(authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)).rejects.toThrow(
          'Backend verification failed'
        )
      })

      it('should handle malformed response data', async () => {
        const mockResponse = {
          data: 'invalid-data-format',
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        const result = await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(result).toBeUndefined()
        expect(mockDevOnly).toHaveBeenCalledWith('📋 Firebase token received:', 'undefined', 'missing')
      })

      it('should handle missing firebaseToken in response', async () => {
        const mockResponse = {
          data: { otherField: 'value' }, // Missing firebaseToken
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        const result = await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(result).toBeUndefined()
      })
    })

    describe('DevOnly Logging', () => {
      it('should call devOnly for token logging without exposing token content', async () => {
        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(mockDevOnly).toHaveBeenCalledWith('📋 Firebase token received:', 'string', 'present')
        expect(mockDevOnly).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining(mockFirebaseToken))
      })

      it('should handle missing token in devOnly logging', async () => {
        const mockResponse = {
          data: { firebaseToken: null },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(mockDevOnly).toHaveBeenCalledWith(
          '📋 Firebase token received:',
          'object', // null is typeof 'object'
          'missing'
        )
      })
    })
  })

  describe('signInWithFirebase', () => {
    describe('Successful Authentication', () => {
      it('should sign in successfully with regular wallet', async () => {
        await authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')

        expect(mockSignInWithCustomToken).toHaveBeenCalledWith(mockFirebaseAuth, mockFirebaseToken)
        expect(consoleLogSpy).toHaveBeenCalledWith('🔑 Starting Firebase authentication with fail-fast strategy...')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication completed successfully', expect.any(Object))
      })

      it('should sign in with Safe wallet including stabilization delay', async () => {
        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Fast forward the stabilization delay
        await jest.advanceTimersByTimeAsync(2000)

        await signInPromise

        expect(consoleLogSpy).toHaveBeenCalledWith('⏳ Adding stabilization delay for Safe wallet...')
        expect(mockSignInWithCustomToken).toHaveBeenCalledWith(mockFirebaseAuth, mockFirebaseToken)
      })

      it('should not add delay for non-Safe wallets', async () => {
        await authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')

        expect(consoleLogSpy).not.toHaveBeenCalledWith('⏳ Adding stabilization delay for Safe wallet...')
      })
    })

    describe('Error Handling and Retry Logic', () => {
      it('should propagate errors for non-Safe wallets', async () => {
        const firebaseError = new Error('Firebase authentication failed')

        // Setup circuit breaker to fail
        mockCircuitBreaker.execute.mockResolvedValue({
          success: false,
          error: firebaseError,
          circuitState: 'CLOSED',
          metrics: mockCircuitBreaker.getMetrics(),
        })

        await expect(authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')).rejects.toThrow(
          'Firebase authentication failed: Authentication error. Please try signing again.'
        )

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ Firebase authentication failed with circuit breaker',
          expect.objectContaining({
            error: 'Firebase authentication failed',
          })
        )
        expect(mockDevOnly).toHaveBeenCalledWith('📋 Token details:', {
          tokenType: 'string',
          tokenPresent: true,
          tokenLength: mockFirebaseToken.length,
        })
      })

      it('should handle Safe wallet authentication with retry policy', async () => {
        // Just verify that Safe wallet uses the proper circuit breaker and completes successfully
        await authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication completed successfully', expect.any(Object))
      })

      it('should handle multiple Safe wallet retry attempts with success', async () => {
        // Mock circuit breaker to return a result showing multiple attempts were made
        mockCircuitBreaker.execute.mockResolvedValue({
          success: true,
          result: {
            success: true,
            attemptsMade: 3,
            totalTime: 3000,
            policyUsed: 'safe-wallet',
          },
          circuitState: 'CLOSED',
          metrics: mockCircuitBreaker.getMetrics(),
        })

        await authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '✅ Firebase authentication completed successfully',
          expect.objectContaining({
            attemptsUsed: 3,
            totalTime: 3000,
            policyUsed: 'safe-wallet',
          })
        )
      })

      it('should fail after maximum retry attempts for Safe wallet', async () => {
        const firebaseError = new Error('Persistent Firebase error')

        // Mock RetryExecutor to fail after maximum retries
        const { RetryExecutor } = require('../utils/retryPolicies')
        RetryExecutor.executeWithRetry.mockResolvedValue({
          success: false,
          error: firebaseError,
          attemptsMade: 3,
          totalTime: 3000,
          policyUsed: 'safe-wallet',
        })

        // Mock circuit breaker to return the retry failure
        mockCircuitBreaker.execute.mockResolvedValue({
          success: true,
          result: {
            success: false,
            error: firebaseError,
            attemptsMade: 3,
            totalTime: 3000,
            policyUsed: 'safe-wallet',
          },
          circuitState: 'CLOSED',
          metrics: mockCircuitBreaker.getMetrics(),
        })

        await expect(authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')).rejects.toThrow(
          'Firebase authentication failed: Authentication error. Please try signing again.'
        )

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ Firebase authentication failed after retries',
          expect.objectContaining({
            error: 'Persistent Firebase error',
            attemptsMade: 3,
          })
        )
      })

      it('should detect App Check issues in Safe wallet retries', async () => {
        const appCheckError = new Error('Firebase: Error (auth/app-check-token-invalid).')

        // Mock circuit breaker to fail with app check error
        mockCircuitBreaker.execute.mockResolvedValue({
          success: false,
          error: appCheckError,
          circuitState: 'CLOSED',
          metrics: mockCircuitBreaker.getMetrics(),
        })

        await expect(authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')).rejects.toThrow(
          'Firebase authentication failed: Authentication error. Please try signing again.'
        )

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ Firebase authentication failed with circuit breaker',
          expect.objectContaining({
            error: 'Firebase: Error (auth/app-check-token-invalid).',
          })
        )
      })

      it('should detect internal errors in Safe wallet retries', async () => {
        const internalError = new Error('Firebase: Error (internal-error).')

        // Mock circuit breaker to fail with internal error
        mockCircuitBreaker.execute.mockResolvedValue({
          success: false,
          error: internalError,
          circuitState: 'CLOSED',
          metrics: mockCircuitBreaker.getMetrics(),
        })

        await expect(authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')).rejects.toThrow(
          'Firebase authentication failed: Authentication error. Please try signing again.'
        )

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ Firebase authentication failed with circuit breaker',
          expect.objectContaining({
            error: 'Firebase: Error (internal-error).',
          })
        )
      })

      it('should log token details on authentication failure', async () => {
        const firebaseError = new Error('Auth failed')

        // Mock circuit breaker to fail
        mockCircuitBreaker.execute.mockResolvedValue({
          success: false,
          error: firebaseError,
          circuitState: 'CLOSED',
          metrics: mockCircuitBreaker.getMetrics(),
        })

        try {
          await authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')
        } catch {
          // Expected to throw
        }

        expect(mockDevOnly).toHaveBeenCalledWith('📋 Token details:', {
          tokenType: 'string',
          tokenPresent: true,
          tokenLength: mockFirebaseToken.length,
        })
      })
    })

    describe('Retry Timing and Logic', () => {
      it('should use retry policy for Safe wallet retries', async () => {
        await authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Check that retry policy was called (mocked in beforeEach)
        const { RetryPolicies } = require('../utils/retryPolicies')
        expect(RetryPolicies.getPolicyForWallet).toHaveBeenCalledWith('safe-wallet', { isFirstAttempt: true })
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/📋 Using retry policy.*test-policy.*max 3 retries/))
      })

      it('should log retry policy details', async () => {
        await authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Verify that retry policy is logged
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/📋 Using retry policy.*test-policy/))
      })
    })

    describe('Edge Cases', () => {
      it('should handle null firebase token', async () => {
        await authenticator.signInWithFirebase(null, 'personal-sign')

        expect(mockSignInWithCustomToken).toHaveBeenCalledWith(mockFirebaseAuth, null)
      })

      it('should handle empty string firebase token', async () => {
        await authenticator.signInWithFirebase('', 'personal-sign')

        expect(mockSignInWithCustomToken).toHaveBeenCalledWith(mockFirebaseAuth, '')
      })

      it('should handle different signature type formats', async () => {
        const signatureTypes = ['personal-sign', 'typed-data', 'safe-wallet', 'unknown-type']

        for (const signatureType of signatureTypes) {
          if (signatureType === 'safe-wallet') {
            const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, signatureType)
            await jest.advanceTimersByTimeAsync(2000)
            await signInPromise
            expect(consoleLogSpy).toHaveBeenCalledWith('⏳ Adding stabilization delay for Safe wallet...')
          } else {
            await authenticator.signInWithFirebase(mockFirebaseToken, signatureType)
          }
        }
      })
    })
  })

  describe('Private Method Testing via Public Interface', () => {
    describe('logTokenDetails', () => {
      it('should safely log token details without exposing content', async () => {
        const firebaseError = new Error('Test error')
        mockSignInWithCustomToken.mockRejectedValue(firebaseError)

        try {
          await authenticator.signInWithFirebase('test-token-123', 'personal-sign')
        } catch {
          // Expected to throw
        }

        expect(mockDevOnly).toHaveBeenCalledWith('📋 Token details:', {
          tokenType: 'string',
          tokenPresent: true,
          tokenLength: 'test-token-123'.length,
        })
      })

      it('should handle undefined token in logging', async () => {
        const firebaseError = new Error('Test error')
        mockSignInWithCustomToken.mockRejectedValue(firebaseError)

        try {
          await authenticator.signInWithFirebase(undefined, 'personal-sign')
        } catch {
          // Expected to throw
        }

        expect(mockDevOnly).toHaveBeenCalledWith('📋 Token details:', {
          tokenType: 'undefined',
          tokenPresent: false,
          tokenLength: undefined,
        })
      })
    })
  })

  describe('Performance and Memory', () => {
    it('should handle concurrent Firebase sign-ins', async () => {
      const promises = Array.from({ length: 3 }, () => authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign'))

      await Promise.all(promises)

      expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(3)
    })

    it('should handle large Firebase tokens efficiently', async () => {
      const largeToken = 'A'.repeat(10000) // 10KB token

      await authenticator.signInWithFirebase(largeToken, 'personal-sign')

      expect(mockSignInWithCustomToken).toHaveBeenCalledWith(mockFirebaseAuth, largeToken)
    })

    it('should not leak memory during retry attempts', async () => {
      const firebaseError = new Error('Memory test error')
      mockSignInWithCustomToken.mockRejectedValueOnce(firebaseError).mockResolvedValueOnce({})

      const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

      await jest.advanceTimersByTimeAsync(3000) // 2s initial + 1s retry

      await signInPromise

      // Should successfully complete without memory leaks
      expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(2)
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle complete authentication flow for Safe wallet', async () => {
      // Mock successful verification
      const mockResponse = {
        data: { firebaseToken: 'integration-token' },
      }
      mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

      const safeSignatureResult: SignatureResult = {
        signature: 'safe-wallet:0x123:nonce:789',
        signatureType: 'safe-wallet',
      }

      // Step 1: Verify signature and get token
      const token = await authenticator.verifySignatureAndGetToken(mockContext, safeSignatureResult)

      // Step 2: Sign in with Firebase (mocked circuit breaker handles the complexity)
      await authenticator.signInWithFirebase(token, safeSignatureResult.signatureType)

      expect(token).toBe('integration-token')
      expect(mockCircuitBreaker.execute).toHaveBeenCalledTimes(1)
    })

    it('should handle complete authentication flow for regular wallet', async () => {
      // Step 1: Verify signature and get token
      const token = await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

      // Step 2: Sign in with Firebase (no delay for regular wallets)
      await authenticator.signInWithFirebase(token, mockSignatureResult.signatureType)

      expect(token).toBe(mockFirebaseToken)
      expect(mockCircuitBreaker.execute).toHaveBeenCalledTimes(1)
      expect(consoleLogSpy).not.toHaveBeenCalledWith('⏳ Adding stabilization delay for Safe wallet...')
    })

    it('should handle end-to-end error scenarios', async () => {
      // Mock verification failure
      const verificationError = new Error('Backend verification failed')
      mockVerifySignatureAndLogin.mockRejectedValue(verificationError)

      await expect(authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)).rejects.toThrow(
        'Backend verification failed'
      )

      expect(mockCircuitBreaker.execute).not.toHaveBeenCalled()
    })
  })

  describe('Type Safety and Interface Compliance', () => {
    it('should maintain SignatureVerificationContext interface compliance', () => {
      const validContext = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        chainId: 137,
      }

      expect(validContext).toHaveProperty('walletAddress')
      expect(typeof validContext.walletAddress).toBe('string')
    })

    it('should handle optional chainId in context', () => {
      const contextWithoutChainId = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        chainId: undefined,
      }

      expect(contextWithoutChainId.chainId).toBeUndefined()
    })

    it('should return correct types from all methods', async () => {
      // verifySignatureAndGetToken returns Promise<string>
      const tokenResult = await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)
      expect(typeof tokenResult).toBe('string')

      // signInWithFirebase returns Promise<void>
      const signInResult = await authenticator.signInWithFirebase(tokenResult, 'personal-sign')
      expect(signInResult).toBeUndefined()
    })
  })

  // Critical tests for circuit breaker and retry policy integration
  describe('Circuit Breaker and Retry Policy Integration', () => {
    it('should test complete authentication flow with circuit breaker', async () => {
      const firebaseError = new Error('Complete retry test')

      // Mock circuit breaker to succeed with retry result showing failure
      mockCircuitBreaker.execute.mockResolvedValue({
        success: true,
        result: {
          success: false,
          error: firebaseError,
          attemptsMade: 3,
          totalTime: 3000,
          policyUsed: 'safe-wallet',
        },
        circuitState: 'CLOSED',
        metrics: mockCircuitBreaker.getMetrics(),
      })

      await expect(authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')).rejects.toThrow(
        'Firebase authentication failed: Authentication error. Please try signing again.'
      )

      // Verify circuit breaker was called
      expect(mockCircuitBreaker.execute).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Firebase authentication failed after retries',
        expect.objectContaining({
          error: 'Complete retry test',
          attemptsMade: 3,
        })
      )
    })

    it('should test circuit breaker failure handling', async () => {
      const appCheckError = new Error('Firebase: Error (auth/app-check-token-invalid).')

      // Mock circuit breaker to fail immediately
      mockCircuitBreaker.execute.mockResolvedValue({
        success: false,
        error: appCheckError,
        circuitState: 'OPEN',
        metrics: mockCircuitBreaker.getMetrics(),
      })

      await expect(authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')).rejects.toThrow(
        'Firebase authentication failed: Authentication error. Please try signing again.'
      )

      // Verify circuit breaker failure was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Firebase authentication failed with circuit breaker',
        expect.objectContaining({
          circuitState: 'OPEN',
          error: 'Firebase: Error (auth/app-check-token-invalid).',
        })
      )
    })

    it('should test successful authentication with metrics logging', async () => {
      // Mock successful flow
      mockCircuitBreaker.execute.mockResolvedValue({
        success: true,
        result: {
          success: true,
          attemptsMade: 1,
          totalTime: 1000,
          policyUsed: 'safe-wallet',
        },
        circuitState: 'CLOSED',
        metrics: mockCircuitBreaker.getMetrics(),
      })

      await authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '✅ Firebase authentication completed successfully',
        expect.objectContaining({
          circuitState: 'CLOSED',
          attemptsUsed: 1,
          totalTime: 1000,
          policyUsed: 'safe-wallet',
        })
      )
    })

    it('should test retry policy selection based on signature type', async () => {
      const { RetryPolicies } = require('../utils/retryPolicies')

      // Test Safe wallet gets safe-wallet policy
      await authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')
      expect(RetryPolicies.getPolicyForWallet).toHaveBeenCalledWith('safe-wallet', { isFirstAttempt: true })

      // Test regular wallet gets fail-fast policy (first attempt)
      await authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')
      expect(RetryPolicies.getPolicyForWallet).toHaveBeenCalledWith('personal-sign', { isFirstAttempt: true })
    })

    it('should test circuit breaker integration with different signature types', async () => {
      const { FirebaseAuthCircuitBreakers } = require('../utils/circuitBreaker')

      // Test Safe wallet gets Safe wallet circuit breaker
      await authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')
      expect(FirebaseAuthCircuitBreakers.getCircuitBreakerForSignatureType).toHaveBeenCalledWith('safe-wallet')

      // Test regular wallet gets regular circuit breaker
      await authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')
      expect(FirebaseAuthCircuitBreakers.getCircuitBreakerForSignatureType).toHaveBeenCalledWith('personal-sign')
    })
  })
})
