import { ErrorRecoveryResult } from '@superpool/types'
import type { ErrorHandler } from './ErrorHandler'
import { RecoveryActions } from './ErrorHandler'

/**
 * Handles connector-related errors (typically treated as user cancellation)
 * These occur when the wallet disconnects during signing operations
 */
export class ConnectorErrorHandler implements ErrorHandler<string> {
  getHandlerName(): string {
    return 'connector-error'
  }

  handle(errorMessage: string): ErrorRecoveryResult {
    console.log('📱 Wallet disconnected during signing, treating as user cancellation')

    // Connector errors are treated as user-initiated actions
    // No wallet disconnect needed since wallet is already disconnected
    return RecoveryActions.userInitiated(1500)
  }
}