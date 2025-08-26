import { AppError, categorizeError } from '../../../utils'
import { ErrorType, SessionErrorContext } from '@superpool/types'

/**
 * Result of error analysis with routing information
 */
export interface ErrorAnalysisResult {
  errorType: ErrorType
  appError: AppError
  sessionContext?: SessionErrorContext
  originalError: unknown
}

/**
 * Analyzes authentication errors to determine appropriate handling strategy
 * Centralizes error classification logic for consistent routing
 */
export class ErrorAnalyzer {
  /**
   * Analyzes an error and returns classification with routing information
   */
  static analyzeError(error: unknown): ErrorAnalysisResult {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const appError = categorizeError(error)

    // Check for session errors first (most specific)
    const sessionContext = this.analyzeSessionError(error)
    if (sessionContext.isSessionError) {
      return {
        errorType: 'session',
        appError: categorizeError(new Error('WalletConnect session error')),
        sessionContext,
        originalError: error,
      }
    }

    // Check for timeout errors
    if (errorMessage.includes('timed out')) {
      return {
        errorType: 'timeout',
        appError: categorizeError(new Error('Signature request timed out. Please try connecting again.')),
        originalError: error,
      }
    }

    // Check for connector errors
    if (this.isConnectorError(errorMessage)) {
      return {
        errorType: 'connector',
        appError: categorizeError(new Error('User rejected the request.')),
        originalError: error,
      }
    }

    // Default to generic error
    return {
      errorType: 'generic',
      appError,
      originalError: error,
    }
  }

  /**
   * Analyzes error to determine if it's a WalletConnect session error
   */
  private static analyzeSessionError(error: unknown): SessionErrorContext {
    const errorMessage = error instanceof Error ? error.message : String(error)

    const isSessionError =
      errorMessage.includes('No matching key') ||
      errorMessage.includes('session:') ||
      errorMessage.includes('pairing') ||
      errorMessage.includes('WalletConnect') ||
      errorMessage.includes('relayer')

    // Extract session ID from error message if present
    const sessionIdMatch = errorMessage.match(/session:\\s*([a-f0-9]{64})/i)
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : undefined

    return {
      errorMessage,
      sessionId,
      isSessionError,
    }
  }

  /**
   * Checks if error is a connector-related error (treated as user cancellation)
   */
  private static isConnectorError(errorMessage: string): boolean {
    return (
      errorMessage.includes('ConnectorNotConnectedError') ||
      errorMessage.includes('Connector not connected')
    )
  }
}