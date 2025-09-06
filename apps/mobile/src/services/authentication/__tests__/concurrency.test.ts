/**
 * Minimal Concurrency Test Suite for Authentication Services
 *
 * This ultra-focused test suite validates only the most critical concurrency issues:
 * - Basic race conditions in circuit breakers
 * - Simple state consistency under concurrent access
 * - Memory leak prevention basics
 *
 * DESIGN PRINCIPLES:
 * - Ultra-fast execution (under 10 seconds total)
 * - No complex authentication flow mocking
 * - Focus on isolated components that can be tested reliably
 * - Maximum 3 concurrent operations
 * - Simple assertions only
 */

import { CircuitBreakerState, FirebaseAuthCircuitBreakers } from '../utils/circuitBreaker'

describe('Critical Concurrency Tests', () => {
  const CONCURRENT_OPS = 3
  const FAST_TIMEOUT = 5000 // 5 seconds max per test

  beforeEach(() => {
    jest.clearAllMocks()
    FirebaseAuthCircuitBreakers.clearAll()
  })

  afterEach(() => {
    FirebaseAuthCircuitBreakers.clearAll()
  })

  describe('Circuit Breaker Race Conditions', () => {
    it(
      'should handle concurrent failures without state corruption',
      async () => {
        const circuitBreaker = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()

        // Create concurrent operations that fail
        const promises = Array.from({ length: CONCURRENT_OPS }, (_, i) => {
          return circuitBreaker.execute(async () => {
            throw new Error(`Test failure ${i}`)
          })
        })

        const results = await Promise.all(promises)

        // Verify all operations completed and returned CircuitBreakerResult objects
        expect(results).toHaveLength(CONCURRENT_OPS)
        expect(results.every((r) => r && typeof r === 'object' && 'success' in r)).toBe(true)
        expect(results.every((r) => !r.success)).toBe(true) // All should be failures

        // Verify circuit breaker tracked failures correctly
        const metrics = circuitBreaker.getMetrics()
        expect(metrics.failedRequests).toBe(CONCURRENT_OPS)
        expect(metrics.totalRequests).toBe(CONCURRENT_OPS)
      },
      FAST_TIMEOUT
    )

    it(
      'should maintain consistent state during transitions',
      async () => {
        const circuitBreaker = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()

        // Force circuit to open
        circuitBreaker.forceOpen()
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)

        // Create concurrent requests to open circuit
        const promises = Array.from({ length: CONCURRENT_OPS }, (_, i) => {
          return circuitBreaker.execute(async () => {
            return `result-${i}`
          })
        })

        const results = await Promise.all(promises)

        // All should be rejected due to open circuit
        expect(results).toHaveLength(CONCURRENT_OPS)
        expect(results.every((r) => r && typeof r === 'object' && 'success' in r)).toBe(true)
        expect(results.every((r) => !r.success)).toBe(true) // All should be rejected

        // Circuit should still be open
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)
      },
      FAST_TIMEOUT
    )
  })

  describe('Memory Management Under Load', () => {
    it(
      'should not leak circuit breaker instances',
      async () => {
        const initialCount = FirebaseAuthCircuitBreakers.getMemoryMetrics().totalInstances

        // Create multiple circuit breakers concurrently
        const promises = Array.from({ length: CONCURRENT_OPS }, (_, i) => {
          return Promise.resolve().then(() => {
            const cb = FirebaseAuthCircuitBreakers.getCircuitBreakerForSignatureType(`test-${i}`)
            return cb.execute(async () => `result-${i}`)
          })
        })

        await Promise.all(promises)

        // Check memory didn't explode
        const finalCount = FirebaseAuthCircuitBreakers.getMemoryMetrics().totalInstances
        expect(finalCount).toBeLessThanOrEqual(initialCount + CONCURRENT_OPS + 2) // Allow some buffer
        expect(finalCount).toBeGreaterThan(0) // Should have created some instances
      },
      FAST_TIMEOUT
    )

    it(
      'should clean up resources properly',
      async () => {
        // Create and use circuit breakers
        const promises = Array.from({ length: CONCURRENT_OPS }, (_, i) => {
          return FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker().execute(async () => {
            return `cleanup-test-${i}`
          })
        })

        await Promise.all(promises)

        // Force cleanup
        FirebaseAuthCircuitBreakers.forceCleanup()

        // Verify cleanup worked
        const memoryMetrics = FirebaseAuthCircuitBreakers.getMemoryMetrics()
        expect(memoryMetrics.memoryPressureLevel).not.toBe('high')
      },
      FAST_TIMEOUT
    )
  })

  describe('Basic State Consistency', () => {
    it(
      'should handle concurrent success operations correctly',
      async () => {
        const circuitBreaker = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()

        // Create concurrent successful operations
        const promises = Array.from({ length: CONCURRENT_OPS }, (_, i) => {
          return circuitBreaker.execute(async () => {
            return `success-${i}`
          })
        })

        const results = await Promise.all(promises)

        // All should succeed
        expect(results).toHaveLength(CONCURRENT_OPS)
        results.forEach((result) => {
          expect(result.success).toBe(true)
        })

        // Verify metrics are consistent
        const metrics = circuitBreaker.getMetrics()
        expect(metrics.successfulRequests).toBe(CONCURRENT_OPS)
        expect(metrics.totalRequests).toBe(CONCURRENT_OPS)
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
      },
      FAST_TIMEOUT
    )

    it(
      'should handle mixed success/failure operations atomically',
      async () => {
        const circuitBreaker = FirebaseAuthCircuitBreakers.getFirebaseAuthCircuitBreaker()

        // Create mixed operations
        const promises = Array.from({ length: CONCURRENT_OPS }, (_, i) => {
          return circuitBreaker.execute(async () => {
            if (i === 1) {
              throw new Error(`Planned failure ${i}`)
            }
            return `success-${i}`
          })
        })

        const results = await Promise.all(promises)

        // Should have mix of success and failure
        expect(results).toHaveLength(CONCURRENT_OPS)
        expect(results.every((r) => r && typeof r === 'object' && 'success' in r)).toBe(true)

        const successCount = results.filter((r) => r.success).length
        const failureCount = results.filter((r) => !r.success).length

        expect(successCount + failureCount).toBe(CONCURRENT_OPS)
        expect(failureCount).toBe(1) // Only one planned failure
        expect(successCount).toBe(2) // Other two should succeed

        // Basic metrics validation - just verify some requests were processed
        const metrics = circuitBreaker.getMetrics()
        expect(metrics.totalRequests).toBe(CONCURRENT_OPS)
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
      },
      FAST_TIMEOUT
    )
  })
})

/**
 * Minimal Test Suite Summary:
 *
 * 📊 Ultra-Streamlined Statistics:
 * - Total Test Cases: 6 essential scenarios
 * - Concurrent Operations: 3 per test
 * - Test Timeout: 5 seconds per test
 * - Expected Total Runtime: Under 10 seconds
 *
 * 🎯 Critical Areas Covered:
 *
 * 1. Circuit Breaker Race Conditions (2 tests):
 *    - Concurrent failure handling without corruption
 *    - State consistency during transitions
 *
 * 2. Memory Management (2 tests):
 *    - Instance leak prevention
 *    - Resource cleanup verification
 *
 * 3. Basic State Consistency (2 tests):
 *    - Concurrent success operations
 *    - Mixed success/failure atomic handling
 *
 * 🚀 Ultra-Fast Optimizations:
 * - No authentication flow mocking (removed timeouts)
 * - No complex async patterns
 * - Direct circuit breaker testing only
 * - Simple success/failure assertions
 * - Minimal concurrent operations (3 max)
 * - 5-second timeout per test
 *
 * 🛡️ Core Security Maintained:
 * - Circuit breaker state integrity
 * - Memory management validation
 * - Atomic operation handling
 * - Basic concurrency safety
 */
