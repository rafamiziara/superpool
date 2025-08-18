import { signOut } from 'firebase/auth'
import { FIREBASE_AUTH } from '../firebase.config'
import { AppError, categorizeError, isUserInitiatedError } from '../utils/errorHandling'
import { SessionManager } from '../utils/sessionManager'
import { authToasts, showErrorFromAppError } from '../utils/toast'

export interface ErrorRecoveryResult {
  shouldDisconnect: boolean
  shouldShowError: boolean
  errorDelay: number
  cleanupPerformed: boolean
}

export interface SessionErrorContext {
  errorMessage: string
  sessionId?: string
  isSessionError: boolean
}

export class AuthErrorRecoveryService {
  /**
   * Analyzes error and determines if it's a WalletConnect session error
   */
  static analyzeSessionError(error: unknown): SessionErrorContext {
    const errorMessage = error instanceof Error ? error.message : String(error)

    const isSessionError =
      errorMessage.includes('No matching key') ||
      errorMessage.includes('session:') ||
      errorMessage.includes('pairing') ||
      errorMessage.includes('WalletConnect') ||
      errorMessage.includes('relayer')

    // Extract session ID from error message if present
    const sessionIdMatch = errorMessage.match(/session:\s*([a-f0-9]{64})/i)
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : undefined

    return {
      errorMessage,
      sessionId,
      isSessionError,
    }
  }

  /**
   * Handles WalletConnect session errors with comprehensive cleanup
   */
  static async handleSessionError(sessionContext: SessionErrorContext, disconnect: () => void): Promise<ErrorRecoveryResult> {
    console.log('🚨 Detected WalletConnect session error:', sessionContext.errorMessage)

    let cleanupSuccessful = false

    try {
      if (sessionContext.sessionId) {
        console.log(`🎯 Attempting to clear specific session: ${sessionContext.sessionId}`)
        await SessionManager.clearSessionByErrorId(sessionContext.sessionId)
      }

      // Always perform comprehensive cleanup for session errors
      console.log('🧹 Performing comprehensive session cleanup...')
      await SessionManager.forceResetAllConnections()
      cleanupSuccessful = true
    } catch (sessionError) {
      console.error('❌ Session cleanup failed, attempting fallback cleanup:', sessionError)

      // Fallback: Try preventive cleanup as last resort
      try {
        console.log('🔄 Attempting preventive session cleanup as fallback...')
        await SessionManager.preventiveSessionCleanup()
        cleanupSuccessful = true
      } catch (fallbackError) {
        console.error('❌ Fallback session cleanup also failed:', fallbackError)
      }
    }

    // Always disconnect after session error handling
    console.log('🔌 Disconnecting wallet after session error handling...')
    disconnect()

    // Show specific error message for session issues
    setTimeout(() => {
      authToasts.sessionError()
    }, 1500)

    if (!cleanupSuccessful) {
      console.warn('⚠️ Session cleanup incomplete - some orphaned sessions may remain')
    }

    return {
      shouldDisconnect: true,
      shouldShowError: false, // We already showed session-specific error
      errorDelay: 0,
      cleanupPerformed: cleanupSuccessful,
    }
  }

  /**
   * Handles timeout errors with wallet disconnection
   */
  static handleTimeoutError(error: AppError, disconnect: () => void): ErrorRecoveryResult {
    console.log('⏰ Signature request timed out')

    // Disconnect wallet on timeout
    disconnect()

    return {
      shouldDisconnect: true,
      shouldShowError: true,
      errorDelay: 2000, // Show after disconnect toast
      cleanupPerformed: false,
    }
  }

  /**
   * Handles connector not connected errors (treat as user cancellation)
   */
  static handleConnectorError(errorMessage: string): ErrorRecoveryResult {
    if (errorMessage.includes('ConnectorNotConnectedError') || errorMessage.includes('Connector not connected')) {
      console.log('📱 Wallet disconnected during signing, treating as user cancellation')

      return {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1500,
        cleanupPerformed: false,
      }
    }

    // Not a connector error, let other handlers deal with it
    return {
      shouldDisconnect: false,
      shouldShowError: false,
      errorDelay: 0,
      cleanupPerformed: false,
    }
  }

