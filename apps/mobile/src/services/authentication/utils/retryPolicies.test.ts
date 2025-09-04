import { ErrorCategorizer, ErrorCategory, RetryExecutor, RetryPolicies, RetryPolicy } from './retryPolicies'

describe('RetryPolicies', () => {
  describe('getPolicyForWallet', () => {
    it('should return Safe wallet policy for safe-wallet signature type', () => {
      const policy = RetryPolicies.getPolicyForWallet('safe-wallet')

      expect(policy.name).toBe('safe-wallet')
      expect(policy.maxRetries).toBe(2)
      expect(policy.retryDelayMs).toBe(2000)
      expect(policy.backoffMultiplier).toBe(1.5)
    })

    it('should return standard policy for regular wallet', () => {
      const policy = RetryPolicies.getPolicyForWallet('personal-sign')

      expect(policy.name).toBe('standard-wallet')
      expect(policy.maxRetries).toBe(3)
      expect(policy.retryDelayMs).toBe(1000)
      expect(policy.backoffMultiplier).toBe(2.0)
    })

    it('should return fail-fast policy for first attempts', () => {
      const policy = RetryPolicies.getPolicyForWallet('personal-sign', {
        isFirstAttempt: true,
      })

      expect(policy.name).toBe('fail-fast')
      expect(policy.maxRetries).toBe(1)
      expect(policy.retryDelayMs).toBe(500)
    })
  })

  describe('getPolicyForError', () => {
    it('should return network policy for network errors', () => {
      const networkError = new Error('network connection failed')
      const policy = RetryPolicies.getPolicyForError(networkError)

      expect(policy.name).toBe('network-focused')
      expect(policy.maxRetries).toBe(4)
    })

    it('should return rate-limit policy for rate limiting errors', () => {
      const rateLimitError = new Error('rate limit exceeded')
      const policy = RetryPolicies.getPolicyForError(rateLimitError)

      expect(policy.name).toBe('rate-limit-policy')
      expect(policy.retryDelayMs).toBe(5000) // Longer delay for rate limits
    })

    it('should return standard policy for unknown errors', () => {
      const unknownError = new Error('unknown error')
      const policy = RetryPolicies.getPolicyForError(unknownError)

      expect(policy.name).toBe('standard-wallet')
    })
  })
})

describe('ErrorCategorizer', () => {
  describe('categorizeError', () => {
    it('should categorize fatal authentication errors', () => {
      const fatalErrors = [
        new Error('invalid-token'),
        new Error('expired-token'),
        new Error('invalid-credential'),
        new Error('user-disabled'),
        new Error('permission-denied'),
      ]

      fatalErrors.forEach((error) => {
        expect(ErrorCategorizer.categorizeError(error)).toBe(ErrorCategory.FATAL)
      })
    })

    it('should categorize rate limiting errors', () => {
      const rateLimitError = new Error('rate limit exceeded')
      expect(ErrorCategorizer.categorizeError(rateLimitError)).toBe(ErrorCategory.RATE_LIMIT)
    })

    it('should categorize network errors', () => {
      const networkErrors = [new Error('network connection failed'), new Error('connection refused'), new Error('offline mode')]

      networkErrors.forEach((error) => {
        expect(ErrorCategorizer.categorizeError(error)).toBe(ErrorCategory.NETWORK)
      })
    })

    it('should categorize timeout errors', () => {
      const timeoutErrors = [new Error('timeout occurred'), new Error('request timeout'), new Error('operation timeout')]

      timeoutErrors.forEach((error) => {
        expect(ErrorCategorizer.categorizeError(error)).toBe(ErrorCategory.TIMEOUT)
      })
    })

    it('should categorize authentication errors', () => {
      const authErrors = [new Error('authentication failed'), new Error('signature invalid'), new Error('token expired')]

      authErrors.forEach((error) => {
        expect(ErrorCategorizer.categorizeError(error)).toBe(ErrorCategory.AUTHENTICATION)
      })
    })

    it('should default to recoverable for unknown errors', () => {
      const unknownError = new Error('unknown error type')
      expect(ErrorCategorizer.categorizeError(unknownError)).toBe(ErrorCategory.RECOVERABLE)
    })
  })

  describe('shouldRetry', () => {
    const testPolicy: RetryPolicy = {
      name: 'test-policy',
      maxRetries: 3,
      retryDelayMs: 1000,
      backoffMultiplier: 2,
      retryableErrors: ['network', 'timeout', 'internal'],
      fatalErrors: ['invalid-token', 'permission-denied'],
    }

    it('should not retry fatal errors', () => {
      const fatalError = new Error('invalid-token detected')
      expect(ErrorCategorizer.shouldRetry(fatalError, testPolicy)).toBe(false)
    })

    it('should retry recoverable errors', () => {
      const networkError = new Error('network connection failed')
      expect(ErrorCategorizer.shouldRetry(networkError, testPolicy)).toBe(true)
    })

    it('should retry timeout errors', () => {
      const timeoutError = new Error('timeout occurred')
      expect(ErrorCategorizer.shouldRetry(timeoutError, testPolicy)).toBe(true)
    })

    it('should retry internal errors', () => {
      const internalError = new Error('internal server error')
      expect(ErrorCategorizer.shouldRetry(internalError, testPolicy)).toBe(true)
    })

    it('should not retry permission errors', () => {
      const permissionError = new Error('permission-denied by server')
      expect(ErrorCategorizer.shouldRetry(permissionError, testPolicy)).toBe(false)
    })
  })

  describe('getUserFriendlyMessage', () => {
    it('should provide user-friendly messages for different error categories', () => {
      const testCases = [
        {
          error: new Error('invalid-token'),
          expectedMessage: 'Authentication failed. Please check your credentials and try again.',
        },
        {
          error: new Error('network connection failed'),
          expectedMessage: 'Network connection issue. Please check your internet connection and try again.',
        },
        {
          error: new Error('rate limit exceeded'),
          expectedMessage: 'Too many attempts. Please wait a moment and try again.',
        },
        {
          error: new Error('timeout occurred'),
          expectedMessage: 'Request timed out. Please try again.',
        },
        {
          error: new Error('authentication failed'),
          expectedMessage: 'Authentication error. Please try signing again.',
        },
        {
          error: new Error('unknown error'),
          expectedMessage: 'An unexpected error occurred. Please try again.',
        },
      ]

      testCases.forEach(({ error, expectedMessage }) => {
        expect(ErrorCategorizer.getUserFriendlyMessage(error)).toBe(expectedMessage)
      })
    })
  })
})

