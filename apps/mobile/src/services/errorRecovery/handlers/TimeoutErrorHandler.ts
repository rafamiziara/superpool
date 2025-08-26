import { ErrorRecoveryResult } from '@superpool/types'
import type { ErrorHandler } from './ErrorHandler'
import { RecoveryActions } from './ErrorHandler'

/**
 * Handles signature request timeout errors
 * Disconnects wallet and schedules appropriate error feedback
 */
export class TimeoutErrorHandler implements ErrorHandler<void> {
  private disconnectFunction: (() => void) | null

  constructor(disconnectFunction: (() => void) | null) {
    this.disconnectFunction = disconnectFunction
  }

  getHandlerName(): string {
    return 'timeout-error'
  }

  handle(): ErrorRecoveryResult {
    if (!this.disconnectFunction) {
      console.error('❌ Cannot handle timeout error: disconnect function not available')
      return RecoveryActions.serviceUnavailable()
    }

    console.log('⏰ Signature request timed out')

    // Disconnect wallet on timeout
    this.disconnectFunction()

    // Return result with longer delay to show error after disconnect toast
    return RecoveryActions.technicalFailure(2000)
  }
}