  /**
   * Handles generic authentication errors with appropriate disconnect logic
   */
  static handleGenericError(error: unknown, isConnected: boolean): ErrorRecoveryResult {
    const appError = categorizeError(error)
    const isUserInitiated = isUserInitiatedError(appError)

    console.log('Authentication error details:', {
      errorType: appError.type,
      isUserInitiated,
      message: appError.userFriendlyMessage,
      originalError: appError.originalError,
    })

    // Disconnect wallet on technical failures
    const shouldDisconnect = !isUserInitiated && isConnected

    // Different timing based on whether wallet was disconnected
    const errorDelay = shouldDisconnect
      ? 2000 // For technical failures that cause disconnect, show error after disconnect toast
      : isUserInitiated
        ? 1500
        : 0 // For user cancellations, brief delay; immediate for other errors

    console.log(
      shouldDisconnect
        ? 'Scheduling error toast after disconnect (2s delay)'
        : `Scheduling error toast for non-disconnect scenario (${errorDelay}ms delay)`
    )

    return {
      shouldDisconnect,
      shouldShowError: true,
      errorDelay,
      cleanupPerformed: false,
    }
  }

  /**
   * Comprehensive error handling for authentication failures
   */
  static async handleAuthenticationError(
    error: unknown,
    isConnected: boolean,
    disconnect: () => void
  ): Promise<{ appError: AppError; recoveryResult: ErrorRecoveryResult }> {
    console.error('Authentication failed:', error)

    // Step 1: Analyze if this is a session error
    const sessionContext = this.analyzeSessionError(error)

    if (sessionContext.isSessionError) {
      const recoveryResult = await this.handleSessionError(sessionContext, disconnect)
      // For session errors, we create a generic app error since we handle display differently
      const appError = categorizeError(new Error('WalletConnect session error'))
      return { appError, recoveryResult }
    }

    // Step 2: Check for timeout errors
    const errorMessage = sessionContext.errorMessage
    if (errorMessage.includes('timed out')) {
      const appError = categorizeError(new Error('Signature request timed out. Please try connecting again.'))
      const recoveryResult = this.handleTimeoutError(appError, disconnect)
      return { appError, recoveryResult }
    }

    // Step 3: Check for connector errors
    const connectorResult = this.handleConnectorError(errorMessage)
    if (connectorResult.shouldShowError && !connectorResult.shouldDisconnect) {
      // This is a connector error treated as user cancellation
      const appError = categorizeError(new Error('User rejected the request.'))
      return { appError, recoveryResult: connectorResult }
    }

    // Step 4: Handle as generic error
    const appError = categorizeError(error)
    const recoveryResult = this.handleGenericError(error, isConnected)

    // Perform disconnect if needed
    if (recoveryResult.shouldDisconnect) {
      console.log('Disconnecting wallet due to authentication failure')
      try {
        disconnect()
      } catch (disconnectError) {
        console.warn('Failed to disconnect wallet:', disconnectError)
      }
    }

    return { appError, recoveryResult }
  }

  /**
   * Shows error feedback with appropriate timing
   */
  static showErrorFeedback(appError: AppError, recoveryResult: ErrorRecoveryResult): void {
    if (!recoveryResult.shouldShowError) {
      return
    }

    const showError = () => {
      const scenario = recoveryResult.shouldDisconnect ? 'disconnect' : 'non-disconnect'
      console.log(`Showing error toast for ${scenario} scenario:`, appError.userFriendlyMessage)
      showErrorFromAppError(appError)
    }

    if (recoveryResult.errorDelay > 0) {
      setTimeout(showError, recoveryResult.errorDelay)
    } else {
      showError()
    }
  }

  /**
   * Handles Firebase authentication cleanup on state changes
   */
  static async handleFirebaseCleanup(reason: string): Promise<void> {
    try {
      await signOut(FIREBASE_AUTH)
      console.log(`🚪 Signed out from Firebase due to ${reason}`)
    } catch (signOutError) {
      console.error('❌ Failed to sign out from Firebase:', signOutError)
    }
  }
}