describe('RetryExecutor', () => {
  const testPolicy: RetryPolicy = {
    name: 'test-policy',
    maxRetries: 2,
    retryDelayMs: 100, // Short delay for tests
    backoffMultiplier: 2,
    retryableErrors: ['network', 'timeout'],
    fatalErrors: ['invalid-token'],
  }

  beforeEach(() => {
    jest.clearAllTimers()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success')

      const resultPromise = RetryExecutor.executeWithRetry(mockFn, testPolicy)
      jest.runAllTimers()
      const result = await resultPromise

      expect(result.success).toBe(true)
      expect(result.result).toBe('success')
      expect(result.attemptsMade).toBe(1)
      expect(result.policyUsed).toBe('test-policy')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should retry on retryable errors and eventually succeed', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('network connection failed'))
        .mockRejectedValueOnce(new Error('timeout occurred'))
        .mockResolvedValueOnce('success')

      const resultPromise = RetryExecutor.executeWithRetry(mockFn, testPolicy)
      jest.runAllTimers()
      const result = await resultPromise

      expect(result.success).toBe(true)
      expect(result.result).toBe('success')
      expect(result.attemptsMade).toBe(3)
      expect(mockFn).toHaveBeenCalledTimes(3)
    })

    it('should fail immediately on fatal errors', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('invalid-token detected'))

      const resultPromise = RetryExecutor.executeWithRetry(mockFn, testPolicy)
      jest.runAllTimers()
      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('invalid-token detected')
      expect(result.attemptsMade).toBe(1) // No retries for fatal errors
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should fail after exhausting all retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('network connection failed'))

      const resultPromise = RetryExecutor.executeWithRetry(mockFn, testPolicy)
      jest.runAllTimers()
      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('network connection failed')
      expect(result.attemptsMade).toBe(3) // Original + 2 retries
      expect(mockFn).toHaveBeenCalledTimes(3)
    })

    it('should call onRetry callback with correct context', async () => {
      const mockFn = jest.fn().mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce('success')

      const onRetrySpy = jest.fn()

      const resultPromise = RetryExecutor.executeWithRetry(mockFn, testPolicy, {
        onRetry: onRetrySpy,
      })

      // Advance timers for retry delay
      await jest.advanceTimersByTimeAsync(100)

      await resultPromise

      expect(onRetrySpy).toHaveBeenCalledTimes(1)
      expect(onRetrySpy).toHaveBeenCalledWith({
        attempt: 1,
        totalAttempts: 3, // maxRetries + 1
        lastError: expect.any(Error),
        elapsedTime: expect.any(Number),
      })
    })

    it('should respect abort signal', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('network error'))
      const abortController = new AbortController()

      // Abort immediately
      abortController.abort()

      const resultPromise = RetryExecutor.executeWithRetry(mockFn, testPolicy, {
        signal: abortController.signal,
      })

      await expect(resultPromise).rejects.toThrow('Operation aborted')
    })

    it('should implement exponential backoff correctly', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce('success')

      const resultPromise = RetryExecutor.executeWithRetry(mockFn, testPolicy)

      // Fast-forward through the delays using async timer execution
      await jest.runAllTimersAsync()

      const result = await resultPromise

      expect(result.success).toBe(true)
      expect(result.attemptsMade).toBe(3)
    })
  })
})
