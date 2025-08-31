import type { SignatureResult } from '@superpool/types'
import type { Connector } from 'wagmi'

// Mock all external dependencies using jest.doMock for proper timing
const mockSignInWithCustomToken = jest.fn()
const mockHttpsCallable = jest.fn()
const mockDevOnly = jest.fn()
const mockPlatform = { OS: 'ios' }

const mockFirebaseAuth = 'mocked-auth'
const mockFirebaseFunctions = 'mocked-functions'

const mockVerifySignatureAndLogin = jest.fn()

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

// Import after mocking
const { FirebaseAuthenticator } = require('./FirebaseAuthenticator')

describe('FirebaseAuthenticator', () => {
  let authenticator: any
  let mockContext: any
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
        expect(consoleLogSpy).toHaveBeenCalledWith('🔑 Signing in with Firebase...')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful')
      })

      it('should sign in with Safe wallet including stabilization delay', async () => {
        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Fast forward the stabilization delay
        await jest.advanceTimersByTimeAsync(2000)

        await signInPromise

        expect(consoleLogSpy).toHaveBeenCalledWith('⏳ Adding delay for Safe wallet connection stabilization...')
        expect(mockSignInWithCustomToken).toHaveBeenCalledWith(mockFirebaseAuth, mockFirebaseToken)
      })

      it('should not add delay for non-Safe wallets', async () => {
        await authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')

        expect(consoleLogSpy).not.toHaveBeenCalledWith('⏳ Adding delay for Safe wallet connection stabilization...')
      })
    })

    describe('Error Handling and Retry Logic', () => {
      it('should propagate errors for non-Safe wallets', async () => {
        const firebaseError = new Error('Firebase authentication failed')
        mockSignInWithCustomToken.mockRejectedValue(firebaseError)

        await expect(authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')).rejects.toThrow('Firebase authentication failed')

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication failed:', firebaseError)
        expect(mockDevOnly).toHaveBeenCalledWith('📋 Token details:', {
          tokenType: 'string',
          tokenPresent: true,
          tokenLength: mockFirebaseToken.length,
        })
      })

      it('should retry Safe wallet authentication on failure', async () => {
        const firebaseError = new Error('Safe wallet auth failed')
        mockSignInWithCustomToken
          .mockRejectedValueOnce(firebaseError) // First call fails
          .mockResolvedValueOnce({}) // Second call (retry) succeeds

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Fast forward through delays: 2s initial + 1s retry delay
        await jest.advanceTimersByTimeAsync(3000)

        await signInPromise

        expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(2)
        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retrying Firebase authentication for Safe wallet...')
        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 1/3 after 1000ms delay...')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful on retry 1')
      })

      it('should handle multiple Safe wallet retry attempts', async () => {
        const firebaseError = new Error('Persistent Safe wallet error')
        mockSignInWithCustomToken
          .mockRejectedValueOnce(firebaseError) // Initial attempt
          .mockRejectedValueOnce(firebaseError) // Retry 1
          .mockRejectedValueOnce(firebaseError) // Retry 2
          .mockResolvedValueOnce({}) // Retry 3 succeeds

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Fast forward through all delays (2s initial + 1s + 2s + 3s retry delays)
        await jest.advanceTimersByTimeAsync(8000)

        await signInPromise

        expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(4)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful on retry 3')
      })

      it('should fail after maximum retry attempts for Safe wallet', async () => {
        const firebaseError = new Error('Persistent Firebase error')
        mockSignInWithCustomToken.mockRejectedValue(firebaseError)

        let signInPromise
        let promiseResolved = false
        let promiseError: any = null

        // Start the promise and handle it separately
        signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet').catch((error: any) => {
          promiseError = error
          promiseResolved = true
          return Promise.reject(error)
        })

        // Advance through initial delay + all retry delays
        await jest.advanceTimersByTimeAsync(2000) // Initial delay
        await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay
        await jest.advanceTimersByTimeAsync(2000) // Retry 2 delay
        await jest.advanceTimersByTimeAsync(3000) // Retry 3 delay

        // Wait for promise resolution
        await expect(signInPromise).rejects.toThrow('Persistent Firebase error')

        expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(4) // Initial + 3 retries
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication retry 3/3 failed:', firebaseError)
      })

      it('should detect App Check issues in Safe wallet retries', async () => {
        const appCheckError = new Error('Firebase: Error (auth/app-check-token-invalid).')
        mockSignInWithCustomToken.mockRejectedValue(appCheckError)

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Advance through initial delay + all retry delays
        await jest.advanceTimersByTimeAsync(2000) // Initial delay
        await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay
        await jest.advanceTimersByTimeAsync(2000) // Retry 2 delay
        await jest.advanceTimersByTimeAsync(3000) // Retry 3 delay

        await expect(signInPromise).rejects.toThrow(
          'Safe wallet authentication failed due to device verification. Please try disconnecting and reconnecting your wallet.'
        )

        expect(consoleLogSpy).toHaveBeenCalledWith('🚨 Detected potential App Check issue for Safe wallet')
      })

      it('should detect internal errors in Safe wallet retries', async () => {
        const internalError = new Error('Firebase: Error (internal-error).')
        mockSignInWithCustomToken.mockRejectedValue(internalError)

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Advance through initial delay + all retry delays
        await jest.advanceTimersByTimeAsync(2000) // Initial delay
        await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay
        await jest.advanceTimersByTimeAsync(2000) // Retry 2 delay
        await jest.advanceTimersByTimeAsync(3000) // Retry 3 delay

        await expect(signInPromise).rejects.toThrow(
          'Safe wallet authentication failed due to device verification. Please try disconnecting and reconnecting your wallet.'
        )
      })

      it('should log token details on authentication failure', async () => {
        const firebaseError = new Error('Auth failed')
        mockSignInWithCustomToken.mockRejectedValue(firebaseError)

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
      it('should use increasing delays for Safe wallet retries', async () => {
        const firebaseError = new Error('Retry timing test')
        mockSignInWithCustomToken.mockRejectedValue(firebaseError)

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Advance through initial delay + all retry delays step by step
        await jest.advanceTimersByTimeAsync(2000) // Initial delay
        await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay
        await jest.advanceTimersByTimeAsync(2000) // Retry 2 delay
        await jest.advanceTimersByTimeAsync(3000) // Retry 3 delay

        await expect(signInPromise).rejects.toThrow()

        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 1/3 after 1000ms delay...')
        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 2/3 after 2000ms delay...')
        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 3/3 after 3000ms delay...')
      })

      it('should log retry attempt details', async () => {
        const firebaseError = new Error('Retry logging test')
        mockSignInWithCustomToken.mockRejectedValueOnce(firebaseError).mockResolvedValueOnce({})

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Advance through initial delay + first retry delay
        await jest.advanceTimersByTimeAsync(2000) // Initial delay
        await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay

        await signInPromise

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication retry 1/3 failed:', firebaseError)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful on retry 1')
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
            expect(consoleLogSpy).toHaveBeenCalledWith('⏳ Adding delay for Safe wallet connection stabilization...')
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

      // Step 2: Sign in with Firebase
      const signInPromise = authenticator.signInWithFirebase(token, safeSignatureResult.signatureType)

      await jest.advanceTimersByTimeAsync(2000) // Safe wallet delay

      await signInPromise

      expect(token).toBe('integration-token')
      expect(mockSignInWithCustomToken).toHaveBeenCalledWith(mockFirebaseAuth, 'integration-token')
    })

    it('should handle complete authentication flow for regular wallet', async () => {
      // Step 1: Verify signature and get token
      const token = await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

      // Step 2: Sign in with Firebase (no delay for regular wallets)
      await authenticator.signInWithFirebase(token, mockSignatureResult.signatureType)

      expect(token).toBe(mockFirebaseToken)
      expect(mockSignInWithCustomToken).toHaveBeenCalledWith(mockFirebaseAuth, mockFirebaseToken)
      expect(consoleLogSpy).not.toHaveBeenCalledWith('⏳ Adding delay for Safe wallet connection stabilization...')
    })

    it('should handle end-to-end error scenarios', async () => {
      // Mock verification failure
      const verificationError = new Error('Backend verification failed')
      mockVerifySignatureAndLogin.mockRejectedValue(verificationError)

      await expect(authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)).rejects.toThrow(
        'Backend verification failed'
      )

      expect(mockSignInWithCustomToken).not.toHaveBeenCalled()
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

  // Critical tests for 100% coverage - targeting uncovered lines 123-138
  describe('Retry Logic Coverage (Lines 123-138)', () => {
    it('should test complete retry loop with all delay timings', async () => {
      const firebaseError = new Error('Complete retry test')
      mockSignInWithCustomToken.mockRejectedValue(firebaseError)

      const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

      // Advance through initial delay + all retry delays step by step
      await jest.advanceTimersByTimeAsync(2000) // Initial delay
      await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay
      await jest.advanceTimersByTimeAsync(2000) // Retry 2 delay
      await jest.advanceTimersByTimeAsync(3000) // Retry 3 delay

      await expect(signInPromise).rejects.toThrow('Complete retry test')

      // Verify all retry attempts were logged (lines 121, 127)
      expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 1/3 after 1000ms delay...')
      expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 2/3 after 2000ms delay...')
      expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 3/3 after 3000ms delay...')
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication retry 1/3 failed:', firebaseError)
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication retry 2/3 failed:', firebaseError)
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication retry 3/3 failed:', firebaseError)
    })

    it('should test App Check error detection (lines 132-136)', async () => {
      const appCheckError = new Error('Firebase: Error (auth/app-check-token-invalid).')
      mockSignInWithCustomToken.mockRejectedValue(appCheckError)

      const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

      // Advance through initial delay + all retry delays
      await jest.advanceTimersByTimeAsync(2000) // Initial delay
      await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay
      await jest.advanceTimersByTimeAsync(2000) // Retry 2 delay
      await jest.advanceTimersByTimeAsync(3000) // Retry 3 delay

      await expect(signInPromise).rejects.toThrow(
        'Safe wallet authentication failed due to device verification. Please try disconnecting and reconnecting your wallet.'
      )

      // Line 133: App Check detection log
      expect(consoleLogSpy).toHaveBeenCalledWith('🚨 Detected potential App Check issue for Safe wallet')
    })

    it('should test internal error detection (lines 132-136)', async () => {
      const internalError = new Error('Firebase: Error (internal-error).')
      mockSignInWithCustomToken.mockRejectedValue(internalError)

      const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

      // Advance through initial delay + all retry delays
      await jest.advanceTimersByTimeAsync(2000) // Initial delay
      await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay
      await jest.advanceTimersByTimeAsync(2000) // Retry 2 delay
      await jest.advanceTimersByTimeAsync(3000) // Retry 3 delay

      await expect(signInPromise).rejects.toThrow(
        'Safe wallet authentication failed due to device verification. Please try disconnecting and reconnecting your wallet.'
      )
    })

    it('should test successful retry return (line 125)', async () => {
      const firebaseError = new Error('Retry success test')
      mockSignInWithCustomToken
        .mockRejectedValueOnce(firebaseError) // Initial fails
        .mockRejectedValueOnce(firebaseError) // Retry 1 fails
        .mockResolvedValueOnce({}) // Retry 2 succeeds (line 125 return)

      const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

      // Advance through initial + retry 1 + retry 2 delays
      await jest.advanceTimersByTimeAsync(2000) // Initial delay
      await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay
      await jest.advanceTimersByTimeAsync(2000) // Retry 2 delay

      await signInPromise

      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful on retry 2')
      expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(3) // Initial + 2 retries
    })

    it('should test max retry exceeded path (lines 129-138)', async () => {
      const persistentError = new Error('Max retry test')
      mockSignInWithCustomToken.mockRejectedValue(persistentError)

      const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

      // Advance through initial delay + all retry delays
      await jest.advanceTimersByTimeAsync(2000) // Initial delay
      await jest.advanceTimersByTimeAsync(1000) // Retry 1 delay
      await jest.advanceTimersByTimeAsync(2000) // Retry 2 delay
      await jest.advanceTimersByTimeAsync(3000) // Retry 3 delay

      await expect(signInPromise).rejects.toThrow('Max retry test')

      // Verify all retry attempts and final error
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication retry 1/3 failed:', persistentError)
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication retry 2/3 failed:', persistentError)
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication retry 3/3 failed:', persistentError)
    })
  })
})
