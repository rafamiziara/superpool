import { useCallback, useState } from 'react'
import { ErrorContext, ErrorDetails, ErrorHandler, ErrorType } from '../../types/errors'
import { ERROR_MESSAGES } from '../../utils/errorMessages'

export const useErrorHandling = (): ErrorHandler & {
  lastError: ErrorDetails | null
  clearError: () => void
} => {
  const [lastError, setLastError] = useState<ErrorDetails | null>(null)

  const formatError = useCallback((error: unknown, type: ErrorType = ErrorType.UNKNOWN_ERROR, context?: ErrorContext): ErrorDetails => {
    const errorDetails: ErrorDetails = {
      type,
      message: ERROR_MESSAGES[type],
      originalError: error,
      timestamp: Date.now(),
      context,
    }

    // Try to extract more specific error information
    if (error instanceof Error) {
      // Check for specific error patterns
      if (error.message.includes('User rejected')) {
        errorDetails.type = ErrorType.SIGNATURE_REJECTED
        errorDetails.message = ERROR_MESSAGES[ErrorType.SIGNATURE_REJECTED]
      } else if (error.message.includes('network') || error.message.includes('Network')) {
        errorDetails.type = ErrorType.NETWORK_ERROR
        errorDetails.message = ERROR_MESSAGES[ErrorType.NETWORK_ERROR]
      } else if (error.message.includes('Firebase') || error.message.includes('auth')) {
        errorDetails.type = ErrorType.FIREBASE_AUTH_FAILED
        errorDetails.message = ERROR_MESSAGES[ErrorType.FIREBASE_AUTH_FAILED]
      }

      // Add original error message as context
      errorDetails.context = {
        ...errorDetails.context,
        originalMessage: error.message,
        stack: error.stack || undefined,
      }
    }

    setLastError(errorDetails)
    return errorDetails
  }, [])

  const getErrorMessage = useCallback((error: unknown): string => {
    if (error instanceof Error) {
      return error.message
    }
    if (typeof error === 'string') {
      return error
    }
    return 'An unexpected error occurred'
  }, [])

  const isRetryableError = useCallback((errorDetails: ErrorDetails): boolean => {
    const retryableTypes = [
      ErrorType.WALLET_CONNECTION_FAILED,
      ErrorType.MESSAGE_GENERATION_FAILED,
      ErrorType.SIGNATURE_FAILED,
      ErrorType.FIREBASE_AUTH_FAILED,
      ErrorType.NETWORK_ERROR,
      ErrorType.UNKNOWN_ERROR,
    ]
    return retryableTypes.includes(errorDetails.type)
  }, [])

  const shouldShowToUser = useCallback((errorDetails: ErrorDetails): boolean => {
    const userVisibleTypes = [
      ErrorType.WALLET_CONNECTION_FAILED,
      ErrorType.SIGNATURE_REJECTED,
      ErrorType.SIGNATURE_FAILED,
      ErrorType.FIREBASE_AUTH_FAILED,
      ErrorType.NETWORK_ERROR,
    ]
    return userVisibleTypes.includes(errorDetails.type)
  }, [])

  const clearError = useCallback(() => {
    setLastError(null)
  }, [])

  return {
    formatError,
    getErrorMessage,
    isRetryableError,
    shouldShowToUser,
    lastError,
    clearError,
  }
}
