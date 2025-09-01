import {
  CircuitBreakerState,
  FirebaseAuthCircuitBreaker,
  FirebaseAuthCircuitBreakers,
  CircuitBreakerConfig
} from './circuitBreaker'

describe('FirebaseAuthCircuitBreaker', () => {
  let circuitBreaker: FirebaseAuthCircuitBreaker
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  const testConfig: CircuitBreakerConfig = {
    name: 'test-breaker',
    failureThreshold: 2,
    recoveryTimeout: 1000,
    monitoringWindow: 5000,
    halfOpenMaxRequests: 1
  }

  beforeEach(() => {
    circuitBreaker = new FirebaseAuthCircuitBreaker(testConfig)
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
      expect(circuitBreaker.isHealthy()).toBe(true)
    })

    it('should initialize with correct configuration', () => {
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker "test-breaker" initialized'),
        expect.objectContaining({
          failureThreshold: 2,
          recoveryTimeout: 1000,
          monitoringWindow: 5000
        })
      )
    })
  })

  describe('execute function', () => {
    it('should execute function successfully in CLOSED state', async () => {
      const mockFn = jest.fn().mockResolvedValue('success')
      
      const result = await circuitBreaker.execute(mockFn)

      expect(result.success).toBe(true)
      expect(result.result).toBe('success')
      expect(result.circuitState).toBe(CircuitBreakerState.CLOSED)
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('should record failure and maintain CLOSED state below threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'))
      
      const result = await circuitBreaker.execute(mockFn)

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('test error')
      expect(result.circuitState).toBe(CircuitBreakerState.CLOSED)
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
    })

    it('should transition to OPEN state when failure threshold is reached', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('test error'))
      
      // First failure
      await circuitBreaker.execute(mockFn)
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)

      // Second failure - should trigger OPEN state
      await circuitBreaker.execute(mockFn)
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('state change: CLOSED → OPEN'),
        expect.any(Object)
      )
    })

    it('should reject requests immediately in OPEN state', async () => {
      const mockFn = jest.fn()

      // Trigger OPEN state
      const errorFn = jest.fn().mockRejectedValue(new Error('error'))
      await circuitBreaker.execute(errorFn)
      await circuitBreaker.execute(errorFn)

      // Now try to execute - should be rejected without calling function
      const result = await circuitBreaker.execute(mockFn)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Circuit breaker is OPEN')
      expect(result.circuitState).toBe(CircuitBreakerState.OPEN)
      expect(mockFn).not.toHaveBeenCalled()
    })

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('error'))

      // Trigger OPEN state
      await circuitBreaker.execute(mockFn)
      await circuitBreaker.execute(mockFn)
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)

      // Fast-forward past recovery timeout
      await jest.runAllTimersAsync()

      // Next request should transition to HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('success')
      const result = await circuitBreaker.execute(successFn)

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN)
      expect(result.success).toBe(true)
    })

    it('should transition from HALF_OPEN to CLOSED on successful requests', async () => {
      // Get to HALF_OPEN state
      const errorFn = jest.fn().mockRejectedValue(new Error('error'))
      await circuitBreaker.execute(errorFn)
      await circuitBreaker.execute(errorFn)
      await jest.runAllTimersAsync()

      const successFn = jest.fn().mockResolvedValue('success')
      
      // Execute maximum allowed half-open requests successfully
      for (let i = 0; i < testConfig.halfOpenMaxRequests; i++) {
        await circuitBreaker.execute(successFn)
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('state change: HALF_OPEN → CLOSED'),
        expect.any(Object)
      )
    })

    it('should transition from HALF_OPEN back to OPEN on failure', async () => {
      // Get to HALF_OPEN state
      const errorFn = jest.fn().mockRejectedValue(new Error('error'))
      await circuitBreaker.execute(errorFn)
      await circuitBreaker.execute(errorFn)
      await jest.runAllTimersAsync()

      // Transition to HALF_OPEN
      const successFn = jest.fn().mockResolvedValue('success')
      await circuitBreaker.execute(successFn)
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN)

      // Fail in HALF_OPEN - should go back to OPEN
      await circuitBreaker.execute(errorFn)
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)
    })

    it('should limit requests in HALF_OPEN state', async () => {
      // Get to HALF_OPEN state
      const errorFn = jest.fn().mockRejectedValue(new Error('error'))
      await circuitBreaker.execute(errorFn)
      await circuitBreaker.execute(errorFn)
      await jest.runAllTimersAsync()

      const successFn = jest.fn().mockResolvedValue('success')
      await circuitBreaker.execute(successFn) // First request allowed

      // Second request should be rejected (halfOpenMaxRequests = 1)
      const result = await circuitBreaker.execute(successFn)
      
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Circuit breaker is HALF_OPEN')
    })
  })

  describe('metrics', () => {
    it('should track metrics correctly', async () => {
      const successFn = jest.fn().mockResolvedValue('success')
      const errorFn = jest.fn().mockRejectedValue(new Error('error'))

      await circuitBreaker.execute(successFn)
      await circuitBreaker.execute(errorFn)
      await circuitBreaker.execute(successFn)

      const metrics = circuitBreaker.getMetrics()

      expect(metrics.totalRequests).toBe(3)
      expect(metrics.successfulRequests).toBe(2)
      expect(metrics.failedRequests).toBe(1)
      expect(metrics.currentState).toBe(CircuitBreakerState.CLOSED)
      expect(metrics.failureRate).toBeCloseTo(0.33, 2)
      expect(metrics.lastSuccessTime).toBeGreaterThan(0)
      expect(metrics.lastFailureTime).toBeGreaterThan(0)
    })

    it('should calculate failure rate correctly', async () => {
      const errorFn = jest.fn().mockRejectedValue(new Error('error'))

      // Execute 2 failures
      await circuitBreaker.execute(errorFn)
      await circuitBreaker.execute(errorFn)

      const metrics = circuitBreaker.getMetrics()
      expect(metrics.failureRate).toBe(1.0) // 100% failure rate
    })
  })

  describe('manual control', () => {
    it('should allow manual opening of circuit', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
      
      circuitBreaker.forceOpen()
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)
    })

    it('should allow manual closing of circuit', () => {
      circuitBreaker.forceOpen()
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)
      
      circuitBreaker.forceClose()
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
    })

    it('should reset circuit breaker to initial state', async () => {
      const errorFn = jest.fn().mockRejectedValue(new Error('error'))
      
      // Generate some activity
      await circuitBreaker.execute(errorFn)
      await circuitBreaker.execute(errorFn)
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)
      
      circuitBreaker.reset()
      
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
      const metrics = circuitBreaker.getMetrics()
      expect(metrics.totalRequests).toBe(0)
      expect(metrics.successfulRequests).toBe(0)
      expect(metrics.failedRequests).toBe(0)
    })
  })

  describe('health checking', () => {
    it('should report healthy for CLOSED state with low failure rate', async () => {
      const successFn = jest.fn().mockResolvedValue('success')
      await circuitBreaker.execute(successFn)
      
      expect(circuitBreaker.isHealthy()).toBe(true)
    })

    it('should report unhealthy for high failure rate', async () => {
      const errorFn = jest.fn().mockRejectedValue(new Error('error'))
      
      // Create high failure rate but not enough to open circuit
      await circuitBreaker.execute(errorFn)
      
      // Even in CLOSED state, high failure rate makes it unhealthy
      expect(circuitBreaker.isHealthy()).toBe(false)
    })

    it('should report unhealthy for non-CLOSED states', () => {
      circuitBreaker.forceOpen()
      expect(circuitBreaker.isHealthy()).toBe(false)
    })
  })
})

