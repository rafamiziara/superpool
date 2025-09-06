/**
 * Utility Mock Factory Functions
 *
 * Reusable factory functions for creating mock utility instances with custom configurations
 */

// Toast Factory
export const createMockToast = (
  overrides: Partial<{
    showSuccess: jest.Mock
    showError: jest.Mock
    showInfo: jest.Mock
    showWarning: jest.Mock
  }> = {}
) => ({
  showSuccess: jest.fn(),
  showError: jest.fn(),
  showInfo: jest.fn(),
  showWarning: jest.fn(),
  authToasts: {
    walletConnected: jest.fn(),
    authSuccess: jest.fn(),
    walletDisconnected: jest.fn(),
    connectionFailed: jest.fn(),
    signatureRejected: jest.fn(),
    networkMismatch: jest.fn(),
    sessionRecovery: jest.fn(),
    sessionExpired: jest.fn(),
  },
  appToasts: {
    operationSuccess: jest.fn(),
    operationFailed: jest.fn(),
    loading: jest.fn(),
    dataSaved: jest.fn(),
    dataLoaded: jest.fn(),
    validationError: jest.fn(),
    permissionDenied: jest.fn(),
    offline: jest.fn(),
    online: jest.fn(),
  },
  ...overrides,
})

// Firebase Auth Manager Factory - moved to serviceFactory.ts
// Re-export for backward compatibility
export { createMockFirebaseAuthManager } from './serviceFactory'

// Storage Factory (AsyncStorage/SecureStore)
export const createMockStorage = (
  overrides: Partial<{
    getItem: jest.Mock
    setItem: jest.Mock
    removeItem: jest.Mock
    clear: jest.Mock
  }> = {}
) => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  ...overrides,
})

// Session Manager Factory - moved to serviceFactory.ts
// Re-export for backward compatibility
export { createMockSessionManager } from './serviceFactory'

// Auth Toasts Factory
export const createMockAuthToasts = (
  overrides: Partial<{
    walletConnected: jest.Mock
    authSuccess: jest.Mock
    walletDisconnected: jest.Mock
    connectionFailed: jest.Mock
    signatureRejected: jest.Mock
    networkMismatch: jest.Mock
    sessionRecovery: jest.Mock
    sessionExpired: jest.Mock
  }> = {}
) => ({
  walletConnected: jest.fn(),
  authSuccess: jest.fn(),
  walletDisconnected: jest.fn(),
  connectionFailed: jest.fn(),
  signatureRejected: jest.fn(),
  networkMismatch: jest.fn(),
  sessionRecovery: jest.fn(),
  sessionExpired: jest.fn(),
  ...overrides,
})
