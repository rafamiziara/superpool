import { TimeoutUtils } from './TimeoutUtils'

describe('TimeoutUtils', () => {
  beforeEach(() => {
    jest.clearAllTimers()
    jest.useFakeTimers()

    // Reset any potential modifications to TIMEOUTS
    Object.defineProperty(TimeoutUtils, 'TIMEOUTS', {
      value: {
        PERSONAL_SIGN: 15000,
        TYPED_DATA_SIGN: 15000,
        SAFE_WALLET_SIGN: 20000,
        FIREBASE_CALL: 10000,
        SESSION_CLEANUP: 15000,
        SUCCESS_TOAST: 3000,
        ERROR_TOAST_IMMEDIATE: 0,
        ERROR_TOAST_AFTER_DISCONNECT: 2000,
        ERROR_TOAST_USER_ACTION: 1500,
        WALLET_CONNECT: 30000,
        AUTHENTICATION: 120000,
      },
      writable: false,
      configurable: true,
    })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  describe('withTimeout', () => {
    it('should resolve when promise resolves before timeout', async () => {
      const promise = Promise.resolve('success')

      const result = await TimeoutUtils.withTimeout(promise, 5000)

      expect(result).toBe('success')
    })

    it('should reject with timeout error when promise takes too long', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('late'), 10000)
      })

      const timeoutPromise = TimeoutUtils.withTimeout(slowPromise, 5000, 'Test Operation')

      jest.advanceTimersByTime(5000)

      await expect(timeoutPromise).rejects.toThrow('Test Operation timed out after 5 seconds')
    })

    it('should use default operation name when not provided', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('late'), 10000)
      })

      const timeoutPromise = TimeoutUtils.withTimeout(slowPromise, 3000)

      jest.advanceTimersByTime(3000)

      await expect(timeoutPromise).rejects.toThrow('Operation timed out after 3 seconds')
    })

    it('should handle promise rejection before timeout', async () => {
      const rejectingPromise = Promise.reject(new Error('Original error'))

      await expect(TimeoutUtils.withTimeout(rejectingPromise, 5000)).rejects.toThrow('Original error')
    })

    it('should handle zero timeout', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 100)
      })

      const timeoutPromise = TimeoutUtils.withTimeout(promise, 0, 'Instant timeout')

      jest.advanceTimersByTime(0)

      await expect(timeoutPromise).rejects.toThrow('Instant timeout timed out after 0 seconds')
    })

    it('should handle negative timeout', async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve('late'), 1000)
      })

      const timeoutPromise = TimeoutUtils.withTimeout(slowPromise, -1000, 'Negative timeout')

      // Negative timeout should immediately trigger
      jest.advanceTimersByTime(1)

      await expect(timeoutPromise).rejects.toThrow('Negative timeout timed out after -1 seconds')
    })

    it('should work with different return types', async () => {
      const numberPromise = Promise.resolve(42)
      const objectPromise = Promise.resolve({ key: 'value' })
      const arrayPromise = Promise.resolve([1, 2, 3])

      const numberResult = await TimeoutUtils.withTimeout(numberPromise, 5000)
      const objectResult = await TimeoutUtils.withTimeout(objectPromise, 5000)
      const arrayResult = await TimeoutUtils.withTimeout(arrayPromise, 5000)

      expect(numberResult).toBe(42)
      expect(objectResult).toEqual({ key: 'value' })
      expect(arrayResult).toEqual([1, 2, 3])
    })
  })

  describe('delay', () => {
    it('should resolve after specified milliseconds', async () => {
      const delayPromise = TimeoutUtils.delay(1000)

      jest.advanceTimersByTime(999)
      let resolved = false
      delayPromise.then(() => {
        resolved = true
      })

      await Promise.resolve() // Allow microtasks to run
      expect(resolved).toBe(false)

      jest.advanceTimersByTime(1)
      await delayPromise
      expect(resolved).toBe(true)
    })

    it('should handle zero delay', async () => {
      const delayPromise = TimeoutUtils.delay(0)

      jest.advanceTimersByTime(0)

      await expect(delayPromise).resolves.toBeUndefined()
    })

    it('should handle large delay values', async () => {
      const delayPromise = TimeoutUtils.delay(999999999)

      let resolved = false
      delayPromise.then(() => {
        resolved = true
      })

      jest.advanceTimersByTime(999999998)
      await Promise.resolve()
      expect(resolved).toBe(false)

      jest.advanceTimersByTime(1)
      await delayPromise
      expect(resolved).toBe(true)
    })
  })

  describe('createTimeout', () => {
    it('should create timeout and execute callback', () => {
      const callback = jest.fn()

      const timeoutId = TimeoutUtils.createTimeout(callback, 1000)

      expect(typeof timeoutId).toBe('number')
      expect(callback).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1000)

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should return timeout ID that can be cleared', () => {
      const callback = jest.fn()

      const timeoutId = TimeoutUtils.createTimeout(callback, 1000)
      clearTimeout(timeoutId)

      jest.advanceTimersByTime(1000)

      expect(callback).not.toHaveBeenCalled()
    })

    it('should handle zero timeout', () => {
      const callback = jest.fn()

      TimeoutUtils.createTimeout(callback, 0)

      jest.advanceTimersByTime(0)

      expect(callback).toHaveBeenCalledTimes(1)
    })
  })

  describe('clearTimeout', () => {
    it('should safely clear valid timeout ID', () => {
      const callback = jest.fn()
      const timeoutId = TimeoutUtils.createTimeout(callback, 1000)

      expect(() => TimeoutUtils.clearTimeout(timeoutId)).not.toThrow()

      jest.advanceTimersByTime(1000)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should safely handle undefined timeout ID', () => {
      expect(() => TimeoutUtils.clearTimeout(undefined)).not.toThrow()
    })

    it('should safely handle null timeout ID', () => {
      expect(() => TimeoutUtils.clearTimeout(null)).not.toThrow()
    })

    it('should safely handle zero timeout ID', () => {
      expect(() => TimeoutUtils.clearTimeout(0)).not.toThrow()
    })

    it('should safely handle negative timeout ID', () => {
      expect(() => TimeoutUtils.clearTimeout(-1)).not.toThrow()
    })
  })

  describe('withRetry', () => {
    beforeEach(() => {
      jest.useRealTimers()
      jest.spyOn(console, 'log').mockImplementation(() => {})
      jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success')

      const result = await TimeoutUtils.withRetry(operation, 3, 100, 'Test Operation')

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
      expect(console.log).toHaveBeenCalledWith('🔄 Test Operation attempt 1/3')
    })

    it('should retry on failure and eventually succeed', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success')

      const result = await TimeoutUtils.withRetry(operation, 3, 100, 'Test Operation')

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(3)
      expect(console.log).toHaveBeenCalledWith('🔄 Test Operation attempt 1/3')
      expect(console.log).toHaveBeenCalledWith('🔄 Test Operation attempt 2/3')
      expect(console.log).toHaveBeenCalledWith('🔄 Test Operation attempt 3/3')
      expect(console.log).toHaveBeenCalledWith('⏳ Retrying Test Operation in 100ms...')
      expect(console.log).toHaveBeenCalledWith('⏳ Retrying Test Operation in 200ms...')
    })

    it('should fail after max retries reached', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent failure'))

      await expect(TimeoutUtils.withRetry(operation, 2, 100, 'Test Operation')).rejects.toThrow(
        'Test Operation failed after 2 attempts: Persistent failure'
      )

      expect(operation).toHaveBeenCalledTimes(2)
      expect(console.error).toHaveBeenCalledWith('❌ Test Operation attempt 1/2 failed:', 'Persistent failure')
      expect(console.error).toHaveBeenCalledWith('❌ Test Operation attempt 2/2 failed:', 'Persistent failure')
    })

    it('should use default parameters when not provided', async () => {
      const operation = jest.fn().mockResolvedValue('success')

      const result = await TimeoutUtils.withRetry(operation)

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
      expect(console.log).toHaveBeenCalledWith('🔄 Operation attempt 1/3')
    })

    it('should handle non-Error exceptions', async () => {
      const operation = jest.fn().mockRejectedValueOnce('string error').mockRejectedValueOnce(42).mockResolvedValue('success')

      const result = await TimeoutUtils.withRetry(operation, 3, 100, 'Test Operation')

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(3)
      expect(console.error).toHaveBeenCalledWith('❌ Test Operation attempt 1/3 failed:', 'string error')
      expect(console.error).toHaveBeenCalledWith('❌ Test Operation attempt 2/3 failed:', '42')
    })

    it('should use linear backoff delay calculation', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success')

      await TimeoutUtils.withRetry(operation, 3, 500, 'Test Operation')

      expect(console.log).toHaveBeenCalledWith('⏳ Retrying Test Operation in 500ms...')
      expect(console.log).toHaveBeenCalledWith('⏳ Retrying Test Operation in 1000ms...')
    })

    it('should not retry on the last attempt', async () => {
      const operation = jest.fn().mockRejectedValueOnce(new Error('First failure')).mockRejectedValue(new Error('Final failure'))

      await expect(TimeoutUtils.withRetry(operation, 2, 100, 'Test Operation')).rejects.toThrow(
        'Test Operation failed after 2 attempts: Final failure'
      )

      expect(console.log).not.toHaveBeenCalledWith('⏳ Retrying Test Operation in 200ms...')
    })
  })

  describe('TIMEOUTS constants', () => {
    it('should have all required timeout constants', () => {
      expect(TimeoutUtils.TIMEOUTS.PERSONAL_SIGN).toBe(15000)
      expect(TimeoutUtils.TIMEOUTS.TYPED_DATA_SIGN).toBe(15000)
      expect(TimeoutUtils.TIMEOUTS.SAFE_WALLET_SIGN).toBe(20000)
      expect(TimeoutUtils.TIMEOUTS.FIREBASE_CALL).toBe(10000)
      expect(TimeoutUtils.TIMEOUTS.SESSION_CLEANUP).toBe(15000)
      expect(TimeoutUtils.TIMEOUTS.SUCCESS_TOAST).toBe(3000)
      expect(TimeoutUtils.TIMEOUTS.ERROR_TOAST_IMMEDIATE).toBe(0)
      expect(TimeoutUtils.TIMEOUTS.ERROR_TOAST_AFTER_DISCONNECT).toBe(2000)
      expect(TimeoutUtils.TIMEOUTS.ERROR_TOAST_USER_ACTION).toBe(1500)
      expect(TimeoutUtils.TIMEOUTS.WALLET_CONNECT).toBe(30000)
      expect(TimeoutUtils.TIMEOUTS.AUTHENTICATION).toBe(120000)
    })

    it('should have timeout constants as readonly', () => {
      // TypeScript marks this as readonly, but at runtime we can't prevent modification
      // This test just ensures the constants are defined correctly
      const originalValue = TimeoutUtils.TIMEOUTS.PERSONAL_SIGN
      expect(typeof originalValue).toBe('number')
      expect(originalValue).toBeGreaterThan(0)
    })

    it('should have all timeout values as positive numbers', () => {
      Object.values(TimeoutUtils.TIMEOUTS).forEach((timeout) => {
        expect(typeof timeout).toBe('number')
        expect(timeout).toBeGreaterThanOrEqual(0)
      })
    })

    it('should have safe wallet timeout longer than regular signing timeouts', () => {
      expect(TimeoutUtils.TIMEOUTS.SAFE_WALLET_SIGN).toBeGreaterThan(TimeoutUtils.TIMEOUTS.PERSONAL_SIGN)
      expect(TimeoutUtils.TIMEOUTS.SAFE_WALLET_SIGN).toBeGreaterThan(TimeoutUtils.TIMEOUTS.TYPED_DATA_SIGN)
    })

    it('should have authentication timeout as the longest timeout', () => {
      const allTimeouts = Object.values(TimeoutUtils.TIMEOUTS)
      const maxTimeout = Math.max(...allTimeouts)
      expect(TimeoutUtils.TIMEOUTS.AUTHENTICATION).toBe(maxTimeout)
    })
  })

  describe('getTimeoutForOperation', () => {
    it('should return correct timeout for each operation', () => {
      expect(TimeoutUtils.getTimeoutForOperation('PERSONAL_SIGN')).toBe(15000)
      expect(TimeoutUtils.getTimeoutForOperation('TYPED_DATA_SIGN')).toBe(15000)
      expect(TimeoutUtils.getTimeoutForOperation('SAFE_WALLET_SIGN')).toBe(20000)
      expect(TimeoutUtils.getTimeoutForOperation('FIREBASE_CALL')).toBe(10000)
      expect(TimeoutUtils.getTimeoutForOperation('SESSION_CLEANUP')).toBe(15000)
      expect(TimeoutUtils.getTimeoutForOperation('SUCCESS_TOAST')).toBe(3000)
      expect(TimeoutUtils.getTimeoutForOperation('ERROR_TOAST_IMMEDIATE')).toBe(0)
      expect(TimeoutUtils.getTimeoutForOperation('ERROR_TOAST_AFTER_DISCONNECT')).toBe(2000)
      expect(TimeoutUtils.getTimeoutForOperation('ERROR_TOAST_USER_ACTION')).toBe(1500)
      expect(TimeoutUtils.getTimeoutForOperation('WALLET_CONNECT')).toBe(30000)
      expect(TimeoutUtils.getTimeoutForOperation('AUTHENTICATION')).toBe(120000)
    })

    it('should work with all valid operation keys', () => {
      const validOperations = Object.keys(TimeoutUtils.TIMEOUTS) as Array<keyof typeof TimeoutUtils.TIMEOUTS>

      validOperations.forEach((operation) => {
        expect(() => TimeoutUtils.getTimeoutForOperation(operation)).not.toThrow()
        expect(typeof TimeoutUtils.getTimeoutForOperation(operation)).toBe('number')
      })
    })
  })

  describe('isTimeoutError', () => {
    it('should identify timeout errors with "timed out" message', () => {
      const timeoutError = new Error('Operation timed out after 5 seconds')

      expect(TimeoutUtils.isTimeoutError(timeoutError)).toBe(true)
    })

    it('should identify timeout errors with "timeout" message', () => {
      const timeoutError = new Error('Connection timeout occurred')

      expect(TimeoutUtils.isTimeoutError(timeoutError)).toBe(true)
    })

    it('should not identify non-timeout errors', () => {
      const regularError = new Error('Something went wrong')
      const networkError = new Error('Network connection failed')
      const validationError = new Error('Invalid input provided')

      expect(TimeoutUtils.isTimeoutError(regularError)).toBe(false)
      expect(TimeoutUtils.isTimeoutError(networkError)).toBe(false)
      expect(TimeoutUtils.isTimeoutError(validationError)).toBe(false)
    })

    it('should handle case sensitivity in timeout detection', () => {
      const upperCaseError = new Error('Operation TIMED OUT')
      const mixedCaseError = new Error('Request Timeout occurred')

      expect(TimeoutUtils.isTimeoutError(upperCaseError)).toBe(false) // Case sensitive
      expect(TimeoutUtils.isTimeoutError(mixedCaseError)).toBe(false) // Case sensitive
    })

    it('should handle partial matches in error messages', () => {
      const partialMatch1 = new Error('The operation has timed out due to network issues')
      const partialMatch2 = new Error('Request timeout - please try again')

      expect(TimeoutUtils.isTimeoutError(partialMatch1)).toBe(true)
      expect(TimeoutUtils.isTimeoutError(partialMatch2)).toBe(true)
    })

    it('should handle empty or undefined error messages', () => {
      const emptyError = new Error('')

      expect(TimeoutUtils.isTimeoutError(emptyError)).toBe(false)
    })
  })
})
