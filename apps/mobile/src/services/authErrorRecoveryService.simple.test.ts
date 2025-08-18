// Simple unit tests for AuthErrorRecoveryService logic without complex dependencies
import { createAppError, ErrorType } from '../utils/errorHandling'

// Copy the core logic we want to test without the dependencies
class AuthErrorRecoveryServiceTest {
  static analyzeSessionError(error: unknown): {
    errorMessage: string
    sessionId?: string
    isSessionError: boolean
  } {
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

  static handleConnectorError(errorMessage: string): {
    shouldDisconnect: boolean
    shouldShowError: boolean
    errorDelay: number
    cleanupPerformed: boolean
  } {
    if (errorMessage.includes('ConnectorNotConnectedError') || errorMessage.includes('Connector not connected')) {
      return {
        shouldDisconnect: false,
        shouldShowError: true,
        errorDelay: 1500,
        cleanupPerformed: false,
      }
    }

    return {
      shouldDisconnect: false,
      shouldShowError: false,
      errorDelay: 0,
      cleanupPerformed: false,
    }
  }

  static handleGenericError(
    error: unknown,
    isConnected: boolean
  ): {
    shouldDisconnect: boolean
    shouldShowError: boolean
    errorDelay: number
    cleanupPerformed: boolean
  } {
    // Use the same categorization logic
    const appError = this.categorizeError(error)
    const isUserInitiated = this.isUserInitiatedError(appError)

    const shouldDisconnect = !isUserInitiated && isConnected
    const errorDelay = shouldDisconnect ? 2000 : isUserInitiated ? 1500 : 0

    return {
      shouldDisconnect,
      shouldShowError: true,
      errorDelay,
      cleanupPerformed: false,
    }
  }

  private static categorizeError(error: unknown) {
    if (error && typeof error === 'object' && 'type' in error) {
      return error as { type: string; userFriendlyMessage: string }
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    const lowerMessage = errorMessage.toLowerCase()

    if (lowerMessage.includes('user rejected') || lowerMessage.includes('user denied')) {
      return createAppError(ErrorType.SIGNATURE_REJECTED, errorMessage, error)
    }

    return createAppError(ErrorType.UNKNOWN_ERROR, errorMessage, error)
  }

  private static isUserInitiatedError(error: { type: string }): boolean {
    return error.type === ErrorType.SIGNATURE_REJECTED
  }
}

describe('AuthErrorRecoveryService Core Logic', () => {
  describe('analyzeSessionError', () => {
    it('should detect session errors', () => {
      const sessionError = new Error('No matching key for session: abc123')
      const result = AuthErrorRecoveryServiceTest.analyzeSessionError(sessionError)

      expect(result.isSessionError).toBe(true)
      expect(result.errorMessage).toContain('No matching key')
    })

    it('should extract session ID from error message', () => {
      const sessionError = new Error('session: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
      const result = AuthErrorRecoveryServiceTest.analyzeSessionError(sessionError)

      expect(result.sessionId).toBe('1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
    })

    it('should handle non-session errors', () => {
      const regularError = new Error('User rejected the request')
      const result = AuthErrorRecoveryServiceTest.analyzeSessionError(regularError)

      expect(result.isSessionError).toBe(false)
      expect(result.sessionId).toBeUndefined()
    })

    it('should handle string errors', () => {
      const result = AuthErrorRecoveryServiceTest.analyzeSessionError('WalletConnect pairing failed')

      expect(result.isSessionError).toBe(true)
      expect(result.errorMessage).toBe('WalletConnect pairing failed')
    })

    it('should detect various session error patterns', () => {
      const patterns = ['No matching key', 'session: abc123', 'pairing failed', 'WalletConnect error', 'relayer connection failed']

      patterns.forEach((pattern) => {
        const result = AuthErrorRecoveryServiceTest.analyzeSessionError(new Error(pattern))
        expect(result.isSessionError).toBe(true)
      })
    })
  })

  describe('handleConnectorError', () => {
    it('should handle connector not connected errors', () => {
      const result = AuthErrorRecoveryServiceTest.handleConnectorError('ConnectorNotConnectedError: Connector not connected')

      expect(result.shouldDisconnect).toBe(false)
      expect(result.shouldShowError).toBe(true)
      expect(result.errorDelay).toBe(1500)
    })

    it('should handle connector variations', () => {
      const patterns = ['ConnectorNotConnectedError', 'Connector not connected']

      patterns.forEach((pattern) => {
        const result = AuthErrorRecoveryServiceTest.handleConnectorError(pattern)
        expect(result.shouldDisconnect).toBe(false)
        expect(result.shouldShowError).toBe(true)
      })
    })

    it('should not handle non-connector errors', () => {
      const result = AuthErrorRecoveryServiceTest.handleConnectorError('Network error')

      expect(result.shouldDisconnect).toBe(false)
      expect(result.shouldShowError).toBe(false)
    })
  })

  describe('handleGenericError', () => {
    it('should disconnect wallet on technical failures', () => {
      const technicalError = new Error('Network failed')

      const result = AuthErrorRecoveryServiceTest.handleGenericError(technicalError, true)

      expect(result.shouldDisconnect).toBe(true)
      expect(result.shouldShowError).toBe(true)
      expect(result.errorDelay).toBe(2000)
    })

    it('should not disconnect on user-initiated errors', () => {
      const userError = new Error('User rejected the request')

      const result = AuthErrorRecoveryServiceTest.handleGenericError(userError, true)

      expect(result.shouldDisconnect).toBe(false)
      expect(result.shouldShowError).toBe(true)
      expect(result.errorDelay).toBe(1500)
    })

    it('should handle disconnected wallet state', () => {
      const technicalError = new Error('Network failed')

      const result = AuthErrorRecoveryServiceTest.handleGenericError(technicalError, false)

      expect(result.shouldDisconnect).toBe(false) // Already disconnected
      expect(result.shouldShowError).toBe(true)
    })

    it('should properly categorize different error types', () => {
      const errors = [
        { error: new Error('User rejected the request'), expectUserInitiated: true },
        { error: new Error('User denied transaction'), expectUserInitiated: true },
        { error: new Error('Network timeout'), expectUserInitiated: false },
        { error: new Error('Server error'), expectUserInitiated: false },
      ]

      errors.forEach(({ error, expectUserInitiated }) => {
        const result = AuthErrorRecoveryServiceTest.handleGenericError(error, true)

        if (expectUserInitiated) {
          expect(result.shouldDisconnect).toBe(false)
          expect(result.errorDelay).toBe(1500)
        } else {
          expect(result.shouldDisconnect).toBe(true)
          expect(result.errorDelay).toBe(2000)
        }
      })
    })
  })
})
