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

/* prettier-ignore */
export interface InstanceLifecycleConfig {
  ttlMs: number                   // Time-to-live for inactive instances (default: 30 minutes)
  maxInstances: number            // Maximum number of instances to keep in memory (default: 100)
  cleanupIntervalMs: number       // Cleanup interval in milliseconds (default: 5 minutes)
  inactivityThresholdMs: number   // Consider instance inactive after this time (default: 15 minutes)
}

interface InstanceMetadata {
  instance: FirebaseAuthCircuitBreaker
  lastAccessTime: number
  createdTime: number
  accessCount: number
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

export interface MemoryMetrics {
  totalInstances: number
  activeInstances: number
  inactiveInstances: number
  oldestInstanceAge: number
  newestInstanceAge: number
  totalAccessCount: number
  lastCleanupTime: number
  memoryPressureLevel: 'low' | 'medium' | 'high'
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
 * Enhanced with lifecycle management to prevent memory leaks
 */
export class FirebaseAuthCircuitBreakers {
  private static instances = new Map<string, InstanceMetadata>()
  private static cleanupTimer: NodeJS.Timeout | null = null
  private static lastCleanupTime: number = Date.now()

  // Default lifecycle configuration
  /* prettier-ignore */
  private static readonly DEFAULT_LIFECYCLE_CONFIG: InstanceLifecycleConfig = {
    ttlMs: 30 * 60 * 1000,        // 30 minutes TTL
    maxInstances: 100,            // Maximum 100 instances
    cleanupIntervalMs: 5 * 60 * 1000, // Cleanup every 5 minutes
    inactivityThresholdMs: 15 * 60 * 1000, // 15 minutes inactivity threshold
  }

  private static lifecycleConfig: InstanceLifecycleConfig = { ...FirebaseAuthCircuitBreakers.DEFAULT_LIFECYCLE_CONFIG }

  /**
   * Get circuit breaker for Firebase authentication
   */
  static getFirebaseAuthCircuitBreaker(): FirebaseAuthCircuitBreaker {
    const key = 'firebase-auth'

    this.ensureCleanupTimer()
    return this.getOrCreateInstance(key, () => {
      /* prettier-ignore */
      const config: CircuitBreakerConfig = {
        name: 'firebase-auth',
        failureThreshold: 3,        // Open after 3 failures
        recoveryTimeout: 30000,     // Try recovery after 30 seconds
        monitoringWindow: 60000,    // 1 minute monitoring window
        halfOpenMaxRequests: 2      // Allow 2 test requests in half-open
      }

      return new FirebaseAuthCircuitBreaker(config)
    })
  }

  /**
   * Get circuit breaker specifically for Safe wallet authentication
   */
  static getSafeWalletCircuitBreaker(): FirebaseAuthCircuitBreaker {
    const key = 'safe-wallet-auth'

    this.ensureCleanupTimer()
    return this.getOrCreateInstance(key, () => {
      /* prettier-ignore */
      const config: CircuitBreakerConfig = {
        name: 'safe-wallet-auth',
        failureThreshold: 2,        // More sensitive for Safe wallets
        recoveryTimeout: 60000,     // Longer recovery time
        monitoringWindow: 120000,   // 2 minute monitoring window
        halfOpenMaxRequests: 1      // Only 1 test request
      }

      return new FirebaseAuthCircuitBreaker(config)
    })
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
   * Get or create instance with lifecycle tracking
   */
  private static getOrCreateInstance(key: string, factory: () => FirebaseAuthCircuitBreaker): FirebaseAuthCircuitBreaker {
    const now = Date.now()

    if (this.instances.has(key)) {
      const metadata = this.instances.get(key)!
      metadata.lastAccessTime = now
      metadata.accessCount++

      console.log(`🔌 Circuit breaker "${key}" accessed (count: ${metadata.accessCount})`, {
        age: now - metadata.createdTime,
        lastAccess: now - metadata.lastAccessTime,
      })

      return metadata.instance
    }

    // Check memory pressure before creating new instance
    this.enforceMemoryLimits()

    const instance = factory()
    const metadata: InstanceMetadata = {
      instance,
      lastAccessTime: now,
      createdTime: now,
      accessCount: 1,
    }

    this.instances.set(key, metadata)

    console.log(`🔌 Circuit breaker "${key}" created (total instances: ${this.instances.size})`, {
      totalInstances: this.instances.size,
      memoryPressure: this.getMemoryPressureLevel(),
    })

    return instance
  }

  /**
   * Enforce memory limits by cleaning up old instances if necessary
   */
  private static enforceMemoryLimits(): void {
    if (this.instances.size < this.lifecycleConfig.maxInstances) {
      return
    }

    console.warn(`🔌 Memory pressure detected: ${this.instances.size} instances, limit: ${this.lifecycleConfig.maxInstances}`, {
      memoryPressure: 'high',
      action: 'force_cleanup',
    })

    // Force cleanup of oldest inactive instances
    this.performCleanup(true)
  }

  /**
   * Start cleanup timer if not already running
   */
  private static ensureCleanupTimer(): void {
    if (this.cleanupTimer) {
      return
    }

    this.cleanupTimer = setInterval(() => {
      this.performCleanup(false)
    }, this.lifecycleConfig.cleanupIntervalMs)

    console.log(`🔌 Cleanup timer started (interval: ${this.lifecycleConfig.cleanupIntervalMs}ms)`, {
      ttlMs: this.lifecycleConfig.ttlMs,
      maxInstances: this.lifecycleConfig.maxInstances,
    })
  }

  /**
   * Perform cleanup of expired or inactive instances
   */
  private static performCleanup(force: boolean): void {
    const now = Date.now()
    const initialCount = this.instances.size
    let cleanedCount = 0
    const itemsToDelete: string[] = []

    for (const [key, metadata] of this.instances.entries()) {
      const age = now - metadata.createdTime
      const timeSinceAccess = now - metadata.lastAccessTime

      const shouldCleanup = force
        ? timeSinceAccess > this.lifecycleConfig.inactivityThresholdMs
        : age > this.lifecycleConfig.ttlMs || timeSinceAccess > this.lifecycleConfig.inactivityThresholdMs

      if (shouldCleanup) {
        itemsToDelete.push(key)
        cleanedCount++

        console.log(`🔌 Cleaning up circuit breaker "${key}"`, {
          age,
          timeSinceAccess,
          accessCount: metadata.accessCount,
          reason: force ? 'memory_pressure' : 'ttl_expired',
        })
      }
    }

    // Remove items after iteration to avoid modifying during iteration
    for (const key of itemsToDelete) {
      this.instances.delete(key)
    }

    this.lastCleanupTime = now

    if (cleanedCount > 0) {
      console.log(`🔌 Cleanup completed: removed ${cleanedCount} instances`, {
        before: initialCount,
        after: this.instances.size,
        memoryPressure: this.getMemoryPressureLevel(),
        force,
      })
    }
  }

  /**
   * Get current memory pressure level
   */
  private static getMemoryPressureLevel(): 'low' | 'medium' | 'high' {
    const count = this.instances.size
    const maxInstances = this.lifecycleConfig.maxInstances

    if (count >= maxInstances) return 'high'
    if (count >= maxInstances * 0.7) return 'medium'
    return 'low'
  }

  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    this.instances.forEach((metadata) => metadata.instance.reset())
    console.log('🔌 All circuit breakers reset')
  }

