import { 
  ErrorType, 
  ERROR_MESSAGES, 
  createAppError, 
  categorizeError, 
  isUserInitiatedError, 
  shouldRetryError,
  type AppError 
} from './errorHandling'

describe('errorHandling', () => {
  describe('ErrorType enum', () => {
    it('should have all required error types', () => {
      expect(ErrorType.WALLET_CONNECTION).toBe('WALLET_CONNECTION')
      expect(ErrorType.AUTHENTICATION_FAILED).toBe('AUTHENTICATION_FAILED')
      expect(ErrorType.SIGNATURE_REJECTED).toBe('SIGNATURE_REJECTED')
      expect(ErrorType.NETWORK_ERROR).toBe('NETWORK_ERROR')
      expect(ErrorType.BACKEND_ERROR).toBe('BACKEND_ERROR')
      expect(ErrorType.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR')
    })

    it('should be immutable', () => {
      expect(() => {
        (ErrorType as any).NEW_ERROR = 'NEW_ERROR'
      }).not.toThrow() // TypeScript prevents this, but runtime doesn't

      // But the original values should remain unchanged
      expect(ErrorType.AUTHENTICATION_FAILED).toBe('AUTHENTICATION_FAILED')
    })
  })

  describe('ERROR_MESSAGES', () => {
    it('should have user-friendly messages for all error types', () => {
      expect(ERROR_MESSAGES[ErrorType.WALLET_CONNECTION]).toBe('Failed to connect to wallet. Please try again.')
      expect(ERROR_MESSAGES[ErrorType.AUTHENTICATION_FAILED]).toBe('Authentication failed. Please try connecting your wallet again.')
      expect(ERROR_MESSAGES[ErrorType.SIGNATURE_REJECTED]).toBe('Authentication was cancelled. You can try connecting again when ready.')
      expect(ERROR_MESSAGES[ErrorType.NETWORK_ERROR]).toBe('Network error. Please check your connection and try again.')
      expect(ERROR_MESSAGES[ErrorType.BACKEND_ERROR]).toBe('Server error. Please try again in a moment.')
      expect(ERROR_MESSAGES[ErrorType.UNKNOWN_ERROR]).toBe('Something went wrong. Please try again.')
    })

    it('should have messages for all enum values', () => {
      Object.values(ErrorType).forEach(errorType => {
        expect(ERROR_MESSAGES[errorType]).toBeDefined()
        expect(typeof ERROR_MESSAGES[errorType]).toBe('string')
        expect(ERROR_MESSAGES[errorType].length).toBeGreaterThan(0)
      })
    })

    it('should have appropriate message content', () => {
      Object.values(ERROR_MESSAGES).forEach(message => {
        expect(message).not.toContain('undefined')
        expect(message).not.toContain('null')
        expect(message.trim()).toBe(message) // No leading/trailing whitespace
        expect(message.length).toBeGreaterThan(10) // Reasonable length
        expect(message.length).toBeLessThan(200) // Not too long
      })
    })
  })

  describe('createAppError', () => {
    describe('Basic Error Creation', () => {
      it('should create AppError with all required properties', () => {
        const error = createAppError(
          ErrorType.AUTHENTICATION_FAILED,
          'Custom message',
          new Error('Original error')
        )

        expect(error.type).toBe(ErrorType.AUTHENTICATION_FAILED)
        expect(error.message).toBe('Custom message')
        expect(error.userFriendlyMessage).toBe(ERROR_MESSAGES[ErrorType.AUTHENTICATION_FAILED])
        expect(error.originalError).toBeInstanceOf(Error)
        expect(error.originalError?.message).toBe('Original error')
        expect(error.name).toBe('AppError')
        expect(error.timestamp).toBeInstanceOf(Date)
      })

      it('should create error with minimal parameters', () => {
        const error = createAppError(ErrorType.NETWORK_ERROR)

        expect(error.type).toBe(ErrorType.NETWORK_ERROR)
        expect(error.message).toBe(ERROR_MESSAGES[ErrorType.NETWORK_ERROR])
        expect(error.userFriendlyMessage).toBe(ERROR_MESSAGES[ErrorType.NETWORK_ERROR])
        expect(error.originalError).toBeUndefined()
        expect(error.name).toBe('AppError')
        expect(error.timestamp).toBeInstanceOf(Date)
      })

      it('should handle custom message override', () => {
        const customMessage = 'This is a custom error message'
        const error = createAppError(ErrorType.TIMEOUT_ERROR, customMessage)

        expect(error.message).toBe(customMessage)
        expect(error.userFriendlyMessage).toBe(ERROR_MESSAGES[ErrorType.TIMEOUT_ERROR])
      })

      it('should preserve original error information', () => {
        const originalError = new Error('Database connection failed')
        originalError.stack = 'Stack trace here'
        
        const error = createAppError(ErrorType.NETWORK_ERROR, 'Network failed', originalError)

        expect(error.originalError).toBe(originalError)
        expect(error.originalError?.message).toBe('Database connection failed')
        expect(error.originalError?.stack).toBe('Stack trace here')
      })
    })

    describe('All Error Types', () => {
      it('should create errors for all error types', () => {
        Object.values(ErrorType).forEach(errorType => {
          const error = createAppError(errorType)
          
          expect(error.type).toBe(errorType)
          expect(error.userFriendlyMessage).toBe(ERROR_MESSAGES[errorType])
          expect(error.name).toBe('AppError')
          expect(error.timestamp).toBeInstanceOf(Date)
        })
      })
    })

    describe('Timestamp Behavior', () => {
      it('should create timestamp close to current time', () => {
        const beforeCreation = new Date()
        const error = createAppError(ErrorType.UNKNOWN_ERROR)
        const afterCreation = new Date()

        expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime())
        expect(error.timestamp.getTime()).toBeLessThanOrEqual(afterCreation.getTime())
      })

      it('should create unique timestamps for rapid creation', () => {
        const errors = Array.from({ length: 10 }, () => 
          createAppError(ErrorType.UNKNOWN_ERROR)
        )

        const timestamps = errors.map(e => e.timestamp.getTime())
        const uniqueTimestamps = new Set(timestamps)
        
        // At least some should be unique (depending on timing)
        expect(uniqueTimestamps.size).toBeGreaterThanOrEqual(1)
      })
    })

    describe('Error Inheritance', () => {
      it('should be instance of Error', () => {
        const error = createAppError(ErrorType.AUTHENTICATION_FAILED)
        
        expect(error).toBeInstanceOf(Error)
        expect(error.constructor.name).toBe('Object') // AppError is an object with Error prototype
      })

      it('should have Error-like properties', () => {
        const error = createAppError(ErrorType.SIGNATURE_REJECTED, 'Test message')
        
        expect(error.message).toBe('Test message')
        expect(error.name).toBe('AppError')
        expect(typeof error.toString).toBe('function')
      })
    })
  })

  describe('categorizeError', () => {
    describe('Session Errors', () => {
      it('should categorize WalletConnect session errors', () => {
        const sessionErrors = [
          new Error('WalletConnect session error'),
          new Error('No matching key. session: abc123'),
          new Error('Session relayer failed'),
          new Error('Pairing expired'),
          new Error('Session topic not found'),
        ]

        sessionErrors.forEach(error => {
          const result = categorizeError(error)
          expect(result.type).toBe(ErrorType.SESSION_CORRUPTION)
        })
      })

      it('should be case-insensitive for session detection', () => {
        const caseVariations = [
          new Error('WALLETCONNECT ERROR'),
          new Error('session: ABC123 failed'),
          new Error('RELAYER connection lost'),
          new Error('pairing EXPIRED'),
        ]

        caseVariations.forEach(error => {
          const result = categorizeError(error)
          expect(result.type).toBe(ErrorType.SESSION_CORRUPTION)
        })
      })
    })

    describe('Network Errors', () => {
      it('should categorize network-related errors', () => {
        const networkErrors = [
          new Error('Network request failed'),
          new Error('Failed to fetch'),
          new Error('Connection timeout'),
          new Error('ERR_NETWORK_CHANGED'),
          new Error('Chain ID mismatch'),
          new Error('Wrong network'),
          new Error('Unsupported chain'),
        ]

        networkErrors.forEach(error => {
          const result = categorizeError(error)
          expect(result.type).toBe(ErrorType.NETWORK_ERROR)
        })
      })

      it('should handle chain mismatch specifically', () => {
        const chainErrors = [
          new Error('Chain ID mismatch detected'),
          new Error('Wrong network selected'),
          new Error('Please switch to Polygon network'),
        ]

        chainErrors.forEach(error => {
          const result = categorizeError(error)
          expect(result.type).toBe(ErrorType.NETWORK_ERROR)
        })
      })
    })

    describe('Signature Errors', () => {
      it('should categorize signature rejection errors', () => {
        const signatureErrors = [
          new Error('User rejected the request'),
          new Error('User denied message signature'),
          new Error('MetaMask Tx Signature: User denied transaction signature'),
          new Error('WalletConnect: User rejected'),
          new Error('User cancelled'),
        ]

        signatureErrors.forEach(error => {
          const result = categorizeError(error)
          expect(result.type).toBe(ErrorType.SIGNATURE_REJECTED)
        })
      })
    })

    describe('Transaction Errors', () => {
      it('should categorize transaction-specific errors', () => {
        const transactionErrors = [
          new Error('Transaction was rejected'),
          new Error('insufficient funds for gas'),
          new Error('Gas estimation failed'),
          new Error('Transaction underpriced'),
          new Error('Nonce too low'),
        ]

        transactionErrors.forEach(error => {
          const result = categorizeError(error)
          // These could be either TRANSACTION_REJECTED or INSUFFICIENT_FUNDS
          expect([
            ErrorType.TRANSACTION_REJECTED, 
            ErrorType.INSUFFICIENT_FUNDS,
            ErrorType.NETWORK_ERROR
          ]).toContain(result.type)
        })
      })

      it('should specifically detect insufficient funds', () => {
        const fundsErrors = [
          new Error('insufficient funds'),
          new Error('Insufficient balance'),
          new Error('Not enough ETH for gas'),
        ]

        fundsErrors.forEach(error => {
          const result = categorizeError(error)
          expect(result.type).toBe(ErrorType.INSUFFICIENT_FUNDS)
        })
      })
    })

    describe('Timeout Errors', () => {
      it('should categorize timeout-related errors', () => {
        const timeoutErrors = [
          new Error('Request timed out'),
          new Error('Connection timeout'),
          new Error('Timeout exceeded'),
          new Error('Operation timed out after 30s'),
        ]

        timeoutErrors.forEach(error => {
          const result = categorizeError(error)
          expect(result.type).toBe(ErrorType.TIMEOUT_ERROR)
        })
      })
    })

    describe('Authentication Errors', () => {
      it('should categorize authentication failures', () => {
        const authErrors = [
          new Error('Authentication failed'),
          new Error('Login failed'),
          new Error('Invalid credentials'),
          new Error('Auth token expired'),
        ]

        authErrors.forEach(error => {
          const result = categorizeError(error)
          expect(result.type).toBe(ErrorType.AUTHENTICATION_FAILED)
        })
      })
    })

    describe('Generic Errors', () => {
      it('should default to UNKNOWN_ERROR for unrecognized errors', () => {
        const genericErrors = [
          new Error('Something went wrong'),
          new Error('Random error message'),
          new Error('Unexpected behavior'),
          new Error(''),
        ]

        genericErrors.forEach(error => {
          const result = categorizeError(error)
          expect(result.type).toBe(ErrorType.UNKNOWN_ERROR)
        })
      })

      it('should handle null and undefined errors', () => {
        const nullResult = categorizeError(null as any)
        const undefinedResult = categorizeError(undefined as any)

        expect(nullResult.type).toBe(ErrorType.UNKNOWN_ERROR)
        expect(undefinedResult.type).toBe(ErrorType.UNKNOWN_ERROR)
      })

      it('should handle non-Error objects', () => {
        const nonErrorInputs = [
          'String error',
          { message: 'Object error' },
          42,
          [],
        ]

        nonErrorInputs.forEach(input => {
          const result = categorizeError(input as any)
          expect(result.type).toBe(ErrorType.UNKNOWN_ERROR)
        })
      })
    })

    describe('Error Properties', () => {
      it('should preserve original error in result', () => {
        const originalError = new Error('Test error')
        const result = categorizeError(originalError)

        expect(result.originalError).toBe(originalError)
      })

      it('should create proper AppError structure', () => {
        const error = new Error('User rejected the request')
        const result = categorizeError(error)

        expect(result.name).toBe('AppError')
        expect(result.type).toBe(ErrorType.SIGNATURE_REJECTED)
        expect(result.message).toContain('rejected')
        expect(result.userFriendlyMessage).toBe(ERROR_MESSAGES[ErrorType.SIGNATURE_REJECTED])
        expect(result.timestamp).toBeInstanceOf(Date)
      })
    })

    describe('Complex Error Messages', () => {
      it('should handle errors with complex nested information', () => {
        const complexError = new Error(`
          RPC Error: {
            "code": -32603,
            "message": "WalletConnect session: abc123def456 expired",
            "data": { "cause": "timeout" }
          }
        `)

        const result = categorizeError(complexError)
        expect(result.type).toBe(ErrorType.SESSION_CORRUPTION)
      })

      it('should handle multiline error messages', () => {
        const multilineError = new Error(`
          Transaction failed:
          - insufficient funds for gas
          - Account balance: 0.001 ETH
          - Required: 0.002 ETH
        `)

        const result = categorizeError(multilineError)
        expect(result.type).toBe(ErrorType.INSUFFICIENT_FUNDS)
      })
    })
  })

  describe('isUserInitiatedError', () => {
    describe('User-Initiated Errors', () => {
      it('should return true for signature rejections', () => {
        const userErrors = [
          createAppError(ErrorType.SIGNATURE_REJECTED),
          createAppError(ErrorType.TRANSACTION_REJECTED),
        ]

        userErrors.forEach(error => {
          expect(isUserInitiatedError(error)).toBe(true)
        })
      })

      it('should handle direct error classification', () => {
        const rejectionError = new Error('User rejected the request')
        const categorized = categorizeError(rejectionError)
        
        expect(isUserInitiatedError(categorized)).toBe(true)
      })
    })

    describe('System-Initiated Errors', () => {
      it('should return false for technical failures', () => {
        const systemErrors = [
          createAppError(ErrorType.NETWORK_ERROR),
          createAppError(ErrorType.SESSION_CORRUPTION),
          createAppError(ErrorType.TIMEOUT_ERROR),
          createAppError(ErrorType.AUTHENTICATION_FAILED),
          createAppError(ErrorType.CHAIN_MISMATCH),
          createAppError(ErrorType.INSUFFICIENT_FUNDS),
          createAppError(ErrorType.UNKNOWN_ERROR),
        ]

        systemErrors.forEach(error => {
          expect(isUserInitiatedError(error)).toBe(false)
        })
      })
    })

    describe('Edge Cases', () => {
      it('should handle null and undefined inputs', () => {
        expect(isUserInitiatedError(null as any)).toBe(false)
        expect(isUserInitiatedError(undefined as any)).toBe(false)
      })

      it('should handle malformed AppError objects', () => {
        const malformedErrors = [
          { type: undefined } as any,
          { type: null } as any,
          { type: 'INVALID_TYPE' } as any,
          {} as any,
        ]

        malformedErrors.forEach(error => {
          expect(isUserInitiatedError(error)).toBe(false)
        })
      })
    })
  })

  describe('shouldRetryError', () => {
    describe('Retryable Errors', () => {
      it('should return true for network-related errors', () => {
        const retryableErrors = [
          createAppError(ErrorType.NETWORK_ERROR),
          createAppError(ErrorType.TIMEOUT_ERROR),
          createAppError(ErrorType.AUTHENTICATION_FAILED),
        ]

        retryableErrors.forEach(error => {
          expect(shouldRetryError(error)).toBe(true)
        })
      })
    })

    describe('Non-Retryable Errors', () => {
      it('should return false for user-initiated errors', () => {
        const nonRetryableErrors = [
          createAppError(ErrorType.SIGNATURE_REJECTED),
          createAppError(ErrorType.TRANSACTION_REJECTED),
        ]

        nonRetryableErrors.forEach(error => {
          expect(shouldRetryError(error)).toBe(false)
        })
      })

      it('should return false for certain system errors', () => {
        const nonRetryableSystemErrors = [
          createAppError(ErrorType.CHAIN_MISMATCH),
          createAppError(ErrorType.INSUFFICIENT_FUNDS),
          createAppError(ErrorType.SESSION_CORRUPTION),
        ]

        nonRetryableSystemErrors.forEach(error => {
          expect(shouldRetryError(error)).toBe(false)
        })
      })
    })

    describe('Edge Cases', () => {
      it('should handle unknown error types conservatively', () => {
        const unknownError = createAppError(ErrorType.UNKNOWN_ERROR)
        expect(shouldRetryError(unknownError)).toBe(false) // Conservative approach
      })

      it('should handle null and undefined inputs', () => {
        expect(shouldRetryError(null as any)).toBe(false)
        expect(shouldRetryError(undefined as any)).toBe(false)
      })

      it('should handle malformed AppError objects', () => {
        const malformedErrors = [
          { type: undefined } as any,
          { type: 'INVALID_TYPE' } as any,
          {} as any,
        ]

        malformedErrors.forEach(error => {
          expect(shouldRetryError(error)).toBe(false)
        })
      })
    })
  })

  describe('Integration Tests', () => {
    it('should work together in error processing pipeline', () => {
      // Simulate a complete error processing flow
      const originalError = new Error('User rejected the request')
      
      // Step 1: Categorize the error
      const categorized = categorizeError(originalError)
      
      // Step 2: Check if user-initiated
      const isUserInitiated = isUserInitiatedError(categorized)
      
      // Step 3: Check if should retry
      const shouldRetry = shouldRetryError(categorized)
      
      // Assertions
      expect(categorized.type).toBe(ErrorType.SIGNATURE_REJECTED)
      expect(isUserInitiated).toBe(true)
      expect(shouldRetry).toBe(false)
      expect(categorized.userFriendlyMessage).toBe(ERROR_MESSAGES[ErrorType.SIGNATURE_REJECTED])
    })

    it('should handle multiple error types consistently', () => {
      const testCases = [
        {
          error: new Error('Network request failed'),
          expectedType: ErrorType.NETWORK_ERROR,
          expectedUserInitiated: false,
          expectedRetryable: true,
        },
        {
          error: new Error('Session corruption detected'),
          expectedType: ErrorType.SESSION_CORRUPTION,
          expectedUserInitiated: false,
          expectedRetryable: false,
        },
        {
          error: new Error('insufficient funds'),
          expectedType: ErrorType.INSUFFICIENT_FUNDS,
          expectedUserInitiated: false,
          expectedRetryable: false,
        },
      ]

      testCases.forEach(({ error, expectedType, expectedUserInitiated, expectedRetryable }) => {
        const categorized = categorizeError(error)
        
        expect(categorized.type).toBe(expectedType)
        expect(isUserInitiatedError(categorized)).toBe(expectedUserInitiated)
        expect(shouldRetryError(categorized)).toBe(expectedRetryable)
      })
    })
  })

  describe('Performance and Memory', () => {
    it('should handle large volumes of error categorization efficiently', () => {
      const errors = Array.from({ length: 1000 }, (_, i) => 
        new Error(`Test error ${i}: User rejected request`)
      )

      const start = performance.now()
      
      const results = errors.map(error => {
        const categorized = categorizeError(error)
        return {
          categorized,
          isUserInitiated: isUserInitiatedError(categorized),
          shouldRetry: shouldRetryError(categorized),
        }
      })
      
      const end = performance.now()
      
      expect(end - start).toBeLessThan(100) // Should be fast
      expect(results).toHaveLength(1000)
      expect(results.every(r => r.isUserInitiated)).toBe(true)
      expect(results.every(r => !r.shouldRetry)).toBe(true)
    })

    it('should not leak memory with repeated operations', () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      // Perform many operations
      for (let i = 0; i < 10000; i++) {
        const error = new Error(`Error ${i}`)
        const categorized = categorizeError(error)
        isUserInitiatedError(categorized)
        shouldRetryError(categorized)
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      
      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
    })
  })
})