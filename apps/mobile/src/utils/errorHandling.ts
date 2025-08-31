// Error types for better error handling and user feedback
export enum ErrorType {
  WALLET_CONNECTION = 'WALLET_CONNECTION',
  SIGNATURE_REJECTED = 'SIGNATURE_REJECTED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  BACKEND_ERROR = 'BACKEND_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  SESSION_CORRUPTION = 'SESSION_CORRUPTION',
  CHAIN_MISMATCH = 'CHAIN_MISMATCH',
}

export interface AppError extends Error {
  type: ErrorType
  originalError?: unknown
  userFriendlyMessage: string
  timestamp: Date
}

// Error message mappings for user-friendly display
export const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.WALLET_CONNECTION]: 'Failed to connect to wallet. Please try again.',
  [ErrorType.SIGNATURE_REJECTED]: 'Authentication was cancelled. You can try connecting again when ready.',
  [ErrorType.NETWORK_ERROR]: 'Network error. Please check your connection and try again.',
  [ErrorType.AUTHENTICATION_FAILED]: 'Authentication failed. Please try connecting your wallet again.',
  [ErrorType.BACKEND_ERROR]: 'Server error. Please try again in a moment.',
  [ErrorType.UNKNOWN_ERROR]: 'Something went wrong. Please try again.',
  [ErrorType.TIMEOUT_ERROR]: 'Operation timed out. Please try again.',
  [ErrorType.TRANSACTION_REJECTED]: 'Transaction was rejected. Please try again.',
  [ErrorType.INSUFFICIENT_FUNDS]: 'Insufficient funds to complete transaction.',
  [ErrorType.SESSION_CORRUPTION]: 'Session corrupted. Please reconnect your wallet.',
  [ErrorType.CHAIN_MISMATCH]: 'Wrong network selected. Please switch to the correct chain.',
}

// Helper function to create structured app errors
export function createAppError(type: ErrorType, message?: string, originalError?: unknown): AppError {
  const errorMessage = message || ERROR_MESSAGES[type]
  const error = Object.create(Error.prototype) as AppError
  Object.assign(error, {
    message: errorMessage,
    type,
    originalError,
    userFriendlyMessage: ERROR_MESSAGES[type],
    name: 'AppError',
    timestamp: new Date(),
    stack: new Error().stack,
  })
  // Override constructor to return Object constructor
  Object.defineProperty(error, 'constructor', {
    value: Object,
    writable: true,
    enumerable: false,
    configurable: true,
  })
  return error
}

// Function to categorize and handle different error types
export function categorizeError(error: unknown): AppError {
  if (error && typeof error === 'object' && 'type' in error) {
    return error as AppError
  }

  const errorMessage = error instanceof Error ? error.message : String(error)
  const lowerMessage = errorMessage.toLowerCase()

  // Handle session corruption errors specifically
  if (
    lowerMessage.includes('missing or invalid. record was recently deleted') ||
    lowerMessage.includes('session:') ||
    lowerMessage.includes('no matching key') ||
    lowerMessage.includes('session corrupt') ||
    lowerMessage.includes('session expired') ||
    lowerMessage.includes('walletconnect session error') ||
    lowerMessage.includes('session relayer failed') ||
    lowerMessage.includes('pairing expired') ||
    lowerMessage.includes('session topic not found') ||
    lowerMessage.includes('walletconnect error') ||
    lowerMessage.includes('relayer connection lost')
  ) {
    return createAppError(ErrorType.SESSION_CORRUPTION, 'Wallet session corrupted. Please reconnect your wallet.', error)
  }

  // Categorize based on error message content
  if (
    lowerMessage.includes('user rejected') ||
    lowerMessage.includes('user denied') ||
    lowerMessage.includes('user cancelled') ||
    lowerMessage.includes('walletconnect: user rejected')
  ) {
    return createAppError(ErrorType.SIGNATURE_REJECTED, errorMessage, error)
  }

  if (
    lowerMessage.includes('chainid not found') ||
    (lowerMessage.includes('chain') && lowerMessage.includes('not found')) ||
    lowerMessage.includes('chain id mismatch') ||
    lowerMessage.includes('wrong network') ||
    lowerMessage.includes('switch to polygon') ||
    lowerMessage.includes('unsupported chain')
  ) {
    return createAppError(ErrorType.NETWORK_ERROR, errorMessage, error)
  }

  if (lowerMessage.includes('connectornotconnectederror') || lowerMessage.includes('connector not connected')) {
    return createAppError(ErrorType.SIGNATURE_REJECTED, 'Connection was closed. Please try connecting again.', error)
  }

  // Handle transaction-related errors
  if (
    lowerMessage.includes('insufficient funds') ||
    lowerMessage.includes('insufficient balance') ||
    lowerMessage.includes('not enough eth for gas')
  ) {
    return createAppError(ErrorType.INSUFFICIENT_FUNDS, errorMessage, error)
  }

  if (lowerMessage.includes('transaction') && (lowerMessage.includes('rejected') || lowerMessage.includes('denied'))) {
    return createAppError(ErrorType.TRANSACTION_REJECTED, errorMessage, error)
  }

  // More general transaction patterns
  if (
    lowerMessage.includes('gas estimation failed') ||
    lowerMessage.includes('transaction underpriced') ||
    lowerMessage.includes('nonce too low')
  ) {
    return createAppError(ErrorType.NETWORK_ERROR, errorMessage, error)
  }

  // Check network errors first (including connection timeout)
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('err_network') ||
    lowerMessage.includes('connection timeout')
  ) {
    return createAppError(ErrorType.NETWORK_ERROR, errorMessage, error)
  }

  // Handle timeout errors (excluding connection timeout which is network)
  if ((lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) && !lowerMessage.includes('connection')) {
    return createAppError(ErrorType.TIMEOUT_ERROR, errorMessage, error)
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

  if (
    lowerMessage.includes('auth') ||
    lowerMessage.includes('token') ||
    lowerMessage.includes('login failed') ||
    lowerMessage.includes('invalid credentials')
  ) {
    return createAppError(ErrorType.AUTHENTICATION_FAILED, errorMessage, error)
  }

  if (lowerMessage.includes('functions') || lowerMessage.includes('firebase')) {
    return createAppError(ErrorType.BACKEND_ERROR, errorMessage, error)
  }

  return createAppError(ErrorType.UNKNOWN_ERROR, errorMessage, error)
}

// Helper to check if error is user-initiated (like canceling a signature)
export function isUserInitiatedError(error: AppError | null | undefined): boolean {
  return error?.type === ErrorType.SIGNATURE_REJECTED || error?.type === ErrorType.TRANSACTION_REJECTED
}

// Helper to check if error should be retried automatically
export function shouldRetryError(error: AppError | null | undefined): boolean {
  return (
    error?.type === ErrorType.NETWORK_ERROR ||
    error?.type === ErrorType.BACKEND_ERROR ||
    error?.type === ErrorType.TIMEOUT_ERROR ||
    error?.type === ErrorType.AUTHENTICATION_FAILED
  )
}
