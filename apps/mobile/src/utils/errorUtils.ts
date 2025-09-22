import { ERROR_MESSAGES, ERROR_SUGGESTIONS } from '../constants'
import { ErrorContext, ErrorDetails, ErrorType } from '../types/errors'

export const createErrorDetails = (type: ErrorType, originalError?: unknown, context?: ErrorContext): ErrorDetails => ({
  type,
  message: ERROR_MESSAGES[type],
  originalError,
  timestamp: Date.now(),
  context,
})

export const getErrorSuggestions = (errorDetails: ErrorDetails): string[] => {
  return ERROR_SUGGESTIONS[errorDetails.type] || []
}

export const logError = (errorDetails: ErrorDetails): void => {
  console.error('[SuperPool Error]', {
    type: errorDetails.type,
    message: errorDetails.message,
    timestamp: new Date(errorDetails.timestamp).toISOString(),
    context: errorDetails.context,
    originalError: errorDetails.originalError,
  })
}

export const isWalletError = (errorDetails: ErrorDetails): boolean => {
  const walletErrorTypes = [
    ErrorType.WALLET_CONNECTION_FAILED,
    ErrorType.WALLET_DISCONNECTED,
    ErrorType.SIGNATURE_REJECTED,
    ErrorType.SIGNATURE_FAILED,
  ]
  return walletErrorTypes.includes(errorDetails.type)
}

export const isFirebaseError = (errorDetails: ErrorDetails): boolean => {
  return errorDetails.type === ErrorType.FIREBASE_AUTH_FAILED
}