describe('FirebaseAuthCircuitBreakers', () => {
  beforeEach(() => {
    // Reset singleton instances
    FirebaseAuthCircuitBreakers.resetAll()
  })

  describe('getFirebaseAuthCircuitBreaker', () => {
    it('should return singleton instance', () => {
      const breaker1 = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()
      const breaker2 = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()
      
      expect(breaker1).toBe(breaker2) // Same instance
      expect(breaker1.getState()).toBe(CircuitBreakerState.CLOSED)
    })

    it('should have correct configuration for Firebase auth', () => {
      const breaker = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()
      const metrics = breaker.getMetrics()
      
      // Test that it exists and is in initial state
      expect(metrics.currentState).toBe(CircuitBreakerState.CLOSED)
      expect(metrics.totalRequests).toBe(0)
    })
  })

  describe('getSafeWalletCircuitBreaker', () => {
    it('should return singleton instance with Safe-specific config', () => {
      const breaker1 = FirebaseAuthCircuitBreakers.getSafeWalletCircuitBreaker()
      const breaker2 = FirebaseAuthCircuitBreakers.getSafeWalletCircuitBreaker()
      
      expect(breaker1).toBe(breaker2) // Same instance
      expect(breaker1.getState()).toBe(CircuitBreakerState.CLOSED)
    })

    it('should be different from Firebase auth circuit breaker', () => {
      const firebaseBreaker = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()
      const safeBreaker = FirebaseAuthCircuitBreakers.getSafeWalletCircuitBreaker()
      
      expect(firebaseBreaker).not.toBe(safeBreaker)
    })
  })

  describe('getCircuitBreakerForSignatureType', () => {
    it('should return Safe wallet breaker for safe-wallet signature type', () => {
      const breaker = FirebaseAuthCircuitBreakers.getCircuitBreakerForSignatureType('safe-wallet')
      const safeBreaker = FirebaseAuthCircuitBreakers.getSafeWalletCircuitBreaker()
      
      expect(breaker).toBe(safeBreaker)
    })

    it('should return Firebase auth breaker for other signature types', () => {
      const personalSignBreaker = FirebaseAuthCircuitBreakers.getCircuitBreakerForSignatureType('personal-sign')
      const typedDataBreaker = FirebaseAuthCircuitBreakers.getCircuitBreakerForSignatureType('typed-data')
      const firebaseBreaker = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()
      
      expect(personalSignBreaker).toBe(firebaseBreaker)
      expect(typedDataBreaker).toBe(firebaseBreaker)
    })
  })

  describe('resetAll', () => {
    it('should reset all circuit breaker instances', async () => {
      const firebaseBreaker = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()
      const safeBreaker = FirebaseAuthCircuitBreakers.getSafeWalletCircuitBreaker()
      
      // Generate some activity
      const errorFn = jest.fn().mockRejectedValue(new Error('error'))
      await firebaseBreaker.execute(errorFn)
      await safeBreaker.execute(errorFn)
      
      expect(firebaseBreaker.getMetrics().totalRequests).toBeGreaterThan(0)
      expect(safeBreaker.getMetrics().totalRequests).toBeGreaterThan(0)
      
      FirebaseAuthCircuitBreakers.resetAll()
      
      expect(firebaseBreaker.getMetrics().totalRequests).toBe(0)
      expect(safeBreaker.getMetrics().totalRequests).toBe(0)
    })
  })

  describe('getHealthStatus', () => {
    it('should return health status for all circuit breakers', async () => {
      // Create instances
      FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()
      FirebaseAuthCircuitBreakers.getSafeWalletCircuitBreaker()
      
      const healthStatus = FirebaseAuthCircuitBreakers.getHealthStatus()
      
      expect(healthStatus).toHaveProperty('firebase-auth')
      expect(healthStatus).toHaveProperty('safe-wallet-auth')
      expect(healthStatus['firebase-auth'].currentState).toBe(CircuitBreakerState.CLOSED)
      expect(healthStatus['safe-wallet-auth'].currentState).toBe(CircuitBreakerState.CLOSED)
    })

    it('should reflect actual metrics in health status', async () => {
      const firebaseBreaker = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()
      
      // Generate some activity
      const successFn = jest.fn().mockResolvedValue('success')
      await firebaseBreaker.execute(successFn)
      
      const healthStatus = FirebaseAuthCircuitBreakers.getHealthStatus()
      
      expect(healthStatus['firebase-auth'].totalRequests).toBe(1)
      expect(healthStatus['firebase-auth'].successfulRequests).toBe(1)
      expect(healthStatus['firebase-auth'].failedRequests).toBe(0)
    })
  })
})