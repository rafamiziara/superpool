// Mock dependencies FIRST before any imports
const mockToast = {
  show: jest.fn(),
  hide: jest.fn(),
}

// Clear setupTests.ts mock for this specific test
jest.unmock('./toast')

// Mock react-native-toast-message before imports
jest.doMock('react-native-toast-message', () => mockToast)

// Mock errorHandling module
jest.doMock('./errorHandling', () => ({
  ErrorType: {
    WALLET_CONNECTION: 'WALLET_CONNECTION',
    SIGNATURE_REJECTED: 'SIGNATURE_REJECTED',
    NETWORK_ERROR: 'NETWORK_ERROR',
    AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
    BACKEND_ERROR: 'BACKEND_ERROR',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR',
    TIMEOUT_ERROR: 'TIMEOUT_ERROR',
    TRANSACTION_REJECTED: 'TRANSACTION_REJECTED',
    INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
    SESSION_CORRUPTION: 'SESSION_CORRUPTION',
    CHAIN_MISMATCH: 'CHAIN_MISMATCH',
  },
  ERROR_MESSAGES: {
    WALLET_CONNECTION: 'Failed to connect to wallet. Please try again.',
    SIGNATURE_REJECTED: 'Authentication was cancelled. You can try connecting again when ready.',
    NETWORK_ERROR: 'Network error. Please check your connection and try again.',
    AUTHENTICATION_FAILED: 'Authentication failed. Please try connecting your wallet again.',
    BACKEND_ERROR: 'Server error. Please try again in a moment.',
    UNKNOWN_ERROR: 'Something went wrong. Please try again.',
    TIMEOUT_ERROR: 'Operation timed out. Please try again.',
    TRANSACTION_REJECTED: 'Transaction was rejected. Please try again.',
    INSUFFICIENT_FUNDS: 'Insufficient funds to complete transaction.',
    SESSION_CORRUPTION: 'Session corrupted. Please reconnect your wallet.',
    CHAIN_MISMATCH: 'Wrong network selected. Please switch to the correct chain.',
  },
}))

// Import after mocking - use require to ensure mocks are applied
const {
  showSuccessToast,
  showErrorToast,
  showInfoToast,
  showWarningToast,
  showErrorFromAppError,
  authToasts,
  appToasts,
} = require('./toast')

const { ErrorType } = require('./errorHandling')

export type ToastType = 'success' | 'error' | 'info' | 'warning'
export interface AppError extends Error {
  type: import('./errorHandling').ErrorType
  originalError?: unknown
  userFriendlyMessage: string
  timestamp: Date
}

