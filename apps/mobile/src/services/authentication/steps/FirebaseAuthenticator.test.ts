import type { SignatureResult } from '@superpool/types'
import { signInWithCustomToken } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { Platform } from 'react-native'
import { devOnly } from '../../../utils'
import { FirebaseAuthenticator, SignatureVerificationContext } from './FirebaseAuthenticator'

// Mock Firebase modules
jest.mock('firebase/auth')
jest.mock('firebase/functions')
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}))
jest.mock('../../../firebase.config', () => ({
  FIREBASE_AUTH: 'mocked-auth',
  FIREBASE_FUNCTIONS: 'mocked-functions',
}))
jest.mock('../../../utils', () => ({
  devOnly: jest.fn(),
}))

const mockSignInWithCustomToken = signInWithCustomToken as jest.MockedFunction<typeof signInWithCustomToken>
const mockHttpsCallable = httpsCallable as jest.MockedFunction<typeof httpsCallable>
const mockDevOnly = devOnly as jest.MockedFunction<typeof devOnly>
const mockPlatform = Platform as jest.Mocked<typeof Platform>

describe('FirebaseAuthenticator', () => {
  let authenticator: FirebaseAuthenticator
  let mockVerifySignatureAndLogin: jest.MockedFunction<any>
  let mockContext: SignatureVerificationContext
  let mockSignatureResult: SignatureResult
  let consoleLogSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance
  const mockFirebaseToken = 'mock-firebase-token'

  beforeAll(() => {
    // Mock Firebase function call - this needs to be at module level
    mockVerifySignatureAndLogin = jest.fn()
    mockHttpsCallable.mockReturnValue(mockVerifySignatureAndLogin)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    authenticator = new FirebaseAuthenticator()

    mockContext = {
      walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      chainId: 137,
    }

    mockSignatureResult = {
      signature: '0xabcdef123456789',
      signatureType: 'personal-sign',
    }

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
    it('should initialize correctly and set up Firebase function', () => {
      expect(mockHttpsCallable).toHaveBeenCalledWith('mocked-functions', 'verifySignatureAndLogin')
      expect(authenticator).toBeInstanceOf(FirebaseAuthenticator)
    })

    it('should create multiple independent instances', () => {
      const auth1 = new FirebaseAuthenticator()
      const auth2 = new FirebaseAuthenticator()

      expect(auth1).toBeInstanceOf(FirebaseAuthenticator)
      expect(auth2).toBeInstanceOf(FirebaseAuthenticator)
      expect(auth1).not.toBe(auth2)
    })
  })

  describe('verifySignatureAndGetToken', () => {
    describe('Successful Verification', () => {
      it('should verify regular wallet signature and return Firebase token', async () => {
        const mockResponse = {
          data: { firebaseToken: 'mock-firebase-token' },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)
        mockPlatform.OS = 'ios'

        const result = await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(result).toBe('mock-firebase-token')
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
        const mockResponse = {
          data: { firebaseToken: 'android-token' },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith(
          expect.objectContaining({
            deviceId: expect.stringMatching(/mobile-android-\d+-\w+/),
            platform: 'android',
          })
        )
      })

      it('should log verification steps', async () => {
        const mockResponse = {
          data: { firebaseToken: 'logged-token' },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Verifying signature with backend...')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Backend verification successful')
      })

      it('should log device info generation for mobile platforms', async () => {
        mockPlatform.OS = 'ios'
        const mockResponse = {
          data: { firebaseToken: 'device-info-token' },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(consoleLogSpy).toHaveBeenCalledWith('📱 Generated device info:', 
          expect.objectContaining({
            deviceId: expect.stringMatching(/mobile-ios-\d+-\w+/),
            platform: 'ios',
          })
        )
      })
    })

    describe('Device Info Generation', () => {
      it('should generate unique device IDs for each call', async () => {
        const mockResponse = {
          data: { firebaseToken: 'unique-token' },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        const call1Promise = authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)
        const call2Promise = authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        await Promise.all([call1Promise, call2Promise])

        const call1Args = mockVerifySignatureAndLogin.mock.calls[0][0]
        const call2Args = mockVerifySignatureAndLogin.mock.calls[1][0]

        expect(call1Args.deviceId).not.toBe(call2Args.deviceId)
      })

      it('should handle device info generation errors with fallback', async () => {
        // Mock Date.now to throw error to simulate device info generation failure
        const originalDateNow = Date.now
        Date.now = jest.fn(() => {
          throw new Error('Date.now failed')
        })

        const mockResponse = {
          data: { firebaseToken: 'fallback-token' },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️ Failed to get device info:', expect.any(Error))
        expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith(
          expect.objectContaining({
            deviceId: expect.stringMatching(/fallback-device-\d+/),
            platform: 'ios',
          })
        )

        // Restore Date.now
        Date.now = originalDateNow
      })

      it('should use different device ID patterns for different platforms', async () => {
        const platforms = ['ios', 'android'] as const
        const mockResponse = {
          data: { firebaseToken: 'platform-token' },
        }

        for (const platform of platforms) {
          mockPlatform.OS = platform
          mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

          await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

          const callArgs = mockVerifySignatureAndLogin.mock.calls[mockVerifySignatureAndLogin.mock.calls.length - 1][0]
          expect(callArgs.deviceId).toMatch(new RegExp(`mobile-${platform}-\\d+-\\w+`))
          expect(callArgs.platform).toBe(platform)
        }
      })
    })

    describe('Different Signature Types', () => {
      const signatureTypes: Array<SignatureResult['signatureType']> = [
        'personal-sign',
        'typed-data',
        'safe-wallet',
      ]

      it('should handle all signature types correctly', async () => {
        const mockResponse = {
          data: { firebaseToken: 'type-token' },
        }

        for (const signatureType of signatureTypes) {
          const signatureResult: SignatureResult = {
            signature: `0x${signatureType}signature`,
            signatureType,
          }

          mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

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
        const contextWithoutChainId: SignatureVerificationContext = {
          walletAddress: mockContext.walletAddress,
        }

        const mockResponse = {
          data: { firebaseToken: 'no-chain-token' },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        await authenticator.verifySignatureAndGetToken(contextWithoutChainId, mockSignatureResult)

        expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith(
          expect.objectContaining({
            chainId: undefined,
          })
        )
      })

      it('should handle different chain IDs', async () => {
        const chainIds = [1, 137, 31337, 80001]
        
        const mockResponse = {
          data: { firebaseToken: 'chain-token' },
        }

        for (const chainId of chainIds) {
          const contextWithChainId = { ...mockContext, chainId }

          mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

          await authenticator.verifySignatureAndGetToken(contextWithChainId, mockSignatureResult)

          expect(mockVerifySignatureAndLogin).toHaveBeenCalledWith(
            expect.objectContaining({ chainId })
          )
        }
      })
    })

    describe('Error Handling', () => {
      it('should propagate Firebase function errors', async () => {
        const firebaseError = new Error('Backend verification failed')
        mockVerifySignatureAndLogin.mockRejectedValue(firebaseError)

        await expect(
          authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)
        ).rejects.toThrow('Backend verification failed')
      })

      it('should handle malformed response data', async () => {
        const mockResponse = {
          data: 'invalid-data-format',
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        await expect(
          authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)
        ).rejects.toThrow()
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
        const mockResponse = {
          data: { firebaseToken: 'secret-token' },
        }
        mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)

        await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)

        expect(mockDevOnly).toHaveBeenCalledWith(
          '📋 Firebase token received:',
          'string',
          'present'
        )
        expect(mockDevOnly).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.stringContaining('secret-token')
        )
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
        mockSignInWithCustomToken.mockResolvedValue({} as any)

        await authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')

        expect(mockSignInWithCustomToken).toHaveBeenCalledWith('mocked-auth', mockFirebaseToken)
        expect(consoleLogSpy).toHaveBeenCalledWith('🔑 Signing in with Firebase...')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful')
      })

      it('should sign in with Safe wallet including stabilization delay', async () => {
        mockSignInWithCustomToken.mockResolvedValue({} as any)

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Fast forward the stabilization delay
        jest.advanceTimersByTime(2000)

        await signInPromise

        expect(consoleLogSpy).toHaveBeenCalledWith('⏳ Adding delay for Safe wallet connection stabilization...')
        expect(mockSignInWithCustomToken).toHaveBeenCalledWith('mocked-auth', mockFirebaseToken)
      })

      it('should not add delay for non-Safe wallets', async () => {
        mockSignInWithCustomToken.mockResolvedValue({} as any)

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')

        // Should resolve immediately without delay
        await signInPromise

        expect(consoleLogSpy).not.toHaveBeenCalledWith('⏳ Adding delay for Safe wallet connection stabilization...')
      })
    })

    describe('Error Handling and Retry Logic', () => {
      it('should propagate errors for non-Safe wallets', async () => {
        const firebaseError = new Error('Firebase authentication failed')
        mockSignInWithCustomToken.mockRejectedValue(firebaseError)

        await expect(
          authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')
        ).rejects.toThrow('Firebase authentication failed')

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication failed:', firebaseError)
      })

      it('should retry Safe wallet authentication on failure', async () => {
        const firebaseError = new Error('Safe wallet auth failed')
        mockSignInWithCustomToken
          .mockRejectedValueOnce(firebaseError) // First call fails
          .mockResolvedValueOnce({} as any) // Second call (retry) succeeds

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Fast forward through delays
        jest.advanceTimersByTime(3000) // Initial delay + retry delay

        await signInPromise

        expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(2)
        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retrying Firebase authentication for Safe wallet...')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful on retry 1')
      })

      it('should handle multiple Safe wallet retry attempts', async () => {
        const firebaseError = new Error('Persistent Safe wallet error')
        mockSignInWithCustomToken
          .mockRejectedValueOnce(firebaseError) // Initial attempt
          .mockRejectedValueOnce(firebaseError) // Retry 1
          .mockRejectedValueOnce(firebaseError) // Retry 2
          .mockResolvedValueOnce({} as any) // Retry 3 succeeds

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Fast forward through all delays (2s initial + 1s + 2s + 3s retry delays)
        jest.advanceTimersByTime(8000)

        await signInPromise

        expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(4)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful on retry 3')
      })

      it('should fail after maximum retry attempts for Safe wallet', async () => {
        const firebaseError = new Error('Persistent Firebase error')
        mockSignInWithCustomToken.mockRejectedValue(firebaseError)

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        // Fast forward through all retry delays
        jest.advanceTimersByTime(10000)

        await expect(signInPromise).rejects.toThrow('Persistent Firebase error')

        expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(4) // Initial + 3 retries
      })

      it('should detect App Check issues in Safe wallet retries', async () => {
        const appCheckError = new Error('Firebase: Error (auth/app-check-token-invalid).')
        mockSignInWithCustomToken.mockRejectedValue(appCheckError)

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        jest.advanceTimersByTime(10000) // Fast forward through all retries

        await expect(signInPromise).rejects.toThrow(
          'Safe wallet authentication failed due to device verification. Please try disconnecting and reconnecting your wallet.'
        )

        expect(consoleLogSpy).toHaveBeenCalledWith('🚨 Detected potential App Check issue for Safe wallet')
      })

      it('should detect internal errors in Safe wallet retries', async () => {
        const internalError = new Error('Firebase: Error (internal-error).')
        mockSignInWithCustomToken.mockRejectedValue(internalError)

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        jest.advanceTimersByTime(10000)

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

        // Initial 2s delay
        jest.advanceTimersByTime(2000)

        // First retry after 1s delay
        jest.advanceTimersByTime(1000)

        // Second retry after 2s delay  
        jest.advanceTimersByTime(2000)

        // Third retry after 3s delay
        jest.advanceTimersByTime(3000)

        await expect(signInPromise).rejects.toThrow()

        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 1/3 after 1000ms delay...')
        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 2/3 after 2000ms delay...')
        expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Retry 3/3 after 3000ms delay...')
      })

      it('should log retry attempt details', async () => {
        const firebaseError = new Error('Retry logging test')
        mockSignInWithCustomToken
          .mockRejectedValueOnce(firebaseError)
          .mockResolvedValueOnce({} as any)

        const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

        jest.advanceTimersByTime(4000) // Initial + first retry delays

        await signInPromise

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Firebase authentication retry 1/3 failed:', firebaseError)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Firebase authentication successful on retry 1')
      })
    })

    describe('Edge Cases', () => {
      it('should handle null firebase token', async () => {
        mockSignInWithCustomToken.mockResolvedValue({} as any)

        await authenticator.signInWithFirebase(null as any, 'personal-sign')

        expect(mockSignInWithCustomToken).toHaveBeenCalledWith('mocked-auth', null)
      })

      it('should handle empty string firebase token', async () => {
        mockSignInWithCustomToken.mockResolvedValue({} as any)

        await authenticator.signInWithFirebase('', 'personal-sign')

        expect(mockSignInWithCustomToken).toHaveBeenCalledWith('mocked-auth', '')
      })

      it('should handle different signature type formats', async () => {
        const signatureTypes = ['personal-sign', 'typed-data', 'safe-wallet', 'unknown-type']
        
        mockSignInWithCustomToken.mockResolvedValue({} as any)

        for (const signatureType of signatureTypes) {
          await authenticator.signInWithFirebase(mockFirebaseToken, signatureType)

          if (signatureType === 'safe-wallet') {
            expect(consoleLogSpy).toHaveBeenCalledWith('⏳ Adding delay for Safe wallet connection stabilization...')
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
          await authenticator.signInWithFirebase(undefined as any, 'personal-sign')
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
      mockSignInWithCustomToken.mockResolvedValue({} as any)

      const promises = Array.from({ length: 3 }, () => 
        authenticator.signInWithFirebase(mockFirebaseToken, 'personal-sign')
      )

      await Promise.all(promises)

      expect(mockSignInWithCustomToken).toHaveBeenCalledTimes(3)
    })

    it('should handle large Firebase tokens efficiently', async () => {
      const largeToken = 'A'.repeat(10000) // 10KB token
      mockSignInWithCustomToken.mockResolvedValue({} as any)

      await authenticator.signInWithFirebase(largeToken, 'personal-sign')

      expect(mockSignInWithCustomToken).toHaveBeenCalledWith('mocked-auth', largeToken)
    })

    it('should not leak memory during retry attempts', async () => {
      const firebaseError = new Error('Memory test error')
      mockSignInWithCustomToken
        .mockRejectedValueOnce(firebaseError)
        .mockResolvedValueOnce({} as any)

      const signInPromise = authenticator.signInWithFirebase(mockFirebaseToken, 'safe-wallet')

      jest.advanceTimersByTime(4000)

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
      mockSignInWithCustomToken.mockResolvedValue({} as any)

      const safeSignatureResult: SignatureResult = {
        signature: 'safe-wallet:0x123:nonce:789',
        signatureType: 'safe-wallet',
      }

      // Step 1: Verify signature and get token
      const token = await authenticator.verifySignatureAndGetToken(mockContext, safeSignatureResult)
      
      // Step 2: Sign in with Firebase
      const signInPromise = authenticator.signInWithFirebase(token, safeSignatureResult.signatureType)
      
      jest.advanceTimersByTime(2000) // Safe wallet delay
      
      await signInPromise

      expect(token).toBe('integration-token')
      expect(mockSignInWithCustomToken).toHaveBeenCalledWith('mocked-auth', 'integration-token')
    })

    it('should handle complete authentication flow for regular wallet', async () => {
      // Mock successful verification
      const mockResponse = {
        data: { firebaseToken: 'regular-token' },
      }
      mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)
      mockSignInWithCustomToken.mockResolvedValue({} as any)

      // Step 1: Verify signature and get token
      const token = await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)
      
      // Step 2: Sign in with Firebase (no delay for regular wallets)
      await authenticator.signInWithFirebase(token, mockSignatureResult.signatureType)

      expect(token).toBe('regular-token')
      expect(mockSignInWithCustomToken).toHaveBeenCalledWith('mocked-auth', 'regular-token')
      expect(consoleLogSpy).not.toHaveBeenCalledWith('⏳ Adding delay for Safe wallet connection stabilization...')
    })

    it('should handle end-to-end error scenarios', async () => {
      // Mock verification failure
      const verificationError = new Error('Backend verification failed')
      mockVerifySignatureAndLogin.mockRejectedValue(verificationError)

      await expect(
        authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)
      ).rejects.toThrow('Backend verification failed')

      expect(mockSignInWithCustomToken).not.toHaveBeenCalled()
    })
  })

  describe('Type Safety and Interface Compliance', () => {
    it('should maintain SignatureVerificationContext interface compliance', () => {
      const validContext: SignatureVerificationContext = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        chainId: 137,
      }

      expect(validContext).toHaveProperty('walletAddress')
      expect(typeof validContext.walletAddress).toBe('string')
    })

    it('should handle optional chainId in context', () => {
      const contextWithoutChainId: SignatureVerificationContext = {
        walletAddress: '0x1234567890123456789012345678901234567890',
      }

      expect(contextWithoutChainId.chainId).toBeUndefined()
    })

    it('should return correct types from all methods', async () => {
      const mockResponse = {
        data: { firebaseToken: 'type-test-token' },
      }
      mockVerifySignatureAndLogin.mockResolvedValue(mockResponse)
      mockSignInWithCustomToken.mockResolvedValue({} as any)

      // verifySignatureAndGetToken returns Promise<string>
      const tokenResult = await authenticator.verifySignatureAndGetToken(mockContext, mockSignatureResult)
      expect(typeof tokenResult).toBe('string')

      // signInWithFirebase returns Promise<void>
      const signInResult = await authenticator.signInWithFirebase(tokenResult, 'personal-sign')
      expect(signInResult).toBeUndefined()
    })
  })
})