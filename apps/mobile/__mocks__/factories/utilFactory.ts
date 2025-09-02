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

// Firebase Auth Manager Factory
export const createMockFirebaseAuthManager = (
  overrides: Partial<{
    getCurrentState: jest.Mock
    addListener: jest.Mock
    isAuthenticated: boolean
    user: unknown
  }> = {}
) => ({
  getCurrentState: jest.fn(() => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    walletAddress: null,
    ...overrides,
  })),
  addListener: jest.fn((callback) => {
    callback({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      walletAddress: null,
      ...overrides,
    })
    return jest.fn() // cleanup function
  }),
})

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
