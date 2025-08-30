import type { AuthProgressCallbacks, AuthenticationContext } from '@superpool/types'
import { router } from 'expo-router'
import type { Connector } from 'wagmi'
import { AuthenticationStore } from '../../stores/AuthenticationStore'
import { WalletStore } from '../../stores/WalletStore'
import { SessionManager, authToasts } from '../../utils'
import { AuthErrorRecoveryService } from '../errorRecovery'
import { AuthenticationStepExecutor, AuthenticationValidator, FirebaseAuthenticator, MessageGenerator, SignatureHandler } from './steps'
import { AuthenticationOrchestrator, type AuthenticationLock } from './AuthenticationOrchestrator'

// Mock all external dependencies
jest.mock('expo-router')
jest.mock('../../firebase.config', () => ({
  FIREBASE_AUTH: { currentUser: null },
}))
jest.mock('../../stores/AuthenticationStore')
jest.mock('../../stores/WalletStore')
jest.mock('../../utils', () => ({
  SessionManager: { getSessionDebugInfo: jest.fn() },
  authToasts: { success: jest.fn() },
}))
jest.mock('../errorRecovery')
jest.mock('./steps', () => ({
  AuthenticationStepExecutor: jest.fn(),
  AuthenticationValidator: jest.fn(),
  FirebaseAuthenticator: jest.fn(),
  MessageGenerator: jest.fn(),
  SignatureHandler: jest.fn(),
}))

const mockRouter = router as jest.Mocked<typeof router>
const mockSessionManager = SessionManager as jest.Mocked<typeof SessionManager>
const mockAuthToasts = authToasts as jest.Mocked<typeof authToasts>
const mockAuthErrorRecoveryService = AuthErrorRecoveryService as jest.Mocked<typeof AuthErrorRecoveryService>

const mockAuthenticationStepExecutor = AuthenticationStepExecutor as jest.MockedClass<typeof AuthenticationStepExecutor>
const mockAuthenticationValidator = AuthenticationValidator as jest.MockedClass<typeof AuthenticationValidator>
const mockFirebaseAuthenticator = FirebaseAuthenticator as jest.MockedClass<typeof FirebaseAuthenticator>
const mockMessageGenerator = MessageGenerator as jest.MockedClass<typeof MessageGenerator>
const mockSignatureHandler = SignatureHandler as jest.MockedClass<typeof SignatureHandler>

const mockAuthenticationStore = AuthenticationStore as jest.MockedClass<typeof AuthenticationStore>
const mockWalletStore = WalletStore as jest.MockedClass<typeof WalletStore>

