/**
 * Minimal test setup - SuperPool Backend
 * Following mobile app philosophy: minimal mocking, real logic testing
 */

// Mock only unavoidable external dependencies
export const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}

// Mock Firebase Functions SDK (unavoidable external dependency)
jest.mock('firebase-functions/v2', () => ({
  logger: mockLogger,
}))

jest.mock('firebase-functions', () => ({
  logger: mockLogger,
}))

// Mock Firebase Admin initialization (uses service account)
jest.mock('../services/firebase', () => ({
  auth: {
    createCustomToken: jest.fn(),
  },
  firestore: {
    collection: jest.fn(),
  },
  appCheck: {
    createToken: jest.fn(),
  },
}))

// Mock uuid for deterministic nonces
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-nonce-uuid'),
}))

// Suppress expected warnings
const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  const message = String(args[0])
  if (message.includes('Firebase Admin') || message.includes('FIREBASE_CONFIG')) return
  originalConsoleError(...args)
}
