import { ErrorRecoveryResult, SessionErrorContext } from '@superpool/types'
import { ErrorRecoveryService } from './ErrorRecoveryService'
import { AuthenticationStore } from '../../../stores/AuthenticationStore'
import { WalletStore } from '../../../stores/WalletStore'
import { AppError, ErrorType } from '../../../utils'
import { ErrorAnalyzer } from './ErrorAnalyzer'
import { FeedbackManager } from './FeedbackManager'
import { FirebaseCleanupManager } from './FirebaseCleanupManager'
import { SessionErrorHandler } from './SessionErrorHandler'
import { TimeoutErrorHandler } from './TimeoutErrorHandler'
import { ConnectorErrorHandler } from './ConnectorErrorHandler'
import { GenericErrorHandler } from './GenericErrorHandler'

// Mock all the dependencies
jest.mock('./ErrorAnalyzer')
jest.mock('./FeedbackManager')
jest.mock('./FirebaseCleanupManager')
jest.mock('./SessionErrorHandler')
jest.mock('./TimeoutErrorHandler')
jest.mock('./ConnectorErrorHandler')
jest.mock('./GenericErrorHandler')

describe('ErrorRecoveryService', () => {
  let mockAuthStore: jest.Mocked<AuthenticationStore>
  let mockWalletStore: jest.Mocked<WalletStore>
  let mockAppError: AppError

  beforeEach(() => {
    // Create mock stores
    mockAuthStore = {
      get isAuthenticating() { return false },
    } as jest.Mocked<AuthenticationStore>

    mockWalletStore = {
      isConnected: false,
      disconnect: jest.fn(),
    } as unknown as jest.Mocked<WalletStore>

    mockAppError = {
      name: 'AppError',
      message: 'Test error message',
      type: ErrorType.AUTHENTICATION_FAILED,
      userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
    }

    // Reset all mocks
    jest.clearAllMocks()
    
    // Reset static state
    ;(ErrorRecoveryService as any).authStore = undefined
    ;(ErrorRecoveryService as any).walletStore = undefined
  })

  describe('Initialization', () => {
    it('should initialize with MobX stores', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      expect(consoleSpy).toHaveBeenCalledWith('🔧 ErrorRecoveryService initialized with MobX stores')
      expect((ErrorRecoveryService as any).authStore).toBe(mockAuthStore)
      expect((ErrorRecoveryService as any).walletStore).toBe(mockWalletStore)

      consoleSpy.mockRestore()
    })

    it('should allow re-initialization with different stores', () => {
      const newAuthStore = {} as AuthenticationStore
      const newWalletStore = {} as WalletStore

      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)
      ErrorRecoveryService.initialize(newAuthStore, newWalletStore)

      expect((ErrorRecoveryService as any).authStore).toBe(newAuthStore)
      expect((ErrorRecoveryService as any).walletStore).toBe(newWalletStore)
    })

    it('should handle null store parameters', () => {
      expect(() => {
        ErrorRecoveryService.initialize(null as any, null as any)
      }).not.toThrow()
    })
  })

  describe('getDisconnectFunction', () => {
    it('should return disconnect function when wallet store is initialized', () => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      const disconnectFn = (ErrorRecoveryService as any).getDisconnectFunction()

      expect(disconnectFn).toBeDefined()
      expect(typeof disconnectFn).toBe('function')
    })

    it('should return null when wallet store is not initialized', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

      const disconnectFn = (ErrorRecoveryService as any).getDisconnectFunction()

      expect(disconnectFn).toBeNull()
      expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️ WalletStore not initialized in ErrorRecoveryService')

      consoleWarnSpy.mockRestore()
    })

    it('should execute wallet disconnect when returned function is called', () => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const disconnectFn = (ErrorRecoveryService as any).getDisconnectFunction()
      disconnectFn()

      expect(consoleSpy).toHaveBeenCalledWith('🔌 Disconnecting wallet via MobX store...')
      expect(mockWalletStore.disconnect).toHaveBeenCalledTimes(1)

      consoleSpy.mockRestore()
    })

    it('should handle wallet store being cleared after function creation', () => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)
      const disconnectFn = (ErrorRecoveryService as any).getDisconnectFunction()
      
      // Clear wallet store
      ;(ErrorRecoveryService as any).walletStore = null
      
      // Should not throw when calling the function
      expect(() => disconnectFn()).not.toThrow()
    })
  })

  describe('handleAuthenticationError', () => {
    beforeEach(() => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)
    })

    describe('Session Error Handling', () => {
      beforeEach(() => {
        const mockSessionContext: SessionErrorContext = {
          errorMessage: 'WalletConnect session error',
          sessionId: 'test-session-id',
          isSessionError: true,
        }

        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'session',
          appError: mockAppError,
          originalError: new Error('Original error'),
          sessionContext: mockSessionContext,
        })

        const mockRecoveryResult: ErrorRecoveryResult = {
          shouldDisconnect: true,
          shouldShowError: false,
          errorDelay: 1500,
          cleanupPerformed: true,
        }

        ;(SessionErrorHandler as jest.Mock).mockImplementation(() => ({
          handle: jest.fn().mockResolvedValue(mockRecoveryResult),
          getHandlerName: jest.fn().mockReturnValue('session-error'),
        }))
      })

      it('should handle session errors with SessionErrorHandler', async () => {
        const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Session error'))

        expect(ErrorAnalyzer.analyzeError).toHaveBeenCalled()
        expect(SessionErrorHandler).toHaveBeenCalledWith(expect.any(Function))
        expect(FeedbackManager.logRecoveryResult).toHaveBeenCalledWith('session-error', expect.any(Object))
        expect(result.appError).toEqual(mockAppError)
        expect(result.recoveryResult.cleanupPerformed).toBe(true)
      })

      it('should throw error when session context is missing for session error', async () => {
        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'session',
          appError: mockAppError,
          originalError: new Error('Original error'),
          sessionContext: undefined,
        })

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Session error'))

        expect(result.recoveryResult.shouldDisconnect).toBe(false)
        expect(result.recoveryResult.shouldShowError).toBe(true)
        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error handler failed:', expect.any(Error))

        consoleErrorSpy.mockRestore()
      })
    })

    describe('Timeout Error Handling', () => {
      beforeEach(() => {
        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'timeout',
          appError: mockAppError,
          originalError: new Error('Timeout error'),
        })

        const mockRecoveryResult: ErrorRecoveryResult = {
          shouldDisconnect: true,
          shouldShowError: true,
          errorDelay: 2000,
          cleanupPerformed: false,
        }

        ;(TimeoutErrorHandler as jest.Mock).mockImplementation(() => ({
          handle: jest.fn().mockReturnValue(mockRecoveryResult),
          getHandlerName: jest.fn().mockReturnValue('timeout-error'),
        }))
      })

      it('should handle timeout errors with TimeoutErrorHandler', async () => {
        const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Timeout error'))

        expect(ErrorAnalyzer.analyzeError).toHaveBeenCalled()
        expect(TimeoutErrorHandler).toHaveBeenCalledWith(expect.any(Function))
        expect(FeedbackManager.logRecoveryResult).toHaveBeenCalledWith('timeout-error', expect.any(Object))
        expect(result.appError).toEqual(mockAppError)
        expect(result.recoveryResult.errorDelay).toBe(2000)
      })
    })

    describe('Connector Error Handling', () => {
      beforeEach(() => {
        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'connector',
          appError: mockAppError,
          originalError: new Error('Connector error'),
        })

        const mockRecoveryResult: ErrorRecoveryResult = {
          shouldDisconnect: false,
          shouldShowError: true,
          errorDelay: 1500,
          cleanupPerformed: false,
        }

        ;(ConnectorErrorHandler as jest.Mock).mockImplementation(() => ({
          handle: jest.fn().mockReturnValue(mockRecoveryResult),
          getHandlerName: jest.fn().mockReturnValue('connector-error'),
        }))
      })

      it('should handle connector errors with ConnectorErrorHandler', async () => {
        const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Connector error'))

        expect(ErrorAnalyzer.analyzeError).toHaveBeenCalled()
        expect(ConnectorErrorHandler).toHaveBeenCalled()
        expect(FeedbackManager.logRecoveryResult).toHaveBeenCalledWith('connector-error', expect.any(Object))
        expect(result.appError).toEqual(mockAppError)
        expect(result.recoveryResult.shouldDisconnect).toBe(false)
      })
    })

    describe('Generic Error Handling', () => {
      beforeEach(() => {
        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'generic',
          appError: mockAppError,
          originalError: new Error('Generic error'),
        })

        const mockRecoveryResult: ErrorRecoveryResult = {
          shouldDisconnect: true,
          shouldShowError: true,
          errorDelay: 1500,
          cleanupPerformed: false,
        }

        ;(GenericErrorHandler as jest.Mock).mockImplementation(() => ({
          handle: jest.fn().mockReturnValue(mockRecoveryResult),
          getHandlerName: jest.fn().mockReturnValue('generic-error'),
        }))
      })

      it('should handle generic errors with GenericErrorHandler', async () => {
        mockWalletStore.isConnected = true

        const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Generic error'))

        expect(ErrorAnalyzer.analyzeError).toHaveBeenCalled()
        expect(GenericErrorHandler).toHaveBeenCalledWith(expect.any(Function))
        expect(FeedbackManager.logRecoveryResult).toHaveBeenCalledWith('generic-error', expect.any(Object))
        expect(result.appError).toEqual(mockAppError)
      })

      it('should handle default case with GenericErrorHandler', async () => {
        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'unknown',
          appError: mockAppError,
          originalError: new Error('Unknown error'),
        })

        await ErrorRecoveryService.handleAuthenticationError(new Error('Unknown error'))

        expect(GenericErrorHandler).toHaveBeenCalledWith(expect.any(Function))
      })

      it('should pass correct context to GenericErrorHandler', async () => {
        mockWalletStore.isConnected = true
        const originalError = new Error('Test error')
        
        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'generic',
          appError: mockAppError,
          originalError,
        })

        await ErrorRecoveryService.handleAuthenticationError(originalError)

        const genericHandlerMock = (GenericErrorHandler as jest.Mock).mock.instances[0]
        expect(genericHandlerMock.handle).toHaveBeenCalledWith({
          appError: mockAppError,
          isConnected: true,
          originalError,
        })
      })

      it('should handle wallet store not being connected', async () => {
        mockWalletStore.isConnected = false

        await ErrorRecoveryService.handleAuthenticationError(new Error('Generic error'))

        const genericHandlerMock = (GenericErrorHandler as jest.Mock).mock.instances[0]
        expect(genericHandlerMock.handle).toHaveBeenCalledWith(
          expect.objectContaining({ isConnected: false })
        )
      })

      it('should handle missing wallet store gracefully', async () => {
        ;(ErrorRecoveryService as any).walletStore = undefined

        await ErrorRecoveryService.handleAuthenticationError(new Error('Generic error'))

        const genericHandlerMock = (GenericErrorHandler as jest.Mock).mock.instances[0]
        expect(genericHandlerMock.handle).toHaveBeenCalledWith(
          expect.objectContaining({ isConnected: false })
        )
      })
    })

    describe('Error Handler Failures', () => {
      it('should handle handler failure with fallback response', async () => {
        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'timeout',
          appError: mockAppError,
          originalError: new Error('Timeout error'),
        })

        ;(TimeoutErrorHandler as jest.Mock).mockImplementation(() => ({
          handle: jest.fn().mockImplementation(() => {
            throw new Error('Handler failed')
          }),
          getHandlerName: jest.fn().mockReturnValue('timeout-error'),
        }))

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Timeout error'))

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error handler failed:', expect.any(Error))
        expect(result.recoveryResult).toEqual({
          shouldDisconnect: false,
          shouldShowError: true,
          errorDelay: 1500,
          cleanupPerformed: false,
        })

        consoleErrorSpy.mockRestore()
      })

      it('should handle async handler failure', async () => {
        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'session',
          appError: mockAppError,
          originalError: new Error('Session error'),
          sessionContext: { sessionId: 'test', errorMessage: 'test', isSessionError: true },
        })

        ;(SessionErrorHandler as jest.Mock).mockImplementation(() => ({
          handle: jest.fn().mockRejectedValue(new Error('Async handler failed')),
          getHandlerName: jest.fn().mockReturnValue('session-error'),
        }))

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

        const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Session error'))

        expect(result.recoveryResult.shouldDisconnect).toBe(false)
        expect(result.recoveryResult.shouldShowError).toBe(true)
        expect(consoleErrorSpy).toHaveBeenCalled()

        consoleErrorSpy.mockRestore()
      })
    })

    describe('Logging and Console Output', () => {
      it('should log authentication error and classification', async () => {
        ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
          errorType: 'generic',
          appError: mockAppError,
          originalError: new Error('Test error'),
        })

        ;(GenericErrorHandler as jest.Mock).mockImplementation(() => ({
          handle: jest.fn().mockReturnValue({ shouldDisconnect: false, shouldShowError: true, errorDelay: 0, cleanupPerformed: false }),
          getHandlerName: jest.fn().mockReturnValue('generic-error'),
        }))

        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

        const testError = new Error('Test error')
        await ErrorRecoveryService.handleAuthenticationError(testError)

        expect(consoleErrorSpy).toHaveBeenCalledWith('🚨 Authentication failed:', testError)
        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Error classified as: generic')

        consoleErrorSpy.mockRestore()
        consoleLogSpy.mockRestore()
      })
    })
  })

  describe('showErrorFeedback', () => {
    it('should delegate to FeedbackManager', () => {
      const mockRecoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1500,
        cleanupPerformed: false,
      }

      ErrorRecoveryService.showErrorFeedback(mockAppError, mockRecoveryResult)

      expect(FeedbackManager.showErrorFeedback).toHaveBeenCalledWith(mockAppError, mockRecoveryResult)
    })

    it('should work without initialization', () => {
      const mockRecoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1500,
        cleanupPerformed: false,
      }

      expect(() => {
        ErrorRecoveryService.showErrorFeedback(mockAppError, mockRecoveryResult)
      }).not.toThrow()

      expect(FeedbackManager.showErrorFeedback).toHaveBeenCalled()
    })
  })

  describe('handleFirebaseCleanup', () => {
    it('should delegate to FirebaseCleanupManager', async () => {
      ;(FirebaseCleanupManager.handleFirebaseCleanup as jest.Mock).mockResolvedValue(undefined)

      await ErrorRecoveryService.handleFirebaseCleanup('test reason')

      expect(FirebaseCleanupManager.handleFirebaseCleanup).toHaveBeenCalledWith('test reason')
    })

    it('should handle Firebase cleanup failure', async () => {
      const cleanupError = new Error('Firebase cleanup failed')
      ;(FirebaseCleanupManager.handleFirebaseCleanup as jest.Mock).mockRejectedValue(cleanupError)

      await expect(
        ErrorRecoveryService.handleFirebaseCleanup('test reason')
      ).rejects.toThrow('Firebase cleanup failed')
    })

    it('should work without initialization', async () => {
      ;(FirebaseCleanupManager.handleFirebaseCleanup as jest.Mock).mockResolvedValue(undefined)

      await expect(
        ErrorRecoveryService.handleFirebaseCleanup('test reason')
      ).resolves.not.toThrow()
    })
  })

  describe('getServiceStatus', () => {
    it('should return status when not initialized', () => {
      ;(FirebaseCleanupManager.getCurrentUserId as jest.Mock).mockReturnValue('firebase-user-123')

      const status = ErrorRecoveryService.getServiceStatus()

      expect(status).toEqual({
        initialized: false,
        isAuthenticating: false,
        isConnected: false,
        firebaseUser: 'firebase-user-123',
      })
    })

    it('should return status when initialized', () => {
      // Create new mock stores with desired state
      const authStoreWithAuth = {
        get isAuthenticating() { return true },
      } as jest.Mocked<AuthenticationStore>
      
      const walletStoreWithConnection = {
        isConnected: true,
        disconnect: jest.fn(),
      } as unknown as jest.Mocked<WalletStore>
      
      ;(FirebaseCleanupManager.getCurrentUserId as jest.Mock).mockReturnValue('firebase-user-456')

      ErrorRecoveryService.initialize(authStoreWithAuth, walletStoreWithConnection)

      const status = ErrorRecoveryService.getServiceStatus()

      expect(status).toEqual({
        initialized: true,
        isAuthenticating: true,
        isConnected: true,
        firebaseUser: 'firebase-user-456',
      })
    })

    it('should handle null stores', () => {
      ErrorRecoveryService.initialize(null as any, null as any)

      const status = ErrorRecoveryService.getServiceStatus()

      expect(status.initialized).toBe(false)
      expect(status.isAuthenticating).toBe(false)
      expect(status.isConnected).toBe(false)
    })

    it('should handle missing Firebase user', () => {
      ;(FirebaseCleanupManager.getCurrentUserId as jest.Mock).mockReturnValue(null)

      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      const status = ErrorRecoveryService.getServiceStatus()

      expect(status.firebaseUser).toBeNull()
    })

    it('should reflect real-time store states', () => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      // Initial state
      const status1 = ErrorRecoveryService.getServiceStatus()
      expect(status1.isAuthenticating).toBe(false)
      expect(status1.isConnected).toBe(false)

      // Create new mock stores with changed states
      const authStoreChanged = {
        get isAuthenticating() { return true },
      } as jest.Mocked<AuthenticationStore>
      
      const walletStoreChanged = {
        isConnected: true,
        disconnect: jest.fn(),
      } as unknown as jest.Mocked<WalletStore>
      
      // Re-initialize with changed stores
      ErrorRecoveryService.initialize(authStoreChanged, walletStoreChanged)

      // Should reflect changes
      const status2 = ErrorRecoveryService.getServiceStatus()
      expect(status2.isAuthenticating).toBe(true)
      expect(status2.isConnected).toBe(true)
    })
  })

  describe('Integration Scenarios', () => {
    beforeEach(() => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)
    })

    it('should handle complete error recovery flow', async () => {
      ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
        errorType: 'generic',
        appError: mockAppError,
        originalError: new Error('Integration test error'),
      })

      const mockRecoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: true,
        shouldShowError: true,
        errorDelay: 2000,
        cleanupPerformed: false,
      }

      ;(GenericErrorHandler as jest.Mock).mockImplementation(() => ({
        handle: jest.fn().mockReturnValue(mockRecoveryResult),
        getHandlerName: jest.fn().mockReturnValue('generic-error'),
      }))

      mockWalletStore.isConnected = true

      const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Integration test'))

      expect(result.appError).toEqual(mockAppError)
      expect(result.recoveryResult).toEqual(mockRecoveryResult)
      expect(FeedbackManager.logRecoveryResult).toHaveBeenCalledWith('generic-error', mockRecoveryResult)
    })

    it('should handle multiple simultaneous error recoveries', async () => {
      ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
        errorType: 'generic',
        appError: mockAppError,
        originalError: new Error('Concurrent error'),
      })

      ;(GenericErrorHandler as jest.Mock).mockImplementation(() => ({
        handle: jest.fn().mockReturnValue({
          shouldDisconnect: false,
          shouldShowError: true,
          errorDelay: 1500,
          cleanupPerformed: false,
        }),
        getHandlerName: jest.fn().mockReturnValue('generic-error'),
      }))

      const errors = Array.from({ length: 5 }, (_, i) => new Error(`Concurrent error ${i}`))
      const promises = errors.map(error => ErrorRecoveryService.handleAuthenticationError(error))

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      expect(ErrorAnalyzer.analyzeError).toHaveBeenCalledTimes(5)
      expect(GenericErrorHandler).toHaveBeenCalledTimes(5)
    })

    it('should maintain service integrity during rapid state changes', () => {
      // Rapid re-initialization
      const store1 = {} as AuthenticationStore
      const store2 = {} as WalletStore

      ErrorRecoveryService.initialize(store1, store2)
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      const status = ErrorRecoveryService.getServiceStatus()
      expect(status.initialized).toBe(true)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle null error input', async () => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
        errorType: 'generic',
        appError: mockAppError,
        originalError: null,
      })

      ;(GenericErrorHandler as jest.Mock).mockImplementation(() => ({
        handle: jest.fn().mockReturnValue({
          shouldDisconnect: false,
          shouldShowError: true,
          errorDelay: 0,
          cleanupPerformed: false,
        }),
        getHandlerName: jest.fn().mockReturnValue('generic-error'),
      }))

      const result = await ErrorRecoveryService.handleAuthenticationError(null)

      expect(result).toBeDefined()
      expect(result.appError).toEqual(mockAppError)
    })

    it('should handle undefined error input', async () => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
        errorType: 'generic',
        appError: mockAppError,
        originalError: undefined,
      })

      ;(GenericErrorHandler as jest.Mock).mockImplementation(() => ({
        handle: jest.fn().mockReturnValue({
          shouldDisconnect: false,
          shouldShowError: true,
          errorDelay: 0,
          cleanupPerformed: false,
        }),
        getHandlerName: jest.fn().mockReturnValue('generic-error'),
      }))

      await expect(
        ErrorRecoveryService.handleAuthenticationError(undefined)
      ).resolves.toBeDefined()
    })

    it('should handle ErrorAnalyzer throwing error', async () => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      ;(ErrorAnalyzer.analyzeError as jest.Mock).mockImplementation(() => {
        throw new Error('Analyzer failed')
      })

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Test'))

      expect(result.recoveryResult).toEqual({
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1500,
        cleanupPerformed: false,
      })

      consoleErrorSpy.mockRestore()
    })

    it('should handle service calls without initialization gracefully', async () => {
      // Don't initialize service

      ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
        errorType: 'generic',
        appError: mockAppError,
        originalError: new Error('Test'),
      })

      ;(GenericErrorHandler as jest.Mock).mockImplementation(() => ({
        handle: jest.fn().mockReturnValue({
          shouldDisconnect: false,
          shouldShowError: true,
          errorDelay: 0,
          cleanupPerformed: false,
        }),
        getHandlerName: jest.fn().mockReturnValue('generic-error'),
      }))

      const result = await ErrorRecoveryService.handleAuthenticationError(new Error('Test'))

      expect(result).toBeDefined()
      // Should use null for disconnect function and false for isConnected
    })
  })

  describe('Performance', () => {
    beforeEach(() => {
      ErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      ;(ErrorAnalyzer.analyzeError as jest.Mock).mockReturnValue({
        errorType: 'generic',
        appError: mockAppError,
        originalError: new Error('Performance test'),
      })

      ;(GenericErrorHandler as jest.Mock).mockImplementation(() => ({
        handle: jest.fn().mockReturnValue({
          shouldDisconnect: false,
          shouldShowError: true,
          errorDelay: 0,
          cleanupPerformed: false,
        }),
        getHandlerName: jest.fn().mockReturnValue('generic-error'),
      }))
    })

    it('should handle errors quickly', async () => {
      const start = performance.now()
      
      await ErrorRecoveryService.handleAuthenticationError(new Error('Performance test'))
      
      const end = performance.now()
      expect(end - start).toBeLessThan(50)
    })

    it('should handle multiple errors efficiently', async () => {
      const errors = Array.from({ length: 100 }, (_, i) => new Error(`Error ${i}`))

      const start = performance.now()
      
      await Promise.all(errors.map(error => 
        ErrorRecoveryService.handleAuthenticationError(error)
      ))
      
      const end = performance.now()
      expect(end - start).toBeLessThan(500)
    })

    it('should not leak memory with repeated calls', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      for (let i = 0; i < 100; i++) {
        await ErrorRecoveryService.handleAuthenticationError(new Error(`Memory test ${i}`))
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Memory increase should be minimal (less than 1MB for 100 calls)
      expect(memoryIncrease).toBeLessThan(1024 * 1024)
    })
  })
})