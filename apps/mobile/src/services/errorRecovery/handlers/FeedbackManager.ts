import { ErrorRecoveryResult } from '@superpool/types'
import { AppError, showErrorFromAppError } from '../../../utils'

/**
 * Manages error feedback display with appropriate timing
 * Centralizes error display logic and timing coordination
 */
export class FeedbackManager {
  /**
   * Shows error feedback with timing based on recovery context
   */
  static showErrorFeedback(appError: AppError, recoveryResult: ErrorRecoveryResult): void {
    if (!recoveryResult.shouldShowError) {
      console.log('Skipping error feedback - recovery result indicates no display needed')
      return
    }

    const showError = () => {
      const scenario = recoveryResult.shouldDisconnect ? 'disconnect' : 'non-disconnect'
      console.log(`Showing error toast for ${scenario} scenario:`, appError.userFriendlyMessage)
      showErrorFromAppError(appError)
    }

    if (recoveryResult.errorDelay > 0) {
      console.log(`Scheduling error feedback in ${recoveryResult.errorDelay}ms`)
      setTimeout(showError, recoveryResult.errorDelay)
    } else {
      console.log('Showing error feedback immediately')
      showError()
    }
  }

  /**
   * Logs recovery result details for debugging
   */
  static logRecoveryResult(handlerName: string, result: ErrorRecoveryResult): void {
    console.log(`🔄 Error recovery completed by ${handlerName}:`, {
      shouldDisconnect: result.shouldDisconnect,
      shouldShowError: result.shouldShowError,
      errorDelay: result.errorDelay,
      cleanupPerformed: result.cleanupPerformed,
    })
  }
}
