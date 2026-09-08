/**
 * Minimal test setup - SuperPool Backend
 * Following mobile app philosophy: minimal mocking, real logic testing
 */

// The hoisted binding cannot itself be exported — Vitest rejects that outright — so the
// value is hoisted under one name and re-exported under another. `vi.mock` factories are
// hoisted above everything else in the module and so cannot close over an ordinary
// `const`; jest allowed it only because its hoist plugin whitelists identifiers beginning
// with "mock", which is why this was called mockLogger. Three test files import it.
const hoisted = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

export const mockLogger = hoisted.mockLogger

// Mock Firebase Functions SDK (unavoidable external dependency)
vi.mock('firebase-functions/v2', () => ({
  logger: hoisted.mockLogger,
}))

vi.mock('firebase-functions', () => ({
  logger: hoisted.mockLogger,
}))

// Mock Firebase Admin initialization (uses service account)
vi.mock('../config/firebase', () => ({
  auth: {
    createCustomToken: vi.fn(),
  },
  firestore: {
    collection: vi.fn(),
  },
  appCheck: {
    createToken: vi.fn(),
  },
}))

// Mock uuid for deterministic nonces
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-nonce-uuid'),
}))

// Suppress expected warnings
const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  const message = String(args[0])
  if (message.includes('Firebase Admin') || message.includes('FIREBASE_CONFIG')) return
  originalConsoleError(...args)
}
