import { SessionErrorContext, ErrorRecoveryResult } from '@superpool/types'
import { SessionManager, authToasts } from '../../../utils'
import type { ErrorHandler } from './ErrorHandler'
import { RecoveryActions } from './ErrorHandler'

/**
 * Handles WalletConnect session errors with comprehensive cleanup
 * Manages session cleanup, disconnection, and user feedback
 */
export class SessionErrorHandler implements ErrorHandler<SessionErrorContext> {
  private disconnectFunction: (() => void) | null

  constructor(disconnectFunction: (() => void) | null) {
    this.disconnectFunction = disconnectFunction
  }

  getHandlerName(): string {
    return 'session-error'
  }

  async handle(sessionContext: SessionErrorContext): Promise<ErrorRecoveryResult> {
    if (!this.disconnectFunction) {
      console.error('❌ Cannot handle session error: disconnect function not available')
      return RecoveryActions.serviceUnavailable()
    }

    console.log('🚨 Detected WalletConnect session error:', sessionContext.errorMessage)

    const cleanupPerformed = await this.performSessionCleanup(sessionContext)
    
    // Always disconnect after session error handling
    console.log('🔌 Disconnecting wallet after session error handling...')
    this.disconnectFunction()

    // Show session-specific error message
    this.showSessionErrorFeedback()

    if (!cleanupPerformed) {
      console.warn('⚠️ Session cleanup incomplete - some orphaned sessions may remain')
    }

    return RecoveryActions.sessionError(cleanupPerformed)
  }

  /**
   * Performs comprehensive session cleanup
   */
  private async performSessionCleanup(sessionContext: SessionErrorContext): Promise<boolean> {
    try {
      // Try to clear specific session if we have an ID
      if (sessionContext.sessionId) {
        console.log(`🎯 Attempting to clear specific session: ${sessionContext.sessionId}`)
        await SessionManager.clearSessionByErrorId(sessionContext.sessionId)
      }

      // Always perform comprehensive cleanup for session errors
      console.log('🧹 Performing comprehensive session cleanup...')
      await SessionManager.forceResetAllConnections()
      return true
    } catch (sessionError) {
      console.error('❌ Session cleanup failed, attempting fallback cleanup:', sessionError)
      return await this.performFallbackCleanup()
    }
  }

  /**
   * Attempts fallback cleanup if primary cleanup fails
   */
  private async performFallbackCleanup(): Promise<boolean> {
    try {
      console.log('🔄 Attempting preventive session cleanup as fallback...')
      await SessionManager.preventiveSessionCleanup()
      return true
    } catch (fallbackError) {
      console.error('❌ Fallback session cleanup also failed:', fallbackError)
      return false
    }
  }

  /**
   * Shows session-specific error feedback with appropriate timing
   */
  private showSessionErrorFeedback(): void {
    setTimeout(() => {
      authToasts.sessionError()
    }, 1500)
  }
}