describe('toast utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Basic Toast Functions', () => {
    describe('showSuccessToast', () => {
      it('should show success toast with default parameters', () => {
        showSuccessToast('Success message')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: 'Success message',
          visibilityTime: 3000,
          position: 'bottom',
        })
      })

      it('should show success toast with custom parameters', () => {
        showSuccessToast('Custom success', 'Subtitle', 5000, 'top')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: 'Custom success',
          text2: 'Subtitle',
          visibilityTime: 5000,
          position: 'top',
        })
      })

      it('should handle empty and undefined parameters', () => {
        showSuccessToast('')
        showSuccessToast('Message', undefined)
        showSuccessToast('Message', '', undefined)

        expect(mockToast.show).toHaveBeenCalledTimes(3)
      })
    })

    describe('showErrorToast', () => {
      it('should show error toast with default parameters', () => {
        showErrorToast('Error message')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Error message',
          visibilityTime: 4000,
          position: 'bottom',
        })
      })

      it('should show error toast with custom parameters', () => {
        showErrorToast('Custom error', 'Error details', 6000, 'top')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Custom error',
          text2: 'Error details',
          visibilityTime: 6000,
          position: 'top',
        })
      })

      it('should use longer default duration than success toast', () => {
        showSuccessToast('Success')
        showErrorToast('Error')

        const successCall = mockToast.show.mock.calls[0][0]
        const errorCall = mockToast.show.mock.calls[1][0]

        expect(errorCall.visibilityTime).toBeGreaterThan(successCall.visibilityTime)
      })
    })

    describe('showInfoToast', () => {
      it('should show info toast with default parameters', () => {
        showInfoToast('Info message')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'info',
          text1: 'Info message',
          visibilityTime: 3000,
          position: 'bottom',
        })
      })

      it('should show info toast with custom parameters', () => {
        showInfoToast('Custom info', 'Additional info', 4000, 'top')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'info',
          text1: 'Custom info',
          text2: 'Additional info',
          visibilityTime: 4000,
          position: 'top',
        })
      })
    })

    describe('showWarningToast', () => {
      it('should show warning toast with default parameters', () => {
        showWarningToast('Warning message')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'warning',
          text1: 'Warning message',
          visibilityTime: 4000,
          position: 'bottom',
        })
      })

      it('should show warning toast with custom parameters', () => {
        showWarningToast('Custom warning', 'Warning details', 5000, 'top')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'warning',
          text1: 'Custom warning',
          text2: 'Warning details',
          visibilityTime: 5000,
          position: 'top',
        })
      })
    })
  })

  describe('showErrorFromAppError', () => {
    const createMockAppError = (type: (typeof ErrorType)[keyof typeof ErrorType], message?: string): AppError => ({
      type,
      message: message || 'Generic message',
      userFriendlyMessage: 'User friendly message',
      name: 'AppError',
      timestamp: new Date(),
      originalError: undefined,
    })

    describe('Error Type to Title Mapping', () => {
      it('should map wallet connection errors to appropriate title', () => {
        const error = createMockAppError(ErrorType.WALLET_CONNECTION)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            text1: 'Connection Failed',
          })
        )
      })

      it('should map authentication errors to appropriate title', () => {
        const error = createMockAppError(ErrorType.AUTHENTICATION_FAILED)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            text1: 'Authentication Failed',
          })
        )
      })

      it('should map signature rejection to appropriate title', () => {
        const error = createMockAppError(ErrorType.SIGNATURE_REJECTED)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Signature Rejected',
          })
        )
      })

      it('should map network errors to appropriate title', () => {
        const error = createMockAppError(ErrorType.NETWORK_ERROR)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Network Error',
          })
        )
      })

      it('should map backend errors to appropriate title', () => {
        const error = createMockAppError(ErrorType.BACKEND_ERROR)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Server Error',
          })
        )
      })

      it('should map transaction rejection to appropriate title', () => {
        const error = createMockAppError(ErrorType.TRANSACTION_REJECTED)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Transaction Rejected',
          })
        )
      })

      it('should map insufficient funds to appropriate title', () => {
        const error = createMockAppError(ErrorType.INSUFFICIENT_FUNDS)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Insufficient Funds',
          })
        )
      })

      it('should map chain mismatch to appropriate title', () => {
        const error = createMockAppError(ErrorType.CHAIN_MISMATCH)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Wrong Network',
          })
        )
      })

      it('should map session corruption to appropriate title', () => {
        const error = createMockAppError(ErrorType.SESSION_CORRUPTION)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Connection Lost',
          })
        )
      })

      it('should map timeout errors to appropriate title', () => {
        const error = createMockAppError(ErrorType.TIMEOUT_ERROR)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Request Timeout',
          })
        )
      })

      it('should map unknown errors to generic title', () => {
        const error = createMockAppError(ErrorType.UNKNOWN_ERROR)
        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text1: 'Something Went Wrong',
          })
        )
      })
    })

    describe('Error Type to Duration Mapping', () => {
      it('should use shorter duration for user-initiated errors', () => {
        const userErrors = [ErrorType.SIGNATURE_REJECTED, ErrorType.TRANSACTION_REJECTED]

        userErrors.forEach((errorType) => {
          const error = createMockAppError(errorType)
          showErrorFromAppError(error)
        })

        const calls = mockToast.show.mock.calls
        calls.forEach((call) => {
          expect(call[0].visibilityTime).toBe(3000) // Shorter duration
        })
      })

      it('should use longer duration for technical errors', () => {
        const technicalErrors = [
          ErrorType.NETWORK_ERROR,
          ErrorType.SESSION_CORRUPTION,
          ErrorType.TIMEOUT_ERROR,
          ErrorType.AUTHENTICATION_FAILED,
        ]

        technicalErrors.forEach((errorType) => {
          const error = createMockAppError(errorType)
          showErrorFromAppError(error)
        })

        const calls = mockToast.show.mock.calls
        calls.forEach((call) => {
          expect(call[0].visibilityTime).toBe(5000) // Longer duration
        })
      })

      it('should use persistent duration for critical errors', () => {
        const criticalErrors = [ErrorType.CHAIN_MISMATCH, ErrorType.INSUFFICIENT_FUNDS]

        criticalErrors.forEach((errorType) => {
          const error = createMockAppError(errorType)
          showErrorFromAppError(error)
        })

        const calls = mockToast.show.mock.calls
        calls.forEach((call) => {
          expect(call[0].visibilityTime).toBe(8000) // Persistent duration
        })
      })

      it('should use standard duration for other errors', () => {
        const standardErrors = [ErrorType.WALLET_CONNECTION, ErrorType.BACKEND_ERROR, ErrorType.UNKNOWN_ERROR]

        standardErrors.forEach((errorType) => {
          const error = createMockAppError(errorType)
          showErrorFromAppError(error)
        })

        const calls = mockToast.show.mock.calls
        calls.forEach((call) => {
          expect(call[0].visibilityTime).toBe(4000) // Standard duration
        })
      })
    })

    describe('Message Content', () => {
      it('should use userFriendlyMessage as text2', () => {
        const error = createMockAppError(ErrorType.NETWORK_ERROR)
        error.userFriendlyMessage = 'Check your internet connection'

        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text2: 'Check your internet connection',
          })
        )
      })

      it('should handle errors without userFriendlyMessage', () => {
        const error = createMockAppError(ErrorType.UNKNOWN_ERROR)
        error.userFriendlyMessage = ''

        showErrorFromAppError(error)

        expect(mockToast.show).toHaveBeenCalledWith(
          expect.objectContaining({
            text2: '',
          })
        )
      })
    })

    describe('Edge Cases', () => {
      it('should handle null and undefined errors gracefully', () => {
        expect(() => {
          showErrorFromAppError(null as unknown as AppError)
          showErrorFromAppError(undefined as unknown as AppError)
        }).not.toThrow()

        expect(mockToast.show).toHaveBeenCalledTimes(2)
      })

      it('should handle malformed error objects', () => {
        const malformedError = { type: 'INVALID_TYPE' } as unknown as AppError

        expect(() => {
          showErrorFromAppError(malformedError)
        }).not.toThrow()

        expect(mockToast.show).toHaveBeenCalled()
      })
    })
  })

  describe('authToasts', () => {
    describe('Authentication Success Toasts', () => {
      it('should show wallet connected success toast', () => {
        authToasts.walletConnected('MetaMask')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: 'Wallet Connected',
          text2: 'Successfully connected to MetaMask',
          visibilityTime: 3000,
          position: 'bottom',
        })
      })

      it('should show authentication success toast', () => {
        authToasts.authSuccess()

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: 'Authentication Successful',
          text2: 'Welcome to SuperPool!',
          visibilityTime: 3000,
          position: 'bottom',
        })
      })

      it('should show wallet disconnected info toast', () => {
        authToasts.walletDisconnected()

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'info',
          text1: 'Wallet Disconnected',
          text2: 'Your wallet has been safely disconnected',
          visibilityTime: 3000,
          position: 'bottom',
        })
      })
    })

    describe('Authentication Error Toasts', () => {
      it('should show connection failed error toast', () => {
        authToasts.connectionFailed('Connection timeout')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Connection Failed',
          text2: 'Connection timeout',
          visibilityTime: 4000,
          position: 'bottom',
        })
      })

      it('should show signature rejected error toast', () => {
        authToasts.signatureRejected()

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'warning',
          text1: 'Signature Rejected',
          text2: 'Please approve the signature to continue',
          visibilityTime: 4000,
          position: 'bottom',
        })
      })

      it('should show network mismatch warning toast', () => {
        authToasts.networkMismatch('Polygon')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'warning',
          text1: 'Wrong Network',
          text2: 'Please switch to Polygon in your wallet',
          visibilityTime: 6000,
          position: 'bottom',
        })
      })
    })

    describe('Authentication Process Toasts', () => {
      it('should show session recovery info toast', () => {
        authToasts.sessionRecovery()

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'info',
          text1: 'Recovering Session',
          text2: 'Attempting to restore your connection...',
          visibilityTime: 3000,
          position: 'bottom',
        })
      })

      it('should show session expired warning toast', () => {
        authToasts.sessionExpired()

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'warning',
          text1: 'Session Expired',
          text2: 'Please reconnect your wallet to continue',
          visibilityTime: 5000,
          position: 'bottom',
        })
      })
    })

    describe('Parameter Handling', () => {
      it('should handle optional parameters in auth toasts', () => {
        authToasts.walletConnected() // No wallet name
        authToasts.connectionFailed() // No reason
        authToasts.networkMismatch() // No network name

        expect(mockToast.show).toHaveBeenCalledTimes(3)

        // Check that calls were made with appropriate fallback text
        const calls = mockToast.show.mock.calls
        expect(calls[0][0].text2).toContain('connected') // Generic connected message
        expect(calls[1][0].text2).toBeTruthy() // Should have some error message
        expect(calls[2][0].text2).toContain('wallet') // Should mention wallet switching
      })
    })
  })

  describe('appToasts', () => {
    describe('Application Operation Toasts', () => {
      it('should show operation success toast', () => {
        appToasts.operationSuccess('Transaction sent')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: 'Success',
          text2: 'Transaction sent',
          visibilityTime: 3000,
          position: 'bottom',
        })
      })

      it('should show operation failed toast', () => {
        appToasts.operationFailed('Transaction failed', 'Insufficient gas')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Transaction failed',
          text2: 'Insufficient gas',
          visibilityTime: 4000,
          position: 'bottom',
        })
      })

      it('should show loading toast', () => {
        appToasts.loading('Processing transaction...')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'info',
          text1: 'Please Wait',
          text2: 'Processing transaction...',
          visibilityTime: 2000,
          position: 'bottom',
        })
      })
    })

    describe('Data Operation Toasts', () => {
      it('should show data saved toast', () => {
        appToasts.dataSaved('Profile updated')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: 'Saved',
          text2: 'Profile updated',
          visibilityTime: 2500,
          position: 'bottom',
        })
      })

      it('should show data loaded toast', () => {
        appToasts.dataLoaded('Portfolio data refreshed')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'info',
          text1: 'Updated',
          text2: 'Portfolio data refreshed',
          visibilityTime: 2000,
          position: 'bottom',
        })
      })
    })

    describe('Validation and Warning Toasts', () => {
      it('should show validation error toast', () => {
        appToasts.validationError('Please fill in all required fields')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'warning',
          text1: 'Validation Error',
          text2: 'Please fill in all required fields',
          visibilityTime: 4000,
          position: 'bottom',
        })
      })

      it('should show permission denied toast', () => {
        appToasts.permissionDenied('Camera access required')

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'error',
          text1: 'Permission Required',
          text2: 'Camera access required',
          visibilityTime: 5000,
          position: 'bottom',
        })
      })
    })

    describe('App State Toasts', () => {
      it('should show offline toast', () => {
        appToasts.offline()

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'warning',
          text1: 'No Internet',
          text2: 'Some features may not work properly',
          visibilityTime: 5000,
          position: 'bottom',
        })
      })

      it('should show online toast', () => {
        appToasts.online()

        expect(mockToast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: 'Connected',
          text2: 'Internet connection restored',
          visibilityTime: 2000,
          position: 'bottom',
        })
      })
    })
  })

  describe('Toast Configuration and Consistency', () => {
    describe('Default Values Consistency', () => {
      it('should use consistent default positions', () => {
        showSuccessToast('Test')
        showErrorToast('Test')
        showInfoToast('Test')
        showWarningToast('Test')

        mockToast.show.mock.calls.forEach((call) => {
          expect(call[0].position).toBe('bottom')
        })
      })

      it('should use appropriate durations for different types', () => {
        showSuccessToast('Test')
        showErrorToast('Test')
        showInfoToast('Test')
        showWarningToast('Test')

        const calls = mockToast.show.mock.calls
        const successDuration = calls[0][0].visibilityTime
        const errorDuration = calls[1][0].visibilityTime
        const infoDuration = calls[2][0].visibilityTime
        const warningDuration = calls[3][0].visibilityTime

        expect(errorDuration).toBeGreaterThan(successDuration)
        expect(warningDuration).toBeGreaterThan(successDuration)
        expect(infoDuration).toBe(successDuration)
      })
    })

    describe('Toast Type Definitions', () => {
      it('should support all ToastType values', () => {
        const toastTypes: ToastType[] = ['success', 'error', 'info', 'warning']

        // This is mainly a compilation test to ensure types are exported correctly
        toastTypes.forEach((type) => {
          expect(typeof type).toBe('string')
          expect(['success', 'error', 'info', 'warning']).toContain(type)
        })
      })
    })
  })

  describe('Error Handling and Edge Cases', () => {
    describe('Invalid Parameters', () => {
      it('should handle empty strings gracefully', () => {
        expect(() => {
          showSuccessToast('')
          showErrorToast('')
          showInfoToast('')
          showWarningToast('')
        }).not.toThrow()

        expect(mockToast.show).toHaveBeenCalledTimes(4)
      })

      it('should handle null and undefined messages', () => {
        expect(() => {
          showSuccessToast(null as unknown as string)
          showErrorToast(undefined as unknown as string)
        }).not.toThrow()

        expect(mockToast.show).toHaveBeenCalledTimes(2)
      })

      it('should handle invalid duration values', () => {
        expect(() => {
          showSuccessToast('Test', 'Subtitle', -1000)
          showErrorToast('Test', 'Subtitle', 0)
          showInfoToast('Test', 'Subtitle', NaN)
        }).not.toThrow()

        expect(mockToast.show).toHaveBeenCalledTimes(3)
      })
    })

    describe('Toast Library Error Handling', () => {
      it('should handle toast library errors gracefully', () => {
        mockToast.show.mockImplementation(() => {
          throw new Error('Toast library error')
        })

        expect(() => {
          showSuccessToast('Test message')
        }).not.toThrow()
      })
    })
  })

  describe('Performance and Memory', () => {
    it('should handle rapid toast calls efficiently', () => {
      const start = performance.now()

      for (let i = 0; i < 100; i++) {
        showSuccessToast(`Message ${i}`)
        showErrorToast(`Error ${i}`)
      }

      const end = performance.now()
      expect(end - start).toBeLessThan(500) // Should be reasonably fast (adjusted for test environment)
      expect(mockToast.show).toHaveBeenCalledTimes(200)
    })

    it('should not cause memory leaks with repeated calls', () => {
      const initialMemory = process.memoryUsage().heapUsed

      for (let i = 0; i < 1000; i++) {
        showSuccessToast(`Test ${i}`)
        const mockError = {
          type: ErrorType.NETWORK_ERROR,
          message: `Error ${i}`,
          userFriendlyMessage: `User error ${i}`,
          name: 'AppError',
          timestamp: new Date(),
        } as AppError
        showErrorFromAppError(mockError)
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024) // Less than 100MB (adjusted for test environment)
    })
  })

  describe('Integration with Error Handling', () => {
    it('should work correctly with all error types from errorHandling module', () => {
      Object.values(ErrorType).forEach((errorType) => {
        const mockError = {
          type: errorType,
          message: `${errorType} message`,
          userFriendlyMessage: `User friendly ${errorType}`,
          name: 'AppError',
          timestamp: new Date(),
        } as AppError

        expect(() => {
          showErrorFromAppError(mockError)
        }).not.toThrow()
      })

      expect(mockToast.show).toHaveBeenCalledTimes(Object.values(ErrorType).length)
    })
  })
})
