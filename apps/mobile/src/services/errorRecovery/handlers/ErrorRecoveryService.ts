import { ErrorRecoveryResult } from '@superpool/types'
import { AuthenticationStore } from '../../../stores/AuthenticationStore'
import { WalletStore } from '../../../stores/WalletStore'
import { AppError } from '../../../utils'
import { ConnectorErrorHandler } from './ConnectorErrorHandler'
import { ErrorAnalyzer } from './ErrorAnalyzer'
import { FeedbackManager } from './FeedbackManager'
import { FirebaseCleanupManager } from './FirebaseCleanupManager'
import { GenericErrorHandler } from './GenericErrorHandler'
import { SessionErrorHandler } from './SessionErrorHandler'
import { TimeoutErrorHandler } from './TimeoutErrorHandler'

/**
 * Main error recovery service that coordinates error handling strategies
 * Uses strategy pattern with specialized handlers for different error types
 */
export class ErrorRecoveryService {
  // Store references for reactive state management
  private static authStore?: AuthenticationStore
  private static walletStore?: WalletStore

  /**
   * Initialize the service with MobX stores
   * Call this once during app initialization
   */
  static initialize(authStore: AuthenticationStore, walletStore: WalletStore): void {
    this.authStore = authStore
    this.walletStore = walletStore
    console.log('🔧 ErrorRecoveryService initialized with MobX stores')
  }

  /**
   * Get the disconnect function from the wallet store
   */
  private static getDisconnectFunction(): (() => void) | null {
    if (!this.walletStore) {
      console.warn('⚠️ WalletStore not initialized in ErrorRecoveryService')
      return null
    }
    return () => {
      console.log('🔌 Disconnecting wallet via MobX store...')
      this.walletStore?.disconnect()
    }
  }

  /**
   * Comprehensive error handling for authentication failures
   * Routes errors to appropriate specialized handlers
   */
  static async handleAuthenticationError(error: unknown): Promise<{ appError: AppError; recoveryResult: ErrorRecoveryResult }> {
    console.error('🚨 Authentication failed:', error)

    // Analyze error to determine appropriate handler
    const analysisResult = ErrorAnalyzer.analyzeError(error)
    console.log(`🔍 Error classified as: ${analysisResult.errorType}`)

    const disconnectFunction = this.getDisconnectFunction()
    let recoveryResult: ErrorRecoveryResult

    try {
      // Route to appropriate handler based on error type
      switch (analysisResult.errorType) {
        case 'session':
          if (!analysisResult.sessionContext) {
            throw new Error('Session context missing for session error')
          }
          const sessionHandler = new SessionErrorHandler(disconnectFunction)
          recoveryResult = await sessionHandler.handle(analysisResult.sessionContext)
          FeedbackManager.logRecoveryResult(sessionHandler.getHandlerName(), recoveryResult)
          break

        case 'timeout':
          const timeoutHandler = new TimeoutErrorHandler(disconnectFunction)
          recoveryResult = timeoutHandler.handle()
          FeedbackManager.logRecoveryResult(timeoutHandler.getHandlerName(), recoveryResult)
          break

        case 'connector':
          const connectorHandler = new ConnectorErrorHandler()
          recoveryResult = connectorHandler.handle()
          FeedbackManager.logRecoveryResult(connectorHandler.getHandlerName(), recoveryResult)
          break

        case 'generic':
        default:
          const genericHandler = new GenericErrorHandler(disconnectFunction)
          const isConnected = this.walletStore?.isConnected ?? false
          recoveryResult = genericHandler.handle({
            appError: analysisResult.appError,
            isConnected,
            originalError: analysisResult.originalError,
          })
          FeedbackManager.logRecoveryResult(genericHandler.getHandlerName(), recoveryResult)
          break
      }
    } catch (handlerError) {
      console.error('❌ Error handler failed:', handlerError)
      // Fallback to generic error response
      recoveryResult = {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1500,
        cleanupPerformed: false,
      }
    }

    return {
      appError: analysisResult.appError,
      recoveryResult,
    }
  }

  /**
   * Shows error feedback with appropriate timing
   * Delegates to FeedbackManager for consistent display logic
   */
  static showErrorFeedback(appError: AppError, recoveryResult: ErrorRecoveryResult): void {
    FeedbackManager.showErrorFeedback(appError, recoveryResult)
  }

  /**
   * Handles Firebase authentication cleanup on state changes
   * Delegates to FirebaseCleanupManager for separation of concerns
   */
  static async handleFirebaseCleanup(reason: string): Promise<void> {
    return await FirebaseCleanupManager.handleFirebaseCleanup(reason)
  }

  /**
   * Gets current authentication status for debugging
   */
  static getServiceStatus() {
    return {
      initialized: !!(this.authStore && this.walletStore),
      isAuthenticating: this.authStore?.isAuthenticating ?? false,
      isConnected: this.walletStore?.isConnected ?? false,
      firebaseUser: FirebaseCleanupManager.getCurrentUserId(),
    }
  }
}
