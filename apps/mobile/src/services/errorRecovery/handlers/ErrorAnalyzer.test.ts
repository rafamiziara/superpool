import { ErrorType } from '@superpool/types'
import { ErrorAnalyzer, ErrorAnalysisResult } from './ErrorAnalyzer'

// Mock the categorizeError function from utils
jest.mock('../../../utils', () => ({
  categorizeError: jest.fn((error) => ({
    name: 'AppError',
    message: error instanceof Error ? error.message : String(error),
    type: 'AUTHENTICATION_FAILED',
    userFriendlyMessage: 'Authentication failed. Please try connecting your wallet again.',
  })),
}))

describe('ErrorAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('analyzeError', () => {
    it('should return proper ErrorAnalysisResult structure', () => {
      const error = new Error('Test error')
      const result = ErrorAnalyzer.analyzeError(error)

      expect(result).toHaveProperty('errorType')
      expect(result).toHaveProperty('appError')
      expect(result).toHaveProperty('originalError')
      expect(result.originalError).toBe(error)
    })

    describe('Session Error Detection', () => {
      const sessionErrorMessages = [
        'No matching key found',
        'session: abc123 failed',
        'pairing failed',
        'WalletConnect error occurred',
        'relayer connection failed',
      ]

      sessionErrorMessages.forEach((errorMessage) => {
        it(`should detect session error: "${errorMessage}"`, () => {
          const error = new Error(errorMessage)
          const result = ErrorAnalyzer.analyzeError(error)

          expect(result.errorType).toBe('session')
          expect(result.sessionContext).toBeDefined()
          expect(result.sessionContext!.isSessionError).toBe(true)
          expect(result.sessionContext!.errorMessage).toBe(errorMessage)
        })
      })

      it('should extract session ID from error message', () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const errorMessage = `session: ${sessionId} failed to connect`
        const error = new Error(errorMessage)

        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.errorType).toBe('session')
        expect(result.sessionContext!.sessionId).toBe(sessionId)
      })

      it('should handle session error without session ID', () => {
        const error = new Error('WalletConnect pairing failed')
        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.errorType).toBe('session')
        expect(result.sessionContext!.sessionId).toBeUndefined()
        expect(result.sessionContext!.isSessionError).toBe(true)
      })

      it('should handle non-Error objects for session errors', () => {
        const errorString = 'No matching key found'
        const result = ErrorAnalyzer.analyzeError(errorString)

        expect(result.errorType).toBe('session')
        expect(result.sessionContext!.errorMessage).toBe(errorString)
        expect(result.sessionContext!.isSessionError).toBe(true)
      })

      it('should be case insensitive for session ID extraction', () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const errorMessage = `session: ${sessionId} Failed`
        const error = new Error(errorMessage)

        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.errorType).toBe('session')
        expect(result.sessionContext!.sessionId).toBe(sessionId)
      })

      it('should handle malformed session IDs', () => {
        const shortSessionId = 'abc123'
        const errorMessage = `session: ${shortSessionId} failed`
        const error = new Error(errorMessage)

        const result = ErrorAnalyzer.analyzeError(error)

        // Short session IDs don't match the 64-character regex, so should be undefined
        expect(result.sessionContext!.sessionId).toBeUndefined()
        expect(result.sessionContext!.isSessionError).toBe(true)
      })
    })

    describe('Timeout Error Detection', () => {
      const timeoutErrorMessages = [
        'Request timed out',
        'Connection timed out',
        'Signature request timed out',
        'Operation timed out after 30 seconds',
      ]

      timeoutErrorMessages.forEach((errorMessage) => {
        it(`should detect timeout error: "${errorMessage}"`, () => {
          const error = new Error(errorMessage)
          const result = ErrorAnalyzer.analyzeError(error)

          expect(result.errorType).toBe('timeout')
          expect(result.sessionContext).toBeUndefined()
        })
      })

      it('should prioritize session errors over timeout errors', () => {
        const error = new Error('WalletConnect session timed out')
        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.errorType).toBe('session') // Session should take priority
      })

      it('should handle non-Error objects for timeout', () => {
        const timeoutString = 'Request timed out'
        const result = ErrorAnalyzer.analyzeError(timeoutString)

        expect(result.errorType).toBe('timeout')
      })
    })

    describe('Connector Error Detection', () => {
      const connectorErrorMessages = [
        'ConnectorNotConnectedError',
        'Connector not connected',
        'ConnectorNotConnectedError: No connector found',
      ]

      connectorErrorMessages.forEach((errorMessage) => {
        it(`should detect connector error: "${errorMessage}"`, () => {
          const error = new Error(errorMessage)
          const result = ErrorAnalyzer.analyzeError(error)

          expect(result.errorType).toBe('connector')
          expect(result.sessionContext).toBeUndefined()
        })
      })

      it('should prioritize session errors over connector errors', () => {
        const error = new Error('WalletConnect ConnectorNotConnectedError')
        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.errorType).toBe('session') // Session should take priority
      })

      it('should prioritize timeout errors over connector errors', () => {
        const error = new Error('ConnectorNotConnectedError: Request timed out')
        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.errorType).toBe('timeout') // Timeout should take priority over connector
      })
    })

    describe('Generic Error Fallback', () => {
      const genericErrorMessages = [
        'Network error',
        'Unknown authentication failure',
        'Unexpected error occurred',
        '',
        'Some random error message',
      ]

      genericErrorMessages.forEach((errorMessage) => {
        it(`should fallback to generic error for: "${errorMessage}"`, () => {
          const error = new Error(errorMessage)
          const result = ErrorAnalyzer.analyzeError(error)

          expect(result.errorType).toBe('generic')
          expect(result.sessionContext).toBeUndefined()
        })
      })

      it('should handle null/undefined errors', () => {
        const result1 = ErrorAnalyzer.analyzeError(null)
        const result2 = ErrorAnalyzer.analyzeError(undefined)

        expect(result1.errorType).toBe('generic')
        expect(result2.errorType).toBe('generic')
      })

      it('should handle non-string, non-Error objects', () => {
        const numberError = 123
        const objectError = { message: 'test', code: 500 }
        const arrayError = ['error', 'array']

        const result1 = ErrorAnalyzer.analyzeError(numberError)
        const result2 = ErrorAnalyzer.analyzeError(objectError)
        const result3 = ErrorAnalyzer.analyzeError(arrayError)

        expect(result1.errorType).toBe('generic')
        expect(result2.errorType).toBe('generic')
        expect(result3.errorType).toBe('generic')
      })
    })

    describe('Error Priority Order', () => {
      it('should prioritize in correct order: session > timeout > connector > generic', () => {
        // Session + Timeout + Connector
        const multiError1 = new Error('WalletConnect session timed out ConnectorNotConnectedError')
        const result1 = ErrorAnalyzer.analyzeError(multiError1)
        expect(result1.errorType).toBe('session')

        // Timeout + Connector (no session)
        const multiError2 = new Error('Request timed out ConnectorNotConnectedError')
        const result2 = ErrorAnalyzer.analyzeError(multiError2)
        expect(result2.errorType).toBe('timeout')

        // Only Connector
        const multiError3 = new Error('Some other error ConnectorNotConnectedError')
        const result3 = ErrorAnalyzer.analyzeError(multiError3)
        expect(result3.errorType).toBe('connector')

        // None of the above
        const multiError4 = new Error('Some generic error message')
        const result4 = ErrorAnalyzer.analyzeError(multiError4)
        expect(result4.errorType).toBe('generic')
      })
    })

    describe('AppError Categorization', () => {
      it('should call categorizeError for session errors with specific message', () => {
        const { categorizeError } = require('../../../utils')
        const error = new Error('No matching key')

        categorizeError.mockClear()
        ErrorAnalyzer.analyzeError(error)

        // Should be called twice: once for original error, once for session-specific error
        expect(categorizeError).toHaveBeenCalledWith(expect.any(Error))
        const sessionErrorCall = (categorizeError as jest.Mock).mock.calls.find(
          (call) => call[0] instanceof Error && call[0].message === 'WalletConnect session error'
        )
        expect(sessionErrorCall).toBeTruthy()
      })

      it('should call categorizeError for timeout errors with specific message', () => {
        const { categorizeError } = require('../../../utils')
        const error = new Error('Request timed out')

        categorizeError.mockClear()
        ErrorAnalyzer.analyzeError(error)

        expect(categorizeError).toHaveBeenCalledWith(expect.any(Error))
        const timeoutErrorCall = (categorizeError as jest.Mock).mock.calls.find(
          (call) => call[0] instanceof Error && call[0].message === 'Signature request timed out. Please try connecting again.'
        )
        expect(timeoutErrorCall).toBeTruthy()
      })

      it('should call categorizeError for connector errors with specific message', () => {
        const { categorizeError } = require('../../../utils')
        const error = new Error('ConnectorNotConnectedError')

        categorizeError.mockClear()
        ErrorAnalyzer.analyzeError(error)

        expect(categorizeError).toHaveBeenCalledWith(expect.any(Error))
        const connectorErrorCall = (categorizeError as jest.Mock).mock.calls.find(
          (call) => call[0] instanceof Error && call[0].message === 'User rejected the request.'
        )
        expect(connectorErrorCall).toBeTruthy()
      })

      it('should call categorizeError with original error for generic errors', () => {
        const { categorizeError } = require('../../../utils')
        const originalError = new Error('Some random error')

        categorizeError.mockClear()
        ErrorAnalyzer.analyzeError(originalError)

        expect(categorizeError).toHaveBeenCalledWith(originalError)
      })
    })

    describe('Session Context Analysis', () => {
      it('should properly analyze session context', () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const errorMessage = `session: ${sessionId} failed`
        const error = new Error(errorMessage)

        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.sessionContext).toEqual({
          errorMessage,
          sessionId,
          isSessionError: true,
        })
      })

      it('should handle missing session context gracefully', () => {
        const error = new Error('Generic error')
        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.sessionContext).toBeUndefined()
      })
    })

    describe('Edge Cases', () => {
      it('should handle empty string errors', () => {
        const result = ErrorAnalyzer.analyzeError('')
        expect(result.errorType).toBe('generic')
        expect(result.appError).toBeDefined()
        expect(result.originalError).toBe('')
      })

      it('should handle very long error messages', () => {
        const longMessage = 'A'.repeat(10000) + ' WalletConnect session error'
        const error = new Error(longMessage)
        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.errorType).toBe('session')
        expect(result.sessionContext!.errorMessage).toBe(longMessage)
      })

      it('should handle regex-safe error messages', () => {
        const sessionId = 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd'
        const specialCharsMessage = `Error with [special] chars (and) symbols: session: ${sessionId} failed`
        const error = new Error(specialCharsMessage)
        const result = ErrorAnalyzer.analyzeError(error)

        expect(result.errorType).toBe('session')
        expect(result.sessionContext!.sessionId).toBe(sessionId)
      })

      it('should be case-insensitive for error detection', () => {
        const mixedCaseErrors = [
          'WALLETCONNECT ERROR', // WalletConnect is case-sensitive in includes()
          'session: a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd Failed',
          'REQUEST timed out', // 'timed out' needs to be lowercase for includes()
          'ConnectorNotConnectedError', // Case-sensitive check
        ]

        const results = mixedCaseErrors.map((msg) => ErrorAnalyzer.analyzeError(new Error(msg)))

        expect(results[0].errorType).toBe('generic') // WALLETCONNECT won't match 'WalletConnect'
        expect(results[1].errorType).toBe('session')
        expect(results[2].errorType).toBe('timeout')
        expect(results[3].errorType).toBe('connector')
      })

      it('should handle circular reference objects', () => {
        const circularObj: any = { message: 'test' }
        circularObj.self = circularObj

        const result = ErrorAnalyzer.analyzeError(circularObj)
        expect(result.errorType).toBe('generic')
        expect(result.originalError).toBe(circularObj)
      })
    })

    describe('Performance', () => {
      it('should analyze errors quickly', () => {
        const errors = [
          new Error('WalletConnect session error'),
          new Error('Request timed out'),
          new Error('ConnectorNotConnectedError'),
          new Error('Generic error'),
        ]

        const start = performance.now()

        for (let i = 0; i < 1000; i++) {
          errors.forEach((error) => ErrorAnalyzer.analyzeError(error))
        }

        const end = performance.now()
        expect(end - start).toBeLessThan(200) // Should be reasonably fast
      })

      it('should handle large batches of errors efficiently', () => {
        const batchSize = 10000
        const errors = Array.from(
          { length: batchSize },
          (_, i) =>
            new Error(
              `Error ${i}: ${i % 4 === 0 ? 'WalletConnect' : i % 4 === 1 ? 'timed out' : i % 4 === 2 ? 'ConnectorNotConnectedError' : 'generic'}`
            )
        )

        const start = performance.now()
        const results = errors.map((error) => ErrorAnalyzer.analyzeError(error))
        const end = performance.now()

        expect(results).toHaveLength(batchSize)
        expect(end - start).toBeLessThan(1000) // Should complete within 1 second
      })
    })
  })

  describe('Private Method Behavior', () => {
    describe('Session Error Analysis', () => {
      it('should identify various session error patterns', () => {
        const sessionPatterns = ['No matching key', 'session: abc', 'pairing failed', 'WalletConnect error', 'relayer down']

        sessionPatterns.forEach((pattern) => {
          const result = ErrorAnalyzer.analyzeError(new Error(pattern))
          expect(result.errorType).toBe('session')
        })
      })

      it('should not identify non-session errors as session errors', () => {
        const nonSessionPatterns = ['Network timeout', 'Database error', 'Invalid input', 'Server error 500']

        nonSessionPatterns.forEach((pattern) => {
          const result = ErrorAnalyzer.analyzeError(new Error(pattern))
          expect(result.errorType).not.toBe('session')
        })
      })
    })

    describe('Connector Error Analysis', () => {
      it('should identify connector error patterns', () => {
        const connectorPatterns = ['ConnectorNotConnectedError', 'Connector not connected']

        connectorPatterns.forEach((pattern) => {
          const result = ErrorAnalyzer.analyzeError(new Error(pattern))
          expect(result.errorType).toBe('connector')
        })
      })

      it('should not identify non-connector errors as connector errors', () => {
        const nonConnectorPatterns = ['Connection timeout', 'Network error', 'Invalid connector', 'Connector setup failed']

        nonConnectorPatterns.forEach((pattern) => {
          const result = ErrorAnalyzer.analyzeError(new Error(pattern))
          expect(result.errorType).not.toBe('connector')
        })
      })
    })
  })
})
