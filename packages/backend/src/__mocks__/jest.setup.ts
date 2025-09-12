/**
 * Centralized Jest Setup for SuperPool Backend Mock System
 *
 * This file implements MOCK_SYSTEM.md specifications for Jest configuration.
 * It provides centralized mock management, performance monitoring, and
 * comprehensive test environment setup.
 */

import { jest } from '@jest/globals'

// Import centralized mock system
import { firebaseAdminMock } from './firebase/FirebaseAdminMock'
import { ethersMock } from './blockchain/EthersMock'
import { FunctionsMock } from './firebase/FunctionsMock'

// Environment setup for consistent testing
FunctionsMock.setupFunctionsEnvironment()

// Additional test-specific environment variables
process.env.POLYGON_AMOY_RPC_URL = 'http://127.0.0.1:8545'
process.env.POOL_FACTORY_ADDRESS_AMOY = '0x1234567890123456789012345678901234567890'
process.env.SAFE_ADDRESS_AMOY = '0x9876543210987654321098765432109876543210'

// Mock global objects for Node.js test environment
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock fetch with proper typing
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>

// Console filtering for cleaner test output
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

console.error = (...args: unknown[]) => {
  const message = args[0]
  if (typeof message === 'string') {
    // Skip expected Firebase warnings
    if (message.includes('Warning: This is a fake project')) return
    if (message.includes('Firebase Admin SDK')) return
    if (message.includes('FIREBASE_CONFIG')) return
  }
  originalConsoleError(...args)
}

console.warn = (...args: unknown[]) => {
  const message = args[0]
  if (typeof message === 'string') {
    // Skip expected ethers.js warnings
    if (message.includes('could not detect network')) return
    if (message.includes('missing response')) return
  }
  originalConsoleWarn(...args)
}

// Enhanced Jest matchers for blockchain and Firebase testing
expect.extend({
  toBeValidTransactionHash(received: string) {
    const pass = /^0x[a-fA-F0-9]{64}$/.test(received)
    return {
      message: () => `Expected ${received} to be a valid transaction hash`,
      pass,
    }
  },

  toBeValidEthereumAddress(received: string) {
    const pass = /^0x[a-fA-F0-9]{40}$/.test(received)
    return {
      message: () => `Expected ${received} to be a valid Ethereum address`,
      pass,
    }
  },

  toBeReasonableGasUsage(received: number, max: number = 500000) {
    const pass = received > 21000 && received < max
    return {
      message: () => `Expected ${received} to be reasonable gas usage (21000 < gas < ${max})`,
      pass,
    }
  },

  toHaveFirebaseError(received: unknown, expectedCode: string) {
    const pass =
      received &&
      typeof received === 'object' &&
      received !== null &&
      'code' in received &&
      (received as { code: string }).code === expectedCode
    return {
      message: () =>
        `Expected error to have Firebase code ${expectedCode}, got ${received && typeof received === 'object' && received !== null && 'code' in received ? (received as { code: string }).code : 'undefined'}`,
      pass: Boolean(pass),
    }
  },

  toHaveCallableError(received: unknown, expectedCode: string) {
    const pass =
      received &&
      typeof received === 'object' &&
      received !== null &&
      'code' in received &&
      (received as { code: string }).code === expectedCode &&
      'httpErrorCode' in received
    return {
      message: () =>
        `Expected CallableError to have code ${expectedCode}, got ${received && typeof received === 'object' && received !== null && 'code' in received ? (received as { code: string }).code : 'undefined'}`,
      pass: Boolean(pass),
    }
  },

  toBeValidPoolId(received: string) {
    const pass = /^\d+$/.test(received) && parseInt(received, 10) >= 0
    return {
      message: () => `Expected ${received} to be a valid pool ID (non-negative integer string)`,
      pass,
    }
  },

  toBeValidNonce(received: string) {
    const pass = received.length >= 16 && /^[a-zA-Z0-9]+$/.test(received)
    return {
      message: () => `Expected ${received} to be a valid nonce (16+ alphanumeric characters)`,
      pass,
    }
  },
})

// Mock performance monitoring
class MockPerformanceMonitor {
  private static callCounts = new Map<string, number>()
  private static callTimes = new Map<string, number[]>()

  static trackCall(mockName: string, duration: number): void {
    const currentCount = this.callCounts.get(mockName) || 0
    this.callCounts.set(mockName, currentCount + 1)

    const times = this.callTimes.get(mockName) || []
    times.push(duration)
    this.callTimes.set(mockName, times)
  }

