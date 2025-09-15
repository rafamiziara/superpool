export enum ErrorType {
  WALLET_CONNECTION_FAILED = 'WALLET_CONNECTION_FAILED',
  WALLET_DISCONNECTED = 'WALLET_DISCONNECTED',
  MESSAGE_GENERATION_FAILED = 'MESSAGE_GENERATION_FAILED',
  SIGNATURE_REJECTED = 'SIGNATURE_REJECTED',
  SIGNATURE_FAILED = 'SIGNATURE_FAILED',
  FIREBASE_AUTH_FAILED = 'FIREBASE_AUTH_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export type ErrorContext = Record<string, string | number | boolean | null | undefined>

export interface ErrorDetails {
  type: ErrorType
  message: string
  originalError?: unknown
  timestamp: number
  context?: ErrorContext
}

export interface ErrorHandler {
  formatError: (error: unknown, type?: ErrorType, context?: ErrorContext) => ErrorDetails
  getErrorMessage: (error: unknown) => string
  isRetryableError: (errorDetails: ErrorDetails) => boolean
  shouldShowToUser: (errorDetails: ErrorDetails) => boolean
}
