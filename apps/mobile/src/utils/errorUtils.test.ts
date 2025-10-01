import { ErrorType } from '../types/errors'
import { createErrorDetails, getErrorSuggestions, isFirebaseError, isWalletError, logError } from './errorUtils'

// Mock console.error to capture logs
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

// Mock Date.now for consistent timestamps
const mockTimestamp = 1234567890000
jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp)

describe('errorUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  describe('createErrorDetails', () => {
    it('should create error details with type and message only', () => {
      const result = createErrorDetails(ErrorType.NETWORK_ERROR)

      expect(result).toEqual({
        type: ErrorType.NETWORK_ERROR,
        message: 'Network connection error. Please check your internet and try again.',
        originalError: undefined,
        timestamp: mockTimestamp,
        context: undefined,
      })
    })

    it('should create error details with original error', () => {
      const originalError = new Error('Original error message')
      const result = createErrorDetails(ErrorType.WALLET_CONNECTION_FAILED, originalError)

      expect(result).toEqual({
        type: ErrorType.WALLET_CONNECTION_FAILED,
        message: 'Failed to connect to your wallet. Please try again.',
        originalError,
        timestamp: mockTimestamp,
        context: undefined,
      })
    })

    it('should create error details with context', () => {
      const context = { walletType: 'MetaMask', chainId: 137 }
      const result = createErrorDetails(ErrorType.SIGNATURE_FAILED, undefined, context)

      expect(result).toEqual({
        type: ErrorType.SIGNATURE_FAILED,
        message: 'Failed to sign the authentication message. Please try again.',
        originalError: undefined,
        timestamp: mockTimestamp,
        context,
      })
    })

    it('should create error details with all parameters', () => {
      const originalError = new Error('Test error')
      const context = { step: 'authentication', attempt: 2 }
      const result = createErrorDetails(ErrorType.FIREBASE_AUTH_FAILED, originalError, context)

      expect(result).toEqual({
        type: ErrorType.FIREBASE_AUTH_FAILED,
        message: 'Authentication failed. Please try connecting your wallet again.',
        originalError,
        timestamp: mockTimestamp,
        context,
      })
    })

    it('should handle all error types correctly', () => {
      const errorTypes = [
        ErrorType.WALLET_CONNECTION_FAILED,
        ErrorType.WALLET_DISCONNECTED,
        ErrorType.MESSAGE_GENERATION_FAILED,
        ErrorType.SIGNATURE_REJECTED,
        ErrorType.SIGNATURE_FAILED,
        ErrorType.FIREBASE_AUTH_FAILED,
        ErrorType.NETWORK_ERROR,
        ErrorType.UNKNOWN_ERROR,
      ]

      errorTypes.forEach((errorType) => {
        const result = createErrorDetails(errorType)
        expect(result.type).toBe(errorType)
        expect(result.message).toBeTruthy()
        expect(typeof result.message).toBe('string')
        expect(result.timestamp).toBe(mockTimestamp)
      })
    })
  })

  describe('getErrorSuggestions', () => {
    it('should return suggestions for wallet connection failed', () => {
      const errorDetails = createErrorDetails(ErrorType.WALLET_CONNECTION_FAILED)
      const suggestions = getErrorSuggestions(errorDetails)

      expect(suggestions).toEqual(['Make sure your wallet app is running', 'Try refreshing the page', 'Check your internet connection'])
    })

    it('should return suggestions for wallet disconnected', () => {
      const errorDetails = createErrorDetails(ErrorType.WALLET_DISCONNECTED)
      const suggestions = getErrorSuggestions(errorDetails)

      expect(suggestions).toEqual(['Reconnect your wallet using the button above', 'Check if your wallet is still unlocked'])
    })

    it('should return suggestions for signature rejected', () => {
      const errorDetails = createErrorDetails(ErrorType.SIGNATURE_REJECTED)
      const suggestions = getErrorSuggestions(errorDetails)

      expect(suggestions).toEqual(['Click "Connect Wallet" to try again', 'Make sure you approve the signature request'])
    })

    it('should return suggestions for network error', () => {
      const errorDetails = createErrorDetails(ErrorType.NETWORK_ERROR)
      const suggestions = getErrorSuggestions(errorDetails)

      expect(suggestions).toEqual(['Check your internet connection', 'Try again in a few moments'])
    })

    it('should return empty array for undefined error type', () => {
      // Simulate an error type that doesn't exist in suggestions
      const errorDetails = {
        type: 'NON_EXISTENT_TYPE' as ErrorType,
        message: 'Test message',
        timestamp: mockTimestamp,
      }
      const suggestions = getErrorSuggestions(errorDetails)

      expect(suggestions).toEqual([])
    })

    it('should return suggestions for all defined error types', () => {
      const errorTypes = [
        ErrorType.WALLET_CONNECTION_FAILED,
        ErrorType.WALLET_DISCONNECTED,
        ErrorType.MESSAGE_GENERATION_FAILED,
        ErrorType.SIGNATURE_REJECTED,
        ErrorType.SIGNATURE_FAILED,
        ErrorType.FIREBASE_AUTH_FAILED,
        ErrorType.NETWORK_ERROR,
        ErrorType.UNKNOWN_ERROR,
      ]

      errorTypes.forEach((errorType) => {
        const errorDetails = createErrorDetails(errorType)
        const suggestions = getErrorSuggestions(errorDetails)
        expect(Array.isArray(suggestions)).toBe(true)
        expect(suggestions.length).toBeGreaterThan(0)
      })
    })
  })

  describe('logError', () => {
    it('should log error details to console', () => {
      const errorDetails = createErrorDetails(ErrorType.WALLET_CONNECTION_FAILED)
      logError(errorDetails)

      expect(mockConsoleError).toHaveBeenCalledWith('[SuperPool Error]', {
        type: ErrorType.WALLET_CONNECTION_FAILED,
        message: 'Failed to connect to your wallet. Please try again.',
        timestamp: new Date(mockTimestamp).toISOString(),
        context: undefined,
        originalError: undefined,
      })
    })

    it('should log error with original error and context', () => {
      const originalError = new Error('Test error')
      const context = { walletType: 'MetaMask' }
      const errorDetails = createErrorDetails(ErrorType.SIGNATURE_FAILED, originalError, context)

      logError(errorDetails)

      expect(mockConsoleError).toHaveBeenCalledWith('[SuperPool Error]', {
        type: ErrorType.SIGNATURE_FAILED,
        message: 'Failed to sign the authentication message. Please try again.',
        timestamp: new Date(mockTimestamp).toISOString(),
        context,
        originalError,
      })
    })

    it('should format timestamp correctly', () => {
      const customTimestamp = 1609459200000 // 2021-01-01T00:00:00.000Z
      const errorDetails = {
        type: ErrorType.NETWORK_ERROR,
        message: 'Test message',
        timestamp: customTimestamp,
      }

      logError(errorDetails)

      expect(mockConsoleError).toHaveBeenCalledWith('[SuperPool Error]', {
        type: ErrorType.NETWORK_ERROR,
        message: 'Test message',
        timestamp: '2021-01-01T00:00:00.000Z',
        context: undefined,
        originalError: undefined,
      })
    })
  })

  describe('isWalletError', () => {
    it('should return true for wallet connection failed', () => {
      const errorDetails = createErrorDetails(ErrorType.WALLET_CONNECTION_FAILED)
      expect(isWalletError(errorDetails)).toBe(true)
    })

    it('should return true for wallet disconnected', () => {
      const errorDetails = createErrorDetails(ErrorType.WALLET_DISCONNECTED)
      expect(isWalletError(errorDetails)).toBe(true)
    })

    it('should return true for signature rejected', () => {
      const errorDetails = createErrorDetails(ErrorType.SIGNATURE_REJECTED)
      expect(isWalletError(errorDetails)).toBe(true)
    })

    it('should return true for signature failed', () => {
      const errorDetails = createErrorDetails(ErrorType.SIGNATURE_FAILED)
      expect(isWalletError(errorDetails)).toBe(true)
    })

    it('should return false for firebase auth failed', () => {
      const errorDetails = createErrorDetails(ErrorType.FIREBASE_AUTH_FAILED)
      expect(isWalletError(errorDetails)).toBe(false)
    })

    it('should return false for network error', () => {
      const errorDetails = createErrorDetails(ErrorType.NETWORK_ERROR)
      expect(isWalletError(errorDetails)).toBe(false)
    })

    it('should return false for message generation failed', () => {
      const errorDetails = createErrorDetails(ErrorType.MESSAGE_GENERATION_FAILED)
      expect(isWalletError(errorDetails)).toBe(false)
    })

    it('should return false for unknown error', () => {
      const errorDetails = createErrorDetails(ErrorType.UNKNOWN_ERROR)
      expect(isWalletError(errorDetails)).toBe(false)
    })
  })

  describe('isFirebaseError', () => {
    it('should return true for firebase auth failed', () => {
      const errorDetails = createErrorDetails(ErrorType.FIREBASE_AUTH_FAILED)
      expect(isFirebaseError(errorDetails)).toBe(true)
    })

    it('should return false for wallet connection failed', () => {
      const errorDetails = createErrorDetails(ErrorType.WALLET_CONNECTION_FAILED)
      expect(isFirebaseError(errorDetails)).toBe(false)
    })

    it('should return false for wallet disconnected', () => {
      const errorDetails = createErrorDetails(ErrorType.WALLET_DISCONNECTED)
      expect(isFirebaseError(errorDetails)).toBe(false)
    })

    it('should return false for signature errors', () => {
      const signatureErrors = [ErrorType.SIGNATURE_REJECTED, ErrorType.SIGNATURE_FAILED]

      signatureErrors.forEach((errorType) => {
        const errorDetails = createErrorDetails(errorType)
        expect(isFirebaseError(errorDetails)).toBe(false)
      })
    })

    it('should return false for network error', () => {
      const errorDetails = createErrorDetails(ErrorType.NETWORK_ERROR)
      expect(isFirebaseError(errorDetails)).toBe(false)
    })

    it('should return false for unknown error', () => {
      const errorDetails = createErrorDetails(ErrorType.UNKNOWN_ERROR)
      expect(isFirebaseError(errorDetails)).toBe(false)
    })
  })
})
