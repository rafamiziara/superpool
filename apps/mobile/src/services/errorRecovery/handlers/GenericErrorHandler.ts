import { AppError, isUserInitiatedError } from '../../../utils/errorHandling'
import { ErrorRecoveryResult } from '@superpool/types'
import type { ErrorHandler } from './ErrorHandler'
import { RecoveryActions } from './ErrorHandler'

/**
 * Context for generic error handling
 */
export interface GenericErrorContext {
  appError: AppError
  isConnected: boolean
  originalError: unknown
}

/**
 * Handles generic authentication errors with appropriate disconnect logic
 * Differentiates between user-initiated and technical failures
 */
export class GenericErrorHandler implements ErrorHandler<GenericErrorContext> {
  private disconnectFunction: (() => void) | null

  constructor(disconnectFunction: (() => void) | null) {
    this.disconnectFunction = disconnectFunction
  }

  getHandlerName(): string {
    return 'generic-error'
  }

  handle(context: GenericErrorContext): ErrorRecoveryResult {
    const { appError, isConnected, originalError } = context
    const isUserInitiated = isUserInitiatedError(appError)

    console.log('Authentication error details:', {
      errorType: appError.type,
      isUserInitiated,
      message: appError.userFriendlyMessage,
      originalError: appError.originalError,
    })

    // Disconnect wallet on technical failures (but not user cancellations)
    const shouldDisconnect = !isUserInitiated && isConnected

    if (shouldDisconnect && this.disconnectFunction) {
      console.log('Disconnecting wallet due to authentication failure')
      try {
        this.disconnectFunction()
      } catch (disconnectError) {
        console.warn('Failed to disconnect wallet:', disconnectError)
      }
    }

    // Calculate appropriate error delay based on error type and disconnect action
    const errorDelay = this.calculateErrorDelay(shouldDisconnect, isUserInitiated)

    console.log(
      shouldDisconnect
        ? 'Scheduling error toast after disconnect (2s delay)'
        : `Scheduling error toast for non-disconnect scenario (${errorDelay}ms delay)`
    )

    return RecoveryActions.createResult(shouldDisconnect, true, errorDelay, false)
  }

  /**
   * Calculates appropriate error display delay based on context
   */
  private calculateErrorDelay(shouldDisconnect: boolean, isUserInitiated: boolean): number {
    if (shouldDisconnect) {
      return 2000 // Show error after disconnect toast
    }
    
    if (isUserInitiated) {
      return 1500 // Brief delay for user cancellations
    }
    
    return 0 // Immediate for other errors
  }
}