import { ErrorRecoveryResult } from '@superpool/types'

/**
 * Base interface for all error handlers
 * Defines the contract for handling specific error types
 */
export interface ErrorHandler<TContext = unknown> {
  /**
   * Handles the error and returns recovery instructions
   */
  handle(context: TContext): Promise<ErrorRecoveryResult> | ErrorRecoveryResult

  /**
   * Gets the handler name for logging purposes
   */
  getHandlerName(): string
}

/**
 * Common recovery actions that can be shared across handlers
 */
export class RecoveryActions {
  /**
   * Creates a standard recovery result
   */
  static createResult(
    shouldDisconnect: boolean,
    shouldShowError: boolean,
    errorDelay: number = 0,
    cleanupPerformed: boolean = false
  ): ErrorRecoveryResult {
    return {
      shouldDisconnect,
      shouldShowError,
      errorDelay,
      cleanupPerformed,
    }
  }

  /**
   * Standard recovery result for user-initiated actions (cancellations, rejections)
   */
  static userInitiated(errorDelay: number = 1500): ErrorRecoveryResult {
    return this.createResult(false, true, errorDelay, false)
  }

  /**
   * Standard recovery result for technical failures requiring disconnect
   */
  static technicalFailure(errorDelay: number = 2000): ErrorRecoveryResult {
    return this.createResult(true, true, errorDelay, false)
  }

  /**
   * Standard recovery result for session errors with cleanup
   */
  static sessionError(cleanupPerformed: boolean): ErrorRecoveryResult {
    return this.createResult(true, false, 1500, cleanupPerformed)
  }

  /**
   * Standard recovery result when services are not available
   */
  static serviceUnavailable(): ErrorRecoveryResult {
    return this.createResult(false, true, 1500, false)
  }
}