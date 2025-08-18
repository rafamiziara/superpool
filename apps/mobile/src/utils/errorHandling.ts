// Error types for better error handling and user feedback
export enum ErrorType {
  WALLET_CONNECTION = 'WALLET_CONNECTION',
  SIGNATURE_REJECTED = 'SIGNATURE_REJECTED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  BACKEND_ERROR = 'BACKEND_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppError extends Error {
  type: ErrorType
  originalError?: unknown
  userFriendlyMessage: string
}

// Error message mappings for user-friendly display
export const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.WALLET_CONNECTION]: 'Failed to connect to wallet. Please try again.',
  [ErrorType.SIGNATURE_REJECTED]: 'Authentication was cancelled. You can try connecting again when ready.',
  [ErrorType.NETWORK_ERROR]: 'Network error. Please check your connection and try again.',
  [ErrorType.AUTHENTICATION_FAILED]: 'Authentication failed. Please try connecting your wallet again.',
  [ErrorType.BACKEND_ERROR]: 'Server error. Please try again in a moment.',
  [ErrorType.UNKNOWN_ERROR]: 'Something went wrong. Please try again.',
}

// Helper function to create structured app errors
export function createAppError(type: ErrorType, message: string, originalError?: unknown): AppError {
  const error = new Error(message) as AppError
  error.type = type
  error.originalError = originalError
  error.userFriendlyMessage = ERROR_MESSAGES[type]
  return error
}

// Function to categorize and handle different error types
export function categorizeError(error: unknown): AppError {
  if (error && typeof error === 'object' && 'type' in error) {
    return error as AppError
  }

  const errorMessage = error instanceof Error ? error.message : String(error)
  const lowerMessage = errorMessage.toLowerCase()

  // Categorize based on error message content
  if (lowerMessage.includes('user rejected') || lowerMessage.includes('user denied')) {
    return createAppError(ErrorType.SIGNATURE_REJECTED, errorMessage, error)
  }

  if (lowerMessage.includes('no matching key') || lowerMessage.includes('session')) {
    return createAppError(ErrorType.WALLET_CONNECTION, 'Wallet session expired. Please reconnect your wallet.', error)
  }

  if (lowerMessage.includes('chainid not found') || (lowerMessage.includes('chain') && lowerMessage.includes('not found'))) {
    return createAppError(ErrorType.WALLET_CONNECTION, 'Unsupported network. Please switch to a supported chain.', error)
  }

  if (lowerMessage.includes('connectornotconnectederror') || lowerMessage.includes('connector not connected')) {
    return createAppError(ErrorType.SIGNATURE_REJECTED, 'Connection was closed. Please try connecting again.', error)
  }

  if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
    return createAppError(ErrorType.NETWORK_ERROR, errorMessage, error)
  }

  if (lowerMessage.includes('wallet') || lowerMessage.includes('connection') || lowerMessage.includes('connector')) {
    return createAppError(ErrorType.WALLET_CONNECTION, errorMessage, error)
  }

  if (
    lowerMessage.includes('signature format') ||
    lowerMessage.includes('invalid signature') ||
    (lowerMessage.includes('signature') && lowerMessage.includes('invalid'))
  ) {
    return createAppError(ErrorType.AUTHENTICATION_FAILED, 'Signature validation failed. Please try connecting again.', error)
  }

  if (lowerMessage.includes('auth') || lowerMessage.includes('token')) {
    return createAppError(ErrorType.AUTHENTICATION_FAILED, errorMessage, error)
  }

  if (lowerMessage.includes('functions') || lowerMessage.includes('firebase')) {
    return createAppError(ErrorType.BACKEND_ERROR, errorMessage, error)
  }

  return createAppError(ErrorType.UNKNOWN_ERROR, errorMessage, error)
}

// Helper to check if error is user-initiated (like canceling a signature)
export function isUserInitiatedError(error: AppError): boolean {
  return error.type === ErrorType.SIGNATURE_REJECTED
}

// Helper to check if error should be retried automatically
export function shouldRetryError(error: AppError): boolean {
  return error.type === ErrorType.NETWORK_ERROR || error.type === ErrorType.BACKEND_ERROR
}
