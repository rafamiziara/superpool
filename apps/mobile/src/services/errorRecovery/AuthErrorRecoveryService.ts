import { AuthenticationStore } from '../../stores/AuthenticationStore'
import { WalletStore } from '../../stores/WalletStore'
import { AppError } from '../../utils'
import { ErrorRecoveryResult, ErrorRecoveryService, SessionErrorContext } from './handlers'

// Re-export interfaces and types for backward compatibility
export type { ErrorRecoveryResult, SessionErrorContext }

/**
 * Legacy AuthErrorRecoveryService for backward compatibility
 * All functionality has been refactored into specialized error recovery modules
 * This maintains the same API while delegating to the new architecture
 */
export class AuthErrorRecoveryService {
  /**
   * Initialize the service with MobX stores
   * Delegates to the new ErrorRecoveryService
   */
  static initialize(authStore: AuthenticationStore, walletStore: WalletStore): void {
    ErrorRecoveryService.initialize(authStore, walletStore)
    console.log('🔧 AuthErrorRecoveryService (legacy) initialized - delegating to ErrorRecoveryService')
  }

  /**
   * Comprehensive error handling for authentication failures
   * Delegates to the new ErrorRecoveryService
   */
  static async handleAuthenticationError(error: unknown): Promise<{ appError: AppError; recoveryResult: ErrorRecoveryResult }> {
    return await ErrorRecoveryService.handleAuthenticationError(error)
  }

  /**
   * Shows error feedback with appropriate timing
   * Delegates to the new ErrorRecoveryService
   */
  static showErrorFeedback(appError: AppError, recoveryResult: ErrorRecoveryResult): void {
    ErrorRecoveryService.showErrorFeedback(appError, recoveryResult)
  }

  /**
   * Handles Firebase authentication cleanup on state changes
   * Delegates to the new ErrorRecoveryService
   */
  static async handleFirebaseCleanup(reason: string): Promise<void> {
    return await ErrorRecoveryService.handleFirebaseCleanup(reason)
  }
}