describe('AuthenticationOrchestrator', () => {
  let orchestrator: AuthenticationOrchestrator
  let mockAuthStore: jest.Mocked<AuthenticationStore>
  let mockWalletStore: jest.Mocked<WalletStore>
  let mockStepExecutor: jest.Mocked<AuthenticationStepExecutor>
  let mockValidator: jest.Mocked<AuthenticationValidator>
  let mockFirebaseAuth: jest.Mocked<FirebaseAuthenticator>
  let mockMessageGen: jest.Mocked<MessageGenerator>
  let mockSignatureHandlerInstance: jest.Mocked<SignatureHandler>
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  const mockAuthContext: AuthenticationContext = {
    walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
    chainId: 137,
    connector: 'mock-connector' as any,
    disconnect: jest.fn(),
    signatureFunctions: {
      personalSign: jest.fn(),
      signTypedData: jest.fn(),
    } as any,
    progressCallbacks: {
      onStepStart: jest.fn(),
      onStepComplete: jest.fn(),
      onStepFail: jest.fn(),
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    // Mock store instances
    mockAuthStore = {
      isAuthenticating: false,
      authWalletAddress: null,
      authLock: {
        isLocked: false,
        startTime: 0,
        walletAddress: null,
        abortController: null,
        requestId: null,
      },
      acquireAuthLock: jest.fn().mockReturnValue(true),
      releaseAuthLock: jest.fn(),
      reset: jest.fn(),
    } as any

    mockWalletStore = {
      captureState: jest.fn(),
      validateState: jest.fn(),
    } as any

    // Mock step module instances
    mockStepExecutor = {
      executeStep: jest.fn(),
      executeLockStep: jest.fn(),
      executeInternalStep: jest.fn(),
    } as any

    mockValidator = {
      validatePreConditions: jest.fn(),
      validateStateConsistency: jest.fn().mockReturnValue(true),
      checkAuthenticationAborted: jest.fn().mockReturnValue(false),
      captureConnectionState: jest.fn().mockReturnValue({
        address: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
        chainId: 137,
        isConnected: true,
        timestamp: Date.now(),
        sequenceNumber: 1,
      }),
    } as any

    mockFirebaseAuth = {
      verifySignatureAndGetToken: jest.fn().mockResolvedValue('mock-firebase-token'),
      signInWithFirebase: jest.fn().mockResolvedValue(undefined),
    } as any

    mockMessageGen = {
      generateAuthenticationMessage: jest.fn().mockResolvedValue({
        message: 'Mock auth message',
        nonce: 'mock-nonce',
        timestamp: Date.now(),
      }),
    } as any

    mockSignatureHandlerInstance = {
      requestWalletSignature: jest.fn().mockResolvedValue({
        signature: 'mock-signature',
        signatureType: 'personal-sign',
        walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      }),
    } as any

    // Mock class constructors
    mockAuthenticationStepExecutor.mockImplementation(() => mockStepExecutor)
    mockAuthenticationValidator.mockImplementation(() => mockValidator)
    mockFirebaseAuthenticator.mockImplementation(() => mockFirebaseAuth)
    mockMessageGenerator.mockImplementation(() => mockMessageGen)
    mockSignatureHandler.mockImplementation(() => mockSignatureHandlerInstance)
    mockAuthenticationStore.mockImplementation(() => mockAuthStore)
    // mockWalletStore constructor mocking is handled differently for class constructors

    // Mock external services
    mockSessionManager.getSessionDebugInfo.mockResolvedValue({
      totalKeys: 5,
      walletConnectKeys: ['key1', 'key2'],
      sessionData: {},
    } as any)
    mockAuthErrorRecoveryService.initialize.mockImplementation()
    mockAuthErrorRecoveryService.handleAuthenticationError.mockResolvedValue({
      appError: new Error('Mock error') as any,
      recoveryResult: { 
        shouldDisconnect: false, 
        shouldShowError: true, 
        errorDelay: 0, 
        cleanupPerformed: false 
      },
    } as any)
    mockAuthErrorRecoveryService.showErrorFeedback.mockImplementation()
    mockAuthErrorRecoveryService.handleFirebaseCleanup.mockResolvedValue()

    // Create orchestrator instance
    orchestrator = new AuthenticationOrchestrator(mockAuthStore, mockWalletStore)

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('Constructor and Initialization', () => {
    it('should initialize correctly with stores and step modules', () => {
      expect(mockAuthErrorRecoveryService.initialize).toHaveBeenCalledWith(mockAuthStore, mockWalletStore)
      expect(mockMessageGenerator).toHaveBeenCalled()
      expect(mockSignatureHandler).toHaveBeenCalled()
      expect(mockFirebaseAuthenticator).toHaveBeenCalled()
      expect(mockAuthenticationValidator).toHaveBeenCalledWith(mockAuthStore, mockWalletStore)
      expect(orchestrator).toBeInstanceOf(AuthenticationOrchestrator)
    })

    it('should create separate instances for different orchestrator instances', () => {
      const orchestrator2 = new AuthenticationOrchestrator(mockAuthStore, mockWalletStore)
      
      expect(orchestrator).not.toBe(orchestrator2)
      expect(mockMessageGenerator).toHaveBeenCalledTimes(2)
      expect(mockSignatureHandler).toHaveBeenCalledTimes(2)
    })
  })

  describe('Authentication Lock Management', () => {
    describe('Lock Acquisition', () => {
      it('should acquire lock successfully for new authentication', async () => {
        mockAuthStore.isAuthenticating = false
        mockAuthStore.acquireAuthLock.mockReturnValue(true)

        await orchestrator.authenticate(mockAuthContext)

        expect(mockAuthStore.acquireAuthLock).toHaveBeenCalledWith(
          mockAuthContext.walletAddress,
          expect.stringMatching(/auth_\d+_\w+/)
        )
      })

      it('should reject authentication when lock acquisition fails', async () => {
        mockAuthStore.acquireAuthLock.mockReturnValue(false)

        await orchestrator.authenticate(mockAuthContext)

        expect(consoleLogSpy).toHaveBeenCalledWith('❌ Failed to acquire authentication lock')
        expect(mockStepExecutor.executeStep).not.toHaveBeenCalled()
      })

      it('should force release expired locks (>2 minutes)', async () => {
        mockAuthStore.isAuthenticating = true
        mockAuthStore.authLock.startTime = Date.now() - 130000 // 130 seconds ago
        mockAuthStore.acquireAuthLock.mockReturnValue(true)

        await orchestrator.authenticate(mockAuthContext)

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Authentication lock expired')
        )
        expect(mockAuthStore.releaseAuthLock).toHaveBeenCalled()
      })

      it('should handle duplicate authentication attempts for same wallet', async () => {
        mockAuthStore.isAuthenticating = true
        mockAuthStore.authWalletAddress = mockAuthContext.walletAddress
        mockAuthStore.authLock.startTime = Date.now() - 1000 // 1 second ago

        await orchestrator.authenticate(mockAuthContext)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🚫 Duplicate authentication attempt for same wallet, ignoring'
        )
      })

      it('should abort current authentication for different wallet', async () => {
        mockAuthStore.isAuthenticating = true
        mockAuthStore.authWalletAddress = '0xDifferentWallet'
        mockAuthStore.authLock.startTime = Date.now() - 1000
        mockAuthStore.acquireAuthLock.mockReturnValue(true)

        await orchestrator.authenticate(mockAuthContext)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔄 Different wallet detected, aborting current authentication'
        )
        expect(mockAuthStore.releaseAuthLock).toHaveBeenCalled()
      })
    })

    it('should always release lock in finally block', async () => {
      mockStepExecutor.executeStep.mockRejectedValue(new Error('Test error'))

      try {
        await orchestrator.authenticate(mockAuthContext)
      } catch {
        // Expected to throw
      }

      expect(mockAuthStore.releaseAuthLock).toHaveBeenCalled()
    })
  })

  describe('Request Deduplication', () => {
    it('should generate unique request IDs', async () => {
      const firstCallPromise = orchestrator.authenticate(mockAuthContext)
      await new Promise(resolve => setTimeout(resolve, 10)) // Small delay
      const secondCallPromise = orchestrator.authenticate({
        ...mockAuthContext,
        walletAddress: '0xDifferentWallet',
      })

      await Promise.allSettled([firstCallPromise, secondCallPromise])

      // Should have generated different request IDs
      expect(consoleLogSpy).toHaveBeenCalledWith('🆔 Generated request ID:', expect.stringMatching(/auth_\d+_\w+/))
      const requestIdCalls = consoleLogSpy.mock.calls.filter(call => 
        call[0] === '🆔 Generated request ID:'
      )
      expect(requestIdCalls.length).toBeGreaterThanOrEqual(2)
    })

    it('should detect and prevent duplicate requests for same wallet', async () => {
      // First call should proceed
      const firstPromise = orchestrator.authenticate(mockAuthContext)
      
      // Second call should be rejected as duplicate
      const secondPromise = orchestrator.authenticate(mockAuthContext)

      await Promise.allSettled([firstPromise, secondPromise])

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate authentication request detected')
      )
    })

    it('should clean up request tracking after completion', async () => {
      await orchestrator.authenticate(mockAuthContext)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🧹 Authentication request cleanup completed for:',
        mockAuthContext.walletAddress
      )
    })

    it('should clean up request tracking after errors', async () => {
      mockStepExecutor.executeStep.mockRejectedValue(new Error('Test error'))

      try {
        await orchestrator.authenticate(mockAuthContext)
      } catch {
        // Expected to throw
      }

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🧹 Authentication request cleanup completed for:',
        mockAuthContext.walletAddress
      )
    })
  })

  describe('Step Orchestration Flow', () => {
    beforeEach(() => {
      // Setup successful step execution
      mockStepExecutor.executeLockStep.mockResolvedValue(undefined)
      mockStepExecutor.executeStep
        .mockResolvedValueOnce({ message: 'auth message', nonce: 'nonce', timestamp: Date.now() }) // generate-message
        .mockResolvedValueOnce({ signature: 'sig', signatureType: 'personal-sign', walletAddress: mockAuthContext.walletAddress }) // request-signature
        .mockResolvedValueOnce('firebase-token') // verify-signature
        .mockResolvedValueOnce(undefined) // firebase-auth
    })

    it('should execute complete authentication flow successfully', async () => {
      await orchestrator.authenticate(mockAuthContext)

      // Verify all steps were executed in correct order
      expect(mockStepExecutor.executeLockStep).toHaveBeenCalledWith(expect.any(Function))
      expect(mockStepExecutor.executeStep).toHaveBeenNthCalledWith(1, 'generate-message', expect.any(Function))
      expect(mockStepExecutor.executeStep).toHaveBeenNthCalledWith(2, 'request-signature', expect.any(Function))
      expect(mockStepExecutor.executeStep).toHaveBeenNthCalledWith(3, 'verify-signature', expect.any(Function))
      expect(mockStepExecutor.executeStep).toHaveBeenNthCalledWith(4, 'firebase-auth', expect.any(Function))
      
      // Verify success actions
      expect(mockAuthToasts.success).toHaveBeenCalled()
      expect(mockRouter.replace).toHaveBeenCalledWith('/dashboard')
    })

    it('should mark wallet connection step as complete immediately', async () => {
      await orchestrator.authenticate(mockAuthContext)

      expect(mockAuthContext.progressCallbacks?.onStepComplete).toHaveBeenCalledWith('connect-wallet')
    })

    it('should capture and log connection state', async () => {
      await orchestrator.authenticate(mockAuthContext)

      expect(mockValidator.captureConnectionState).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🔐 Locked connection state:',
        expect.objectContaining({
          address: mockAuthContext.walletAddress,
          chainId: mockAuthContext.chainId,
        })
      )
    })

    it('should log session debug information', async () => {
      await orchestrator.authenticate(mockAuthContext)

      expect(mockSessionManager.getSessionDebugInfo).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '📊 Session debug info:',
        expect.objectContaining({
          totalKeys: 5,
          walletConnectKeysCount: 2,
        })
      )
    })

    it('should validate pre-conditions before authentication', async () => {
      await orchestrator.authenticate(mockAuthContext)

      expect(mockValidator.validatePreConditions).toHaveBeenCalledWith({
        walletAddress: mockAuthContext.walletAddress,
      })
    })

    it('should validate state consistency after authentication', async () => {
      await orchestrator.authenticate(mockAuthContext)

      expect(mockValidator.validateStateConsistency).toHaveBeenCalledWith(
        expect.objectContaining({
          address: mockAuthContext.walletAddress,
        }),
        'authentication completion'
      )
    })

    describe('Abort Handling', () => {
      it('should abort after message generation if requested', async () => {
        mockValidator.checkAuthenticationAborted
          .mockReturnValueOnce(false) // Initial check passes
          .mockReturnValueOnce(true)  // Abort after message generation

        await orchestrator.authenticate(mockAuthContext)

        expect(mockStepExecutor.executeStep).toHaveBeenCalledWith('generate-message', expect.any(Function))
        expect(mockStepExecutor.executeStep).not.toHaveBeenCalledWith('request-signature', expect.any(Function))
      })

      it('should abort after signature request if requested', async () => {
        mockValidator.checkAuthenticationAborted
          .mockReturnValueOnce(false) // After message generation
          .mockReturnValueOnce(false) // After signature request
          .mockReturnValueOnce(true)  // Abort after signature verification

        await orchestrator.authenticate(mockAuthContext)

        expect(mockStepExecutor.executeStep).toHaveBeenCalledWith('request-signature', expect.any(Function))
        expect(mockStepExecutor.executeStep).not.toHaveBeenCalledWith('verify-signature', expect.any(Function))
      })

      it('should handle Firebase cleanup when aborted at completion', async () => {
        mockValidator.checkAuthenticationAborted
          .mockReturnValue(false) // All intermediate checks pass
          .mockReturnValueOnce(true) // Final check fails

        await orchestrator.authenticate(mockAuthContext)

        expect(mockAuthErrorRecoveryService.handleFirebaseCleanup).toHaveBeenCalledWith('authentication abort')
      })
    })

    describe('State Consistency Validation', () => {
      it('should handle Firebase cleanup on state consistency failure', async () => {
        mockValidator.validateStateConsistency.mockReturnValue(false)

        await orchestrator.authenticate(mockAuthContext)

        expect(mockAuthErrorRecoveryService.handleFirebaseCleanup).toHaveBeenCalledWith('connection state change')
      })
    })
  })

  describe('Firebase Authentication Checks', () => {
    it('should skip authentication if user is already authenticated', async () => {
      // Mock Firebase user as already authenticated
      const mockFirebaseAuth = require('../../firebase.config').FIREBASE_AUTH
      mockFirebaseAuth.currentUser = { uid: 'existing-user' }

      await orchestrator.authenticate(mockAuthContext)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '✅ User already authenticated with Firebase, skipping re-authentication:',
        'existing-user'
      )
      expect(mockStepExecutor.executeStep).not.toHaveBeenCalled()
    })
  })

  describe('Connector Type Handling', () => {
    it('should handle Wagmi connector properly', async () => {
      const wagmiConnector: Connector = {
        id: 'mock-connector',
        name: 'Mock Connector',
        connect: jest.fn(),
        disconnect: jest.fn(),
      } as any

      const contextWithWagmi = {
        ...mockAuthContext,
        connector: wagmiConnector,
      }

      await orchestrator.authenticate(contextWithWagmi)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Wallet connector:',
        expect.objectContaining({
          connectorId: 'mock-connector',
          connectorName: 'Mock Connector',
        })
      )

      // Verify connector was passed to signature handler
      expect(mockSignatureHandlerInstance.requestWalletSignature).toHaveBeenCalledWith(
        expect.objectContaining({
          connector: wagmiConnector,
        }),
        expect.any(Object)
      )
    })

    it('should handle non-Wagmi connector', async () => {
      const nonWagmiConnector = 'string-connector'
      const contextWithString = {
        ...mockAuthContext,
        connector: nonWagmiConnector,
      }

      await orchestrator.authenticate(contextWithString)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Wallet connector:',
        expect.objectContaining({
          connectorId: 'string-connector',
          connectorName: 'string-connector',
        })
      )

      // Verify undefined was passed to signature handler for non-Wagmi connector
      expect(mockSignatureHandlerInstance.requestWalletSignature).toHaveBeenCalledWith(
        expect.objectContaining({
          connector: undefined,
        }),
        expect.any(Object)
      )
    })
  })

  describe('Error Handling', () => {
    const testError = new Error('Test authentication error')

    beforeEach(() => {
      mockStepExecutor.executeStep.mockRejectedValue(testError)
    })

    it('should handle authentication errors through recovery service', async () => {
      try {
        await orchestrator.authenticate(mockAuthContext)
      } catch {
        // Expected to throw
      }

      expect(mockAuthErrorRecoveryService.handleAuthenticationError).toHaveBeenCalledWith(testError)
      expect(mockAuthErrorRecoveryService.showErrorFeedback).toHaveBeenCalled()
    })

    it('should determine current step from error message and notify callbacks', async () => {
      const signatureError = new Error('signature request failed')
      mockStepExecutor.executeStep.mockRejectedValue(signatureError)

      try {
        await orchestrator.authenticate(mockAuthContext)
      } catch {
        // Expected to throw
      }

      expect(mockAuthContext.progressCallbacks?.onStepFail).toHaveBeenCalledWith(
        'request-signature',
        'signature request failed'
      )
    })

    describe('Error Step Detection', () => {
      const testCases = [
        { errorMessage: 'signature request failed', expectedStep: 'request-signature' },
        { errorMessage: 'signature verification error', expectedStep: 'verify-signature' },
        { errorMessage: 'firebase token invalid', expectedStep: 'firebase-auth' },
        { errorMessage: 'auth message generation failed', expectedStep: 'generate-message' },
        { errorMessage: 'lock acquisition failed', expectedStep: 'acquire-lock' },
        { errorMessage: 'unknown error', expectedStep: 'request-signature' }, // default
      ]

      testCases.forEach(({ errorMessage, expectedStep }) => {
        it(`should detect "${expectedStep}" step from error: "${errorMessage}"`, async () => {
          const specificError = new Error(errorMessage)
          mockStepExecutor.executeStep.mockRejectedValue(specificError)

          try {
            await orchestrator.authenticate(mockAuthContext)
          } catch {
            // Expected to throw
          }

          expect(mockAuthContext.progressCallbacks?.onStepFail).toHaveBeenCalledWith(
            expectedStep,
            errorMessage
          )
        })
      })
    })

    it('should handle session debug info errors gracefully', async () => {
      mockSessionManager.getSessionDebugInfo.mockRejectedValue(new Error('Session error'))

      await orchestrator.authenticate(mockAuthContext)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️ Failed to get session debug info:',
        expect.any(Error)
      )
    })
  })

  describe('Authentication Status and Cleanup', () => {
    it('should return current authentication status', () => {
      mockAuthStore.isAuthenticating = true
      mockAuthStore.authWalletAddress = '0x123'

      const status = orchestrator.getAuthenticationStatus()

      expect(status).toEqual({
        isAuthenticating: true,
        authWalletAddress: '0x123',
      })
    })

    it('should cleanup authentication state', () => {
      orchestrator.cleanup()

      expect(mockAuthStore.reset).toHaveBeenCalled()
    })
  })

  describe('Step Executor Initialization', () => {
    it('should initialize step executor with progress callbacks', async () => {
      await orchestrator.authenticate(mockAuthContext)

      expect(mockAuthenticationStepExecutor).toHaveBeenCalledWith(mockAuthContext.progressCallbacks)
    })

    it('should initialize step executor without progress callbacks', async () => {
      const contextWithoutCallbacks = {
        ...mockAuthContext,
        progressCallbacks: undefined,
      }

      await orchestrator.authenticate(contextWithoutCallbacks)

      expect(mockAuthenticationStepExecutor).toHaveBeenCalledWith(undefined)
    })
  })

  describe('Memory and Resource Management', () => {
    it('should handle multiple concurrent authentication attempts', async () => {
      const contexts = [
        { ...mockAuthContext, walletAddress: '0x123' },
        { ...mockAuthContext, walletAddress: '0x456' },
        { ...mockAuthContext, walletAddress: '0x789' },
      ]

      const results = await Promise.allSettled(
        contexts.map(context => orchestrator.authenticate(context))
      )

      // At least one should succeed, others may be rejected due to duplicate detection
      expect(results).toHaveLength(3)
      expect(mockAuthStore.releaseAuthLock).toHaveBeenCalled()
    })

    it('should clean up resources even on synchronous errors', async () => {
      mockAuthStore.acquireAuthLock.mockImplementation(() => {
        throw new Error('Synchronous error')
      })

      await expect(orchestrator.authenticate(mockAuthContext)).rejects.toThrow()

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🧹 Authentication request cleanup completed for:',
        mockAuthContext.walletAddress
      )
    })
  })

  describe('Integration Scenarios', () => {
    it('should handle complete end-to-end flow with all validations', async () => {
      // Setup realistic step responses
      const authMessage = {
        message: 'Please sign this message to authenticate with SuperPool',
        nonce: 'sp_auth_123',
        timestamp: Date.now(),
      }
      const signatureResult = {
        signature: '0xabc123',
        signatureType: 'personal-sign' as const,
        walletAddress: mockAuthContext.walletAddress,
      }
      const firebaseToken = 'firebase_token_123'

      mockStepExecutor.executeStep
        .mockResolvedValueOnce(authMessage)
        .mockResolvedValueOnce(signatureResult)
        .mockResolvedValueOnce(firebaseToken)
        .mockResolvedValueOnce(undefined)

      await orchestrator.authenticate(mockAuthContext)

      // Verify all step modules were called with correct parameters
      expect(mockMessageGen.generateAuthenticationMessage).toHaveBeenCalledWith(mockAuthContext.walletAddress)
      expect(mockSignatureHandlerInstance.requestWalletSignature).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: mockAuthContext.walletAddress,
          chainId: mockAuthContext.chainId,
          signatureFunctions: mockAuthContext.signatureFunctions,
        }),
        authMessage
      )
      expect(mockFirebaseAuth.verifySignatureAndGetToken).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: mockAuthContext.walletAddress,
          chainId: mockAuthContext.chainId,
        }),
        signatureResult
      )
      expect(mockFirebaseAuth.signInWithFirebase).toHaveBeenCalledWith(firebaseToken, signatureResult.signatureType)
    })

    it('should handle complex error recovery scenarios', async () => {
      const complexError = new Error('Complex authentication error with multiple causes')
      mockStepExecutor.executeStep.mockRejectedValue(complexError)

      const mockAppError = new Error('Processed error') as any
      const mockRecoveryResult = { 
        shouldDisconnect: false, 
        shouldShowError: true, 
        errorDelay: 0, 
        cleanupPerformed: true 
      }
      mockAuthErrorRecoveryService.handleAuthenticationError.mockResolvedValue({
        appError: mockAppError,
        recoveryResult: mockRecoveryResult,
      })

      try {
        await orchestrator.authenticate(mockAuthContext)
      } catch (error) {
        expect(error).toBe(mockAppError)
      }

      expect(mockAuthErrorRecoveryService.showErrorFeedback).toHaveBeenCalledWith(
        mockAppError,
        mockRecoveryResult
      )
    })
  })
})