  static getStats(): Record<string, { calls: number; avgTime: number; totalTime: number }> {
    const stats: Record<string, { calls: number; avgTime: number; totalTime: number }> = {}

    this.callCounts.forEach((count, mockName) => {
      const times = this.callTimes.get(mockName) || []
      const totalTime = times.reduce((sum, time) => sum + time, 0)
      const avgTime = totalTime / times.length

      stats[mockName] = {
        calls: count,
        avgTime: Number(avgTime.toFixed(2)),
        totalTime: Number(totalTime.toFixed(2)),
      }
    })

    return stats
  }

  static reset(): void {
    this.callCounts.clear()
    this.callTimes.clear()
  }

  static logStats(): void {
    const stats = this.getStats()
    if (Object.keys(stats).length > 0) {
      console.log('🔧 Mock Performance Stats:')
      console.table(stats)
    }
  }
}

// Global test hooks with centralized mock management
beforeAll(async () => {
  console.log('🧪 Starting SuperPool Backend Test Suite with Centralized Mocks')

  // Validate test environment
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') {
    throw new Error('Tests must run with NODE_ENV=test')
  }
})

beforeEach(() => {
  // ✅ MOCK_SYSTEM.md Requirement: Reset all mocks before each test
  firebaseAdminMock.resetAllMocks()
  ethersMock.resetAllMocks()
  MockPerformanceMonitor.reset()

  // Reset global fetch mock
  ;(global.fetch as jest.MockedFunction<typeof fetch>).mockClear()

  // Performance monitoring reset
  mockCallStartTime = Date.now()
  mockCallCount = 0
})

afterEach(() => {
  // Performance monitoring and warnings
  const testDuration = Date.now() - mockCallStartTime

  if (testDuration > 5000) {
    console.warn(`⚠️  Slow test detected: ${testDuration}ms (consider optimizing mocks)`)
  }

  if (mockCallCount > 100) {
    console.warn(`⚠️  High mock usage: ${mockCallCount} calls (consider consolidating)`)
  }

  // Log mock performance in debug mode
  if (process.env.DEBUG_MOCKS === 'true') {
    MockPerformanceMonitor.logStats()
  }
})

afterAll(async () => {
  console.log('✅ SuperPool Backend Test Suite Complete')

  // Clean up Functions environment
  FunctionsMock.resetFunctionsEnvironment()

  // Force garbage collection if available
  if (global.gc) {
    global.gc()
  }
})

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit process in tests, just log
})

// Global variables for performance tracking
let mockCallCount = 0
let mockCallStartTime = Date.now()

// Extend Jest timeout for blockchain operations
jest.setTimeout(30000) // 30 seconds

// Export test utilities for use in individual tests
export const testUtils = {
  timeout: 5000,

  // Helper for creating deterministic test data
  createTestData: (prefix: string, index?: number) => ({
    id: `${prefix}-${index || Date.now()}`,
    timestamp: Date.now(),
    address: `0x${prefix.padEnd(40, '0')}`,
  }),

  // Helper for waiting in tests
  wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),

  // Helper for incrementing mock call counter
  trackMockCall: () => {
    mockCallCount++
  },

  // Helper for validating test environment
  validateTestEnvironment: () => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Invalid test environment')
    }
    return true
  },

  // Mock performance utilities
  performance: MockPerformanceMonitor,

  // Mock state utilities
  resetAllMocks: () => {
    firebaseAdminMock.resetAllMocks()
    ethersMock.resetAllMocks()
    MockPerformanceMonitor.reset()
  },

  // Mock factory helpers
  createCallableRequest: FunctionsMock.createCallableRequest.bind(FunctionsMock),
  createAuthenticatedRequest: FunctionsMock.createAuthenticatedRequest.bind(FunctionsMock),
  createUnauthenticatedRequest: FunctionsMock.createUnauthenticatedRequest.bind(FunctionsMock),
  createHttpsError: FunctionsMock.createHttpsError.bind(FunctionsMock),
}

// Type augmentation for custom matchers
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeValidTransactionHash(): R
      toBeValidEthereumAddress(): R
      toBeReasonableGasUsage(max?: number): R
      toHaveFirebaseError(expectedCode: string): R
      toHaveCallableError(expectedCode: string): R
      toBeValidPoolId(): R
      toBeValidNonce(): R
    }
  }
}

export { MockPerformanceMonitor }
export default testUtils
