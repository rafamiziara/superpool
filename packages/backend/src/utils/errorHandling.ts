import { logger } from 'firebase-functions'
import { HttpsError } from 'firebase-functions/v2/https'

export class AppError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(
    message: string,
    code: string = 'INTERNAL_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.isOperational = isOperational

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, AppError.prototype)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(
      field ? `Validation failed for ${field}: ${message}` : `Validation failed: ${message}`,
      'VALIDATION_ERROR',
      400
    )
    this.name = 'ValidationError'
  }
}

export class ContractError extends AppError {
  public readonly contractAddress?: string
  public readonly functionName?: string

  constructor(
    message: string,
    contractAddress?: string,
    functionName?: string
  ) {
    super(message, 'CONTRACT_ERROR', 500)
    this.name = 'ContractError'
    this.contractAddress = contractAddress
    this.functionName = functionName
  }
}

export class TransactionError extends AppError {
  public readonly transactionHash?: string
  public readonly gasUsed?: string

  constructor(
    message: string,
    transactionHash?: string,
    gasUsed?: string
  ) {
    super(message, 'TRANSACTION_ERROR', 500)
    this.name = 'TransactionError'
    this.transactionHash = transactionHash
    this.gasUsed = gasUsed
  }
}

/**
 * Error code mappings for client consumption
 */
export const ERROR_CODES = {
  // Validation errors
  VALIDATION_ERROR: 'invalid-argument',
  INVALID_ADDRESS: 'invalid-argument',
  INVALID_AMOUNT: 'invalid-argument',
  INVALID_DURATION: 'invalid-argument',
  INVALID_INTEREST_RATE: 'invalid-argument',
  
  // Authentication errors
  UNAUTHORIZED: 'unauthenticated',
  INSUFFICIENT_PERMISSIONS: 'permission-denied',
  
  // Contract errors
  CONTRACT_ERROR: 'internal',
  CONTRACT_NOT_FOUND: 'not-found',
  FUNCTION_NOT_FOUND: 'not-found',
  EXECUTION_REVERTED: 'internal',
  
  // Transaction errors
  TRANSACTION_ERROR: 'internal',
  TRANSACTION_FAILED: 'internal',
  TRANSACTION_REVERTED: 'internal',
  INSUFFICIENT_FUNDS: 'failed-precondition',
  GAS_ESTIMATION_FAILED: 'internal',
  NONCE_TOO_LOW: 'internal',
  UNDERPRICED_TRANSACTION: 'internal',
  
  // Network errors
  PROVIDER_ERROR: 'unavailable',
  NETWORK_ERROR: 'unavailable',
  RPC_ERROR: 'unavailable',
  
  // Configuration errors
  PRIVATE_KEY_NOT_CONFIGURED: 'internal',
  CONTRACT_ADDRESS_NOT_CONFIGURED: 'internal',
  PROVIDER_NOT_CONFIGURED: 'internal',
  
  // Data errors
  NOT_FOUND: 'not-found',
  ALREADY_EXISTS: 'already-exists',
  DATA_CORRUPTION: 'internal',
  
  // Generic errors
  INTERNAL_ERROR: 'internal',
  UNKNOWN_ERROR: 'unknown'
} as const

/**
 * Convert error code to Firebase Functions error code
 */
function getFirebaseErrorCode(appErrorCode: string): string {
  return ERROR_CODES[appErrorCode as keyof typeof ERROR_CODES] || 'unknown'
}

/**
 * Handle and format errors for client consumption
 */
export function handleError(error: unknown, functionName: string): any {
  logger.error(`${functionName}: Error occurred`, {
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof AppError && {
        code: error.code,
        statusCode: error.statusCode,
        isOperational: error.isOperational
      }),
      ...(error instanceof ContractError && {
        contractAddress: error.contractAddress,
        functionName: error.functionName
      }),
      ...(error instanceof TransactionError && {
        transactionHash: error.transactionHash,
        gasUsed: error.gasUsed
      })
    } : String(error)
  })

  // Handle known error types
  if (error instanceof HttpsError) {
    throw error
  }

  if (error instanceof AppError) {
    const firebaseCode = getFirebaseErrorCode(error.code)
    throw new HttpsError(firebaseCode as any, error.message, {
      code: error.code,
      original: error.message
    })
  }

  // Handle ethers.js errors
  if (error instanceof Error) {
    if (error.message.includes('insufficient funds')) {
      throw new HttpsError('failed-precondition', 'Insufficient funds for transaction')
    }

    if (error.message.includes('nonce too low')) {
      throw new HttpsError('internal', 'Transaction nonce error - please retry')
    }

    if (error.message.includes('execution reverted')) {
      throw new HttpsError('internal', 'Smart contract execution failed')
    }

    if (error.message.includes('network')) {
      throw new HttpsError('unavailable', 'Network connection error - please retry')
    }

    if (error.message.includes('timeout')) {
      throw new HttpsError('deadline-exceeded', 'Operation timed out - please retry')
    }
  }

  // Handle unknown errors
  const errorMessage = error instanceof Error ? error.message : String(error)
  logger.error(`${functionName}: Unhandled error`, { errorMessage })
  
  throw new HttpsError('internal', 'An unexpected error occurred. Please try again.')
}

/**
 * Log error with context
 */
export function logError(
  error: unknown,
  context: Record<string, any> = {},
  functionName?: string
): void {
  const logData = {
    ...context,
    ...(functionName && { function: functionName }),
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : String(error)
  }

  logger.error('Error logged', logData)
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  message: string,
  code: string = 'UNKNOWN_ERROR',
  details?: Record<string, any>
): any {
  return {
    success: false,
    error: {
      message,
      code,
      ...(details && { details })
    }
  }
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  functionName: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args)
    } catch (error) {
      return handleError(error, functionName)
    }
  }) as T
}

/**
 * Validate and throw validation error if invalid
 */
export function validateOrThrow(
  condition: boolean,
  message: string,
  field?: string
): void {
  if (!condition) {
    throw new ValidationError(message, field)
  }
}

/**
 * Check if error is operational (expected) or programming error
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isOperational
  }

  // Consider HttpsError as operational
  if (error instanceof HttpsError) {
    return true
  }

  return false
}