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

    // Disconnect wallet on timeout - handle both sync and async disconnect functions
    try {
      const disconnectResult = this.disconnectFunction()
      
      // If disconnect function returns a Promise, catch any rejections
      if (disconnectResult && typeof disconnectResult.catch === 'function') {
        disconnectResult.catch(() => {
          // Silently handle disconnect failures - timeout handling should continue
        })
      }
    } catch (error) {
      // Silently handle synchronous disconnect failures - timeout handling should continue
    }

    // Return result with longer delay to show error after disconnect toast
    return RecoveryActions.technicalFailure(2000)
  }
}
