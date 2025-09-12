/**
 * Global Jest Setup for SuperPool Backend Testing
 *
 * This file is executed before all tests run and configures the testing environment
 * for Firebase Cloud Functions, blockchain integration, and mock systems.
 */

/* eslint-disable @typescript-eslint/no-namespace */

import { afterAll, afterEach, beforeAll, beforeEach, expect, jest } from '@jest/globals'

// Environment setup
process.env.NODE_ENV = 'test'
process.env.GCLOUD_PROJECT = 'superpool-test'
process.env.FUNCTIONS_EMULATOR = 'true'
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'superpool-test',
  storageBucket: 'superpool-test.appspot.com',
})

// Test-specific environment variables
process.env.POLYGON_AMOY_RPC_URL = 'http://127.0.0.1:8545' // Local test blockchain
process.env.POOL_FACTORY_ADDRESS_AMOY = '0x1234567890123456789012345678901234567890'
process.env.SAFE_ADDRESS_AMOY = '0x9876543210987654321098765432109876543210'

// Mock global objects that might not be available in Node.js test environment
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock fetch for Node.js environment with proper typing
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>

// Setup console filtering for cleaner test output
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

console.error = (...args: unknown[]) => {
  // Filter out expected Firebase warnings in test environment
  const message = args[0]
  if (typeof message === 'string') {
    // Skip Firebase emulator warnings
    if (message.includes('Warning: This is a fake project')) return
    if (message.includes('Firebase Admin SDK')) return
    if (message.includes('FIREBASE_CONFIG')) return
  }
  originalConsoleError(...args)
}

console.warn = (...args: unknown[]) => {
  // Filter out expected warnings
  const message = args[0]
  if (typeof message === 'string') {
    // Skip ethers.js warnings in test environment
    if (message.includes('could not detect network')) return
    if (message.includes('missing response')) return
  }
  originalConsoleWarn(...args)
}

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit process in tests, just log
})

// Global timeout for async operations
const DEFAULT_TIMEOUT = 5000

// Extend Jest matchers with custom matchers for blockchain testing
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
      pass,
    }
  },
})

// Extend Jest timeout for blockchain operations
jest.setTimeout(30000) // 30 seconds

// Setup global test hooks
beforeAll(async () => {
  // One-time setup that applies to all tests
  console.log('🧪 Starting SuperPool Backend Test Suite')

  // Validate test environment
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') {
    throw new Error('Tests must run with NODE_ENV=test')
  }
})

afterAll(async () => {
  // Global cleanup
  console.log('✅ SuperPool Backend Test Suite Complete')

  // Force garbage collection if available
  if (global.gc) {
    global.gc()
  }
})

// Global mock performance monitoring
let mockCallCount = 0
let mockCallStartTime = Date.now()

beforeEach(() => {
  mockCallCount = 0
  mockCallStartTime = Date.now()
})

afterEach(() => {
  // Log performance warnings for slow tests
  const testDuration = Date.now() - mockCallStartTime
  if (testDuration > 5000) {
    console.warn(`⚠️  Slow test detected: ${testDuration}ms (consider optimizing mocks)`)
  }

  if (mockCallCount > 100) {
    console.warn(`⚠️  High mock usage: ${mockCallCount} calls (consider consolidating)`)
  }
})

// Export test utilities for use in individual tests
export const testUtils = {
  timeout: DEFAULT_TIMEOUT,

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
}

// Type augmentation for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidTransactionHash(): R
      toBeValidEthereumAddress(): R
      toBeReasonableGasUsage(max?: number): R
      toHaveFirebaseError(expectedCode: string): R
    }
  }
}