  /**
   * Get health status of all circuit breakers
   */
  static getHealthStatus(): Record<string, CircuitBreakerMetrics> {
    const status: Record<string, CircuitBreakerMetrics> = {}

    this.instances.forEach((metadata, key) => {
      status[key] = metadata.instance.getMetrics()
    })

    return status
  }

  /**
   * Get memory usage metrics and lifecycle information
   */
  static getMemoryMetrics(): MemoryMetrics {
    const now = Date.now()
    let oldestInstanceAge = 0
    let newestInstanceAge = Number.MAX_SAFE_INTEGER
    let totalAccessCount = 0
    let activeInstances = 0

    for (const metadata of this.instances.values()) {
      const age = now - metadata.createdTime
      const timeSinceAccess = now - metadata.lastAccessTime

      if (timeSinceAccess < this.lifecycleConfig.inactivityThresholdMs) {
        activeInstances++
      }

      oldestInstanceAge = Math.max(oldestInstanceAge, age)
      newestInstanceAge = Math.min(newestInstanceAge, age)
      totalAccessCount += metadata.accessCount
    }

    // Handle edge case when no instances exist
    if (this.instances.size === 0) {
      newestInstanceAge = 0
    }

    return {
      totalInstances: this.instances.size,
      activeInstances,
      inactiveInstances: this.instances.size - activeInstances,
      oldestInstanceAge,
      newestInstanceAge,
      totalAccessCount,
      lastCleanupTime: this.lastCleanupTime,
      memoryPressureLevel: this.getMemoryPressureLevel(),
    }
  }

  /**
   * Configure lifecycle management settings
   */
  static configureLifecycle(config: Partial<InstanceLifecycleConfig>): void {
    const oldConfig = { ...this.lifecycleConfig }
    this.lifecycleConfig = { ...this.lifecycleConfig, ...config }

    console.log('🔌 Lifecycle configuration updated', {
      oldConfig,
      newConfig: this.lifecycleConfig,
    })

    // Restart cleanup timer with new interval if it changed
    if (config.cleanupIntervalMs && config.cleanupIntervalMs !== oldConfig.cleanupIntervalMs) {
      this.stopCleanupTimer()
      this.ensureCleanupTimer()
    }

    // Perform immediate cleanup if limits were tightened
    if ((config.maxInstances && config.maxInstances < oldConfig.maxInstances) || (config.ttlMs && config.ttlMs < oldConfig.ttlMs)) {
      this.performCleanup(false)
    }
  }

  /**
   * Force immediate cleanup (useful for testing or memory pressure situations)
   */
  static forceCleanup(): void {
    console.log('🔌 Forcing immediate cleanup of circuit breaker instances')
    this.performCleanup(true)
  }

  /**
   * Stop cleanup timer (useful for testing or shutdown)
   */
  static stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
      console.log('🔌 Cleanup timer stopped')
    }
  }

  /**
   * Clear all instances and stop cleanup (for testing or complete reset)
   */
  static clearAll(): void {
    this.stopCleanupTimer()
    const count = this.instances.size
    this.instances.clear()
    this.lastCleanupTime = Date.now()

    console.log(`🔌 All circuit breaker instances cleared (${count} instances removed)`, {
      memoryPressure: 'low',
    })
  }
}
