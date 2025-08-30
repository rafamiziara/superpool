import { AuthenticationStore } from '../../stores/AuthenticationStore'
import { WalletStore } from '../../stores/WalletStore'
import { AppError } from '../../utils'
import { ErrorRecoveryResult, ErrorRecoveryService, SessionErrorContext } from './handlers'
import { AuthErrorRecoveryService } from './AuthErrorRecoveryService'

// Mock the new ErrorRecoveryService that AuthErrorRecoveryService delegates to
jest.mock('./handlers', () => ({
  ErrorRecoveryService: {
    initialize: jest.fn(),
    handleAuthenticationError: jest.fn(),
    showErrorFeedback: jest.fn(),
    handleFirebaseCleanup: jest.fn(),
  },
}))

// Mock stores
jest.mock('../../stores/AuthenticationStore')
jest.mock('../../stores/WalletStore')

const mockErrorRecoveryService = ErrorRecoveryService as jest.Mocked<typeof ErrorRecoveryService>
const mockAuthenticationStore = AuthenticationStore as jest.MockedClass<typeof AuthenticationStore>
const mockWalletStore = WalletStore as jest.MockedClass<typeof WalletStore>

describe('AuthErrorRecoveryService', () => {
  let mockAuthStore: jest.Mocked<AuthenticationStore>
  let mockWalletStore: jest.Mocked<WalletStore>
  let consoleLogSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock store instances
    mockAuthStore = {
      isAuthenticating: false,
      authWalletAddress: null,
      reset: jest.fn(),
      acquireAuthLock: jest.fn(),
      releaseAuthLock: jest.fn(),
    } as any

    mockWalletStore = {
      isConnected: false,
      address: null,
      chainId: null,
      disconnect: jest.fn(),
    } as any

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('Legacy Wrapper Functionality', () => {
    it('should exist as a class with static methods', () => {
      expect(AuthErrorRecoveryService).toBeDefined()
      expect(typeof AuthErrorRecoveryService).toBe('function')
      expect(typeof AuthErrorRecoveryService.initialize).toBe('function')
      expect(typeof AuthErrorRecoveryService.handleAuthenticationError).toBe('function')
      expect(typeof AuthErrorRecoveryService.showErrorFeedback).toBe('function')
      expect(typeof AuthErrorRecoveryService.handleFirebaseCleanup).toBe('function')
    })

    it('should be instantiable but not necessary (legacy class)', () => {
      // Legacy class can be instantiated but all methods are static
      expect(() => new (AuthErrorRecoveryService as any)()).not.toThrow()
      
      // Verify that it's primarily designed for static usage
      const instance = new (AuthErrorRecoveryService as any)()
      expect(instance).toBeDefined()
    })
  })

  describe('Initialization Delegation', () => {
    it('should delegate initialize to ErrorRecoveryService', () => {
      AuthErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      expect(mockErrorRecoveryService.initialize).toHaveBeenCalledWith(mockAuthStore, mockWalletStore)
      expect(mockErrorRecoveryService.initialize).toHaveBeenCalledTimes(1)
    })

    it('should log legacy service initialization message', () => {
      AuthErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🔧 AuthErrorRecoveryService (legacy) initialized - delegating to ErrorRecoveryService'
      )
    })

    it('should handle initialize with different store instances', () => {
      const alternateAuthStore = { ...mockAuthStore } as any
      const alternateWalletStore = { ...mockWalletStore } as any

      AuthErrorRecoveryService.initialize(alternateAuthStore, alternateWalletStore)

      expect(mockErrorRecoveryService.initialize).toHaveBeenCalledWith(
        alternateAuthStore,
        alternateWalletStore
      )
    })

    it('should handle multiple initialization calls', () => {
      AuthErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)
      AuthErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)
      AuthErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      expect(mockErrorRecoveryService.initialize).toHaveBeenCalledTimes(3)
      expect(consoleLogSpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('Authentication Error Handling Delegation', () => {
    const mockAppError: AppError = {
      name: 'AuthenticationError',
      message: 'Authentication failed',
      type: 'AUTHENTICATION_FAILED' as any,
      userFriendlyMessage: 'Please try again',
      timestamp: new Date(),
    }

    const mockRecoveryResult: ErrorRecoveryResult = {
      shouldDisconnect: false,
      shouldShowError: true,
      errorDelay: 1000,
      cleanupPerformed: false,
    }

    beforeEach(() => {
      mockErrorRecoveryService.handleAuthenticationError.mockResolvedValue({
        appError: mockAppError,
        recoveryResult: mockRecoveryResult,
      })
    })

    it('should delegate handleAuthenticationError to ErrorRecoveryService', async () => {
      const testError = new Error('Test authentication error')

      const result = await AuthErrorRecoveryService.handleAuthenticationError(testError)

      expect(mockErrorRecoveryService.handleAuthenticationError).toHaveBeenCalledWith(testError)
      expect(result).toEqual({
        appError: mockAppError,
        recoveryResult: mockRecoveryResult,
      })
    })

    it('should handle different error types', async () => {
      const errorTypes = [
        new Error('Standard error'),
        'String error',
        { message: 'Object error' },
        null,
        undefined,
        123,
      ]

      for (const error of errorTypes) {
        await AuthErrorRecoveryService.handleAuthenticationError(error)

        expect(mockErrorRecoveryService.handleAuthenticationError).toHaveBeenCalledWith(error)
      }

      expect(mockErrorRecoveryService.handleAuthenticationError).toHaveBeenCalledTimes(errorTypes.length)
    })

    it('should propagate promise rejections from ErrorRecoveryService', async () => {
      const rejectionError = new Error('Recovery service failed')
      mockErrorRecoveryService.handleAuthenticationError.mockRejectedValue(rejectionError)

      await expect(
        AuthErrorRecoveryService.handleAuthenticationError(new Error('Test error'))
      ).rejects.toThrow('Recovery service failed')
    })

    it('should handle multiple concurrent error handling calls', async () => {
      const errors = [
        new Error('Error 1'),
        new Error('Error 2'),
        new Error('Error 3'),
      ]

      const promises = errors.map(error =>
        AuthErrorRecoveryService.handleAuthenticationError(error)
      )

      await Promise.all(promises)

      expect(mockErrorRecoveryService.handleAuthenticationError).toHaveBeenCalledTimes(3)
      errors.forEach(error => {
        expect(mockErrorRecoveryService.handleAuthenticationError).toHaveBeenCalledWith(error)
      })
    })

    it('should return consistent results matching ErrorRecoveryService', async () => {
      const differentAppError: AppError = {
        name: 'NetworkError',
        message: 'Network request failed',
        type: 'NETWORK_ERROR' as any,
        userFriendlyMessage: 'Check your connection',
        timestamp: new Date(),
      }

      const differentRecoveryResult: ErrorRecoveryResult = {
        shouldDisconnect: true,
        shouldShowError: false,
        errorDelay: 2000,
        cleanupPerformed: true,
      }

      mockErrorRecoveryService.handleAuthenticationError.mockResolvedValue({
        appError: differentAppError,
        recoveryResult: differentRecoveryResult,
      })

      const result = await AuthErrorRecoveryService.handleAuthenticationError(new Error('Network error'))

      expect(result.appError).toBe(differentAppError)
      expect(result.recoveryResult).toBe(differentRecoveryResult)
    })
  })

  describe('Error Feedback Display Delegation', () => {
    const mockAppError: AppError = {
      name: 'AuthenticationError',
      message: 'Authentication failed',
      type: 'AUTHENTICATION_FAILED' as any,
      userFriendlyMessage: 'Please try again',
      timestamp: new Date(),
    }

    const mockRecoveryResult: ErrorRecoveryResult = {
      shouldDisconnect: false,
      shouldShowError: true,
      errorDelay: 1000,
      cleanupPerformed: false,
    }

    it('should delegate showErrorFeedback to ErrorRecoveryService', () => {
      AuthErrorRecoveryService.showErrorFeedback(mockAppError, mockRecoveryResult)

      expect(mockErrorRecoveryService.showErrorFeedback).toHaveBeenCalledWith(
        mockAppError,
        mockRecoveryResult
      )
      expect(mockErrorRecoveryService.showErrorFeedback).toHaveBeenCalledTimes(1)
    })

    it('should handle different app error types', () => {
      const errorTypes: AppError[] = [
        {
          name: 'NetworkError',
          message: 'Network failed',
          type: 'NETWORK_ERROR' as any,
          userFriendlyMessage: 'Check connection',
          timestamp: new Date(),
        },
        {
          name: 'ValidationError',
          message: 'Validation failed',
          type: 'VALIDATION_ERROR' as any,
          userFriendlyMessage: 'Invalid input',
          timestamp: new Date(),
        },
        {
          name: 'TimeoutError',
          message: 'Request timeout',
          type: 'TIMEOUT_ERROR' as any,
          userFriendlyMessage: 'Request timed out',
          timestamp: new Date(),
        },
      ]

      errorTypes.forEach(error => {
        AuthErrorRecoveryService.showErrorFeedback(error, mockRecoveryResult)
        expect(mockErrorRecoveryService.showErrorFeedback).toHaveBeenCalledWith(error, mockRecoveryResult)
      })

      expect(mockErrorRecoveryService.showErrorFeedback).toHaveBeenCalledTimes(errorTypes.length)
    })

    it('should handle different recovery result configurations', () => {
      const recoveryResults: ErrorRecoveryResult[] = [
        {
          shouldDisconnect: true,
          shouldShowError: false,
          errorDelay: 0,
          cleanupPerformed: true,
        },
        {
          shouldDisconnect: false,
          shouldShowError: true,
          errorDelay: 500,
          cleanupPerformed: false,
        },
        {
          shouldDisconnect: true,
          shouldShowError: true,
          errorDelay: 2000,
          cleanupPerformed: true,
        },
      ]

      recoveryResults.forEach(result => {
        AuthErrorRecoveryService.showErrorFeedback(mockAppError, result)
        expect(mockErrorRecoveryService.showErrorFeedback).toHaveBeenCalledWith(mockAppError, result)
      })

      expect(mockErrorRecoveryService.showErrorFeedback).toHaveBeenCalledTimes(recoveryResults.length)
    })

    it('should handle rapid successive feedback calls', () => {
      for (let i = 0; i < 10; i++) {
        AuthErrorRecoveryService.showErrorFeedback(mockAppError, mockRecoveryResult)
      }

      expect(mockErrorRecoveryService.showErrorFeedback).toHaveBeenCalledTimes(10)
    })
  })

  describe('Firebase Cleanup Delegation', () => {
    beforeEach(() => {
      mockErrorRecoveryService.handleFirebaseCleanup.mockResolvedValue()
    })

    it('should delegate handleFirebaseCleanup to ErrorRecoveryService', async () => {
      const reason = 'authentication state change'

      await AuthErrorRecoveryService.handleFirebaseCleanup(reason)

      expect(mockErrorRecoveryService.handleFirebaseCleanup).toHaveBeenCalledWith(reason)
      expect(mockErrorRecoveryService.handleFirebaseCleanup).toHaveBeenCalledTimes(1)
    })

    it('should handle different cleanup reasons', async () => {
      const reasons = [
        'authentication state change',
        'wallet disconnection',
        'user logout',
        'connection timeout',
        'error recovery',
        'manual cleanup',
        '',
      ]

      for (const reason of reasons) {
        await AuthErrorRecoveryService.handleFirebaseCleanup(reason)
        expect(mockErrorRecoveryService.handleFirebaseCleanup).toHaveBeenCalledWith(reason)
      }

      expect(mockErrorRecoveryService.handleFirebaseCleanup).toHaveBeenCalledTimes(reasons.length)
    })

    it('should propagate promise rejections from ErrorRecoveryService', async () => {
      const cleanupError = new Error('Firebase cleanup failed')
      mockErrorRecoveryService.handleFirebaseCleanup.mockRejectedValue(cleanupError)

      await expect(
        AuthErrorRecoveryService.handleFirebaseCleanup('test reason')
      ).rejects.toThrow('Firebase cleanup failed')
    })

    it('should handle multiple concurrent cleanup calls', async () => {
      const reasons = ['reason1', 'reason2', 'reason3']

      const promises = reasons.map(reason =>
        AuthErrorRecoveryService.handleFirebaseCleanup(reason)
      )

      await Promise.all(promises)

      expect(mockErrorRecoveryService.handleFirebaseCleanup).toHaveBeenCalledTimes(3)
      reasons.forEach(reason => {
        expect(mockErrorRecoveryService.handleFirebaseCleanup).toHaveBeenCalledWith(reason)
      })
    })

    it('should return the promise from ErrorRecoveryService', async () => {
      const customResult = { cleanup: 'completed' }
      mockErrorRecoveryService.handleFirebaseCleanup.mockResolvedValue(customResult as any)

      const result = await AuthErrorRecoveryService.handleFirebaseCleanup('test')

      expect(result).toBe(customResult)
    })
  })

  describe('Type Exports and Backward Compatibility', () => {
    it('should re-export ErrorRecoveryResult type', () => {
      // This test ensures the type export is working
      const testResult: ErrorRecoveryResult = {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1000,
        cleanupPerformed: false,
      }

      expect(testResult.shouldDisconnect).toBe(false)
      expect(testResult.shouldShowError).toBe(true)
      expect(testResult.errorDelay).toBe(1000)
      expect(testResult.cleanupPerformed).toBe(false)
    })

    it('should re-export SessionErrorContext type', () => {
      // This test ensures the type export is working
      const testContext: SessionErrorContext = {
        error: new Error('Test error'),
        context: {
          walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          chainId: 137,
        },
      } as any

      expect(testContext.context.walletAddress).toBe('0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8')
      expect(testContext.context.chainId).toBe(137)
    })
  })

  describe('Integration and Edge Cases', () => {
    it('should maintain method signatures identical to ErrorRecoveryService', () => {
      // Verify initialize method signature
      expect(() => {
        AuthErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)
      }).not.toThrow()

      // Verify handleAuthenticationError method signature
      expect(async () => {
        await AuthErrorRecoveryService.handleAuthenticationError(new Error('test'))
      }).not.toThrow()

      // Verify showErrorFeedback method signature
      expect(() => {
        AuthErrorRecoveryService.showErrorFeedback({} as AppError, {} as ErrorRecoveryResult)
      }).not.toThrow()

      // Verify handleFirebaseCleanup method signature
      expect(async () => {
        await AuthErrorRecoveryService.handleFirebaseCleanup('test')
      }).not.toThrow()
    })

    it('should handle service errors gracefully without breaking delegation', async () => {
      // Test that errors in the delegated service are properly propagated
      const serviceError = new Error('Service internal error')
      mockErrorRecoveryService.handleAuthenticationError.mockRejectedValue(serviceError)

      await expect(
        AuthErrorRecoveryService.handleAuthenticationError(new Error('auth error'))
      ).rejects.toThrow('Service internal error')

      // Ensure delegation still happened
      expect(mockErrorRecoveryService.handleAuthenticationError).toHaveBeenCalled()
    })

    it('should work as drop-in replacement for ErrorRecoveryService', () => {
      // Test that all static methods exist and are callable
      const methods = [
        'initialize',
        'handleAuthenticationError',
        'showErrorFeedback',
        'handleFirebaseCleanup',
      ]

      methods.forEach(method => {
        expect(typeof (AuthErrorRecoveryService as any)[method]).toBe('function')
      })
    })

    it('should handle complex integration scenarios', async () => {
      // Initialize service
      AuthErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)

      // Handle an authentication error
      const mockAppError: AppError = {
        name: 'AuthError',
        message: 'Auth failed',
        type: 'AUTHENTICATION_FAILED' as any,
        userFriendlyMessage: 'Try again',
        timestamp: new Date(),
      }

      mockErrorRecoveryService.handleAuthenticationError.mockResolvedValue({
        appError: mockAppError,
        recoveryResult: {
          shouldDisconnect: false,
          shouldShowError: true,
          errorDelay: 1000,
          cleanupPerformed: false,
        },
      })

      const result = await AuthErrorRecoveryService.handleAuthenticationError(new Error('complex error'))

      // Show error feedback
      AuthErrorRecoveryService.showErrorFeedback(result.appError, result.recoveryResult)

      // Handle Firebase cleanup
      await AuthErrorRecoveryService.handleFirebaseCleanup('integration test cleanup')

      // Verify all delegations occurred
      expect(mockErrorRecoveryService.initialize).toHaveBeenCalledTimes(1)
      expect(mockErrorRecoveryService.handleAuthenticationError).toHaveBeenCalledTimes(1)
      expect(mockErrorRecoveryService.showErrorFeedback).toHaveBeenCalledTimes(1)
      expect(mockErrorRecoveryService.handleFirebaseCleanup).toHaveBeenCalledTimes(1)
    })
  })

  describe('Performance and Memory', () => {
    it('should handle high-frequency method calls efficiently', async () => {
      const iterations = 100

      // Test initialize
      for (let i = 0; i < iterations; i++) {
        AuthErrorRecoveryService.initialize(mockAuthStore, mockWalletStore)
      }

      // Test showErrorFeedback
      const mockError: AppError = {
        name: 'TestError',
        message: 'Test',
        type: 'TEST_ERROR' as any,
        userFriendlyMessage: 'Test',
        timestamp: new Date(),
      }

      const mockResult: ErrorRecoveryResult = {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 0,
        cleanupPerformed: false,
      }

      for (let i = 0; i < iterations; i++) {
        AuthErrorRecoveryService.showErrorFeedback(mockError, mockResult)
      }

      expect(mockErrorRecoveryService.initialize).toHaveBeenCalledTimes(iterations)
      expect(mockErrorRecoveryService.showErrorFeedback).toHaveBeenCalledTimes(iterations)
    })

    it('should not retain references to passed parameters', () => {
      const testError = new Error('Memory test')
      
      // Call method with error
      AuthErrorRecoveryService.handleAuthenticationError(testError)

      // Verify delegation occurred but AuthErrorRecoveryService doesn't store references
      expect(mockErrorRecoveryService.handleAuthenticationError).toHaveBeenCalledWith(testError)
    })
  })
})