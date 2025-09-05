/**
 * Circuit breaker implementation for Firebase authentication
 * Prevents cascading failures and provides graceful degradation
 *
 * SECURITY: Implements atomic operations with mutex protection to prevent
 * race conditions in concurrent request handling scenarios.
 */

/* prettier-ignore */
export enum CircuitBreakerState {
  CLOSED = 'CLOSED',      // Normal operation
  OPEN = 'OPEN',          // Circuit is open, requests fail fast
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

/* prettier-ignore */
export interface CircuitBreakerConfig {
  failureThreshold: number        // Number of failures before opening
  recoveryTimeout: number         // Time to wait before trying half-open
  monitoringWindow: number        // Time window for failure counting
  halfOpenMaxRequests: number     // Max requests to allow in half-open state
  name: string                    // Circuit breaker identifier
}

export interface CircuitBreakerMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  circuitOpenCount: number
  lastFailureTime: number | null
  lastSuccessTime: number | null
  currentState: CircuitBreakerState
  failureRate: number
}

export interface CircuitBreakerResult<T> {
  success: boolean
  result?: T
  error?: Error
  circuitState: CircuitBreakerState
  metrics: CircuitBreakerMetrics
}

/**
 * Firebase Authentication Circuit Breaker
 * Monitors Firebase auth failures and prevents cascade failures
 */
/**
 * Mutex implementation for atomic operations
 * Prevents race conditions in concurrent circuit breaker operations
 */
class Mutex {
  private locked: boolean = false
  private queue: Array<() => void> = []

  async lock(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.locked) {
        this.locked = true
        resolve()
      } else {
        this.queue.push(resolve)
      }
    })
  }

  unlock(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      if (next) {
        next()
      }
    } else {
      this.locked = false
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.lock()
    try {
      return await fn()
    } finally {
      this.unlock()
    }
  }
}

export class FirebaseAuthCircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED
  private failureCount: number = 0
  private successCount: number = 0
  private lastFailureTime: number | null = null
  private lastSuccessTime: number | null = null
  private lastStateChange: number = Date.now()
  private halfOpenRequests: number = 0
  private totalRequests: number = 0
  private monitoringWindowStart: number = Date.now()

  // SECURITY: Mutex for atomic operations to prevent race conditions
  private readonly mutex: Mutex = new Mutex()

  constructor(private config: CircuitBreakerConfig) {
    console.log(`🔌 Circuit breaker "${config.name}" initialized`, {
      failureThreshold: config.failureThreshold,
      recoveryTimeout: config.recoveryTimeout,
      monitoringWindow: config.monitoringWindow,
    })
  }

  /**
   * Execute function with circuit breaker protection
   * SECURITY: Atomic operations prevent race conditions in request counting
   */
  async execute<T>(fn: () => Promise<T>): Promise<CircuitBreakerResult<T>> {
    // SECURITY: Atomic increment of total requests
    await this.mutex.withLock(async () => {
      this.totalRequests++
    })

    // Reset monitoring window if expired
    await this.resetMonitoringWindowIfExpired()

    // Check circuit state before execution (now async)
    if (await this.shouldRejectRequest()) {
      return {
        success: false,
        error: new Error(`Circuit breaker is ${this.state}. Request rejected to prevent cascade failures.`),
        circuitState: this.state,
        metrics: this.getMetrics(),
      }
    }

    // Execute the function
    try {
      const result = await fn()
      await this.onSuccess()

      return {
        success: true,
        result,
        circuitState: this.state,
        metrics: this.getMetrics(),
      }
    } catch (error) {
      await this.onFailure(error instanceof Error ? error : new Error(String(error)))

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        circuitState: this.state,
        metrics: this.getMetrics(),
      }
    }
  }

  /**
   * Check if request should be rejected based on circuit state
   * SECURITY: Uses atomic operations to prevent race conditions in half-open state
   */
  private async shouldRejectRequest(): Promise<boolean> {
    const now = Date.now()

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return false // Allow all requests

      case CircuitBreakerState.OPEN:
        // Check if recovery timeout has passed
        if (this.lastStateChange + this.config.recoveryTimeout <= now) {
          await this.mutex.withLock(async () => {
            // Double-check state hasn't changed while waiting for lock
            if (this.state === CircuitBreakerState.OPEN && this.lastStateChange + this.config.recoveryTimeout <= now) {
              this.transitionTo(CircuitBreakerState.HALF_OPEN)
            }
          })
          return false
        }
        return true // Reject request

      case CircuitBreakerState.HALF_OPEN:
        // SECURITY FIX: Atomic check-and-increment to prevent race conditions
        return await this.mutex.withLock(async () => {
          if (this.halfOpenRequests < this.config.halfOpenMaxRequests) {
            this.halfOpenRequests++
            return false // Allow request
          }
          return true // Reject additional requests
        })

      default:
        return false
    }
  }

  /**
   * Handle successful execution
   * SECURITY: Atomic state updates to prevent race conditions
   */
  private async onSuccess(): Promise<void> {
    await this.mutex.withLock(async () => {
      this.successCount++
      this.lastSuccessTime = Date.now()

      switch (this.state) {
        case CircuitBreakerState.HALF_OPEN:
          // If we've had enough successful requests in half-open, close the circuit
          if (this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
            this.transitionTo(CircuitBreakerState.CLOSED)
          }
          break

        case CircuitBreakerState.CLOSED:
          // Reset failure count on success in closed state
          this.failureCount = 0
          break
      }
    })
  }

  /**
   * Handle failed execution
   * SECURITY: Atomic state updates to prevent race conditions
   */
  private async onFailure(error: Error): Promise<void> {
    await this.mutex.withLock(async () => {
      this.failureCount++
      this.lastFailureTime = Date.now()

      console.warn(`🔌 Circuit breaker "${this.config.name}" recorded failure`, {
        error: error.message,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        currentState: this.state,
      })

      switch (this.state) {
        case CircuitBreakerState.CLOSED:
          if (this.failureCount >= this.config.failureThreshold) {
            this.transitionTo(CircuitBreakerState.OPEN)
          }
          break

        case CircuitBreakerState.HALF_OPEN:
          // Any failure in half-open state immediately opens the circuit
          this.transitionTo(CircuitBreakerState.OPEN)
          break
      }
    })
  }

  /**
   * Transition circuit breaker to new state
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state
    this.state = newState
    this.lastStateChange = Date.now()

    console.log(`🔌 Circuit breaker "${this.config.name}" state change: ${oldState} → ${newState}`, {
      failureCount: this.failureCount,
      successCount: this.successCount,
      metrics: this.getMetrics(),
    })

    // Reset counters based on new state
    switch (newState) {
      case CircuitBreakerState.CLOSED:
        this.failureCount = 0
        this.halfOpenRequests = 0
        break

      case CircuitBreakerState.OPEN:
        this.halfOpenRequests = 0
        break

      case CircuitBreakerState.HALF_OPEN:
        this.halfOpenRequests = 0
        break
    }
  }

  /**
   * Reset monitoring window if expired
   * SECURITY: Atomic window reset to prevent race conditions
   */
  private async resetMonitoringWindowIfExpired(): Promise<void> {
    await this.mutex.withLock(async () => {
      const now = Date.now()
      if (now - this.monitoringWindowStart >= this.config.monitoringWindow) {
        this.monitoringWindowStart = now
        // Reset counters for new monitoring window
        if (this.state === CircuitBreakerState.CLOSED) {
          this.failureCount = 0
          this.successCount = 0
        }
      }
    })
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const failureRate = this.totalRequests > 0 ? this.failureCount / this.totalRequests : 0

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successCount,
      failedRequests: this.failureCount,
      circuitOpenCount: this.state === CircuitBreakerState.OPEN ? 1 : 0,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      currentState: this.state,
      failureRate,
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state
  }

  /**
   * Check if circuit is healthy (closed state with low failure rate)
   */
  isHealthy(): boolean {
    const metrics = this.getMetrics()
    return this.state === CircuitBreakerState.CLOSED && metrics.failureRate < 0.5 // Less than 50% failure rate
  }

  /**
   * Force circuit to open (for testing or manual intervention)
   */
  forceOpen(): void {
    this.transitionTo(CircuitBreakerState.OPEN)
  }

  /**
   * Force circuit to close (for testing or manual intervention)
   */
  forceClose(): void {
    this.transitionTo(CircuitBreakerState.CLOSED)
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = null
    this.lastSuccessTime = null
    this.lastStateChange = Date.now()
    this.halfOpenRequests = 0
    this.totalRequests = 0
    this.monitoringWindowStart = Date.now()

    console.log(`🔌 Circuit breaker "${this.config.name}" reset to initial state`)
  }
}

/**
 * Pre-configured circuit breakers for different Firebase authentication scenarios
 */
export class FirebaseAuthCircuitBreakers {
  private static instances = new Map<string, FirebaseAuthCircuitBreaker>()

  /**
   * Get circuit breaker for Firebase authentication
   */
  static getFirebaseAuthCircuitBreaker(): FirebaseAuthCircuitBreaker {
    const key = 'firebase-auth'

    if (!this.instances.has(key)) {
      /* prettier-ignore */
      const config: CircuitBreakerConfig = {
        name: 'firebase-auth',
        failureThreshold: 3,        // Open after 3 failures
        recoveryTimeout: 30000,     // Try recovery after 30 seconds
        monitoringWindow: 60000,    // 1 minute monitoring window
        halfOpenMaxRequests: 2      // Allow 2 test requests in half-open
      }

      this.instances.set(key, new FirebaseAuthCircuitBreaker(config))
    }

    return this.instances.get(key)!
  }

  /**
   * Get circuit breaker specifically for Safe wallet authentication
   */
  static getSafeWalletCircuitBreaker(): FirebaseAuthCircuitBreaker {
    const key = 'safe-wallet-auth'

    if (!this.instances.has(key)) {
      /* prettier-ignore */
      const config: CircuitBreakerConfig = {
        name: 'safe-wallet-auth',
        failureThreshold: 2,        // More sensitive for Safe wallets
        recoveryTimeout: 60000,     // Longer recovery time
        monitoringWindow: 120000,   // 2 minute monitoring window
        halfOpenMaxRequests: 1      // Only 1 test request
      }

      this.instances.set(key, new FirebaseAuthCircuitBreaker(config))
    }

    return this.instances.get(key)!
  }

  /**
   * Get circuit breaker based on signature type
   */
  static getCircuitBreakerForSignatureType(signatureType: string): FirebaseAuthCircuitBreaker {
    if (signatureType === 'safe-wallet') {
      return this.getSafeWalletCircuitBreaker()
    }
    return this.getFirebaseAuthCircuitBreaker()
  }

  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    this.instances.forEach((breaker) => breaker.reset())
    console.log('🔌 All circuit breakers reset')
  }

  /**
   * Get health status of all circuit breakers
   */
  static getHealthStatus(): Record<string, CircuitBreakerMetrics> {
    const status: Record<string, CircuitBreakerMetrics> = {}

    this.instances.forEach((breaker, key) => {
      status[key] = breaker.getMetrics()
    })

    return status
  }
}
