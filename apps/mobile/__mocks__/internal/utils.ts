/**
 * Internal Utility Mocks
 *
 * Consolidated mocks for internal utility modules extracted from setupTests.ts
 */

// Toast utilities mock
export const toast = {
  authToasts: {
    walletConnected: jest.fn(),
    authSuccess: jest.fn(),
    success: jest.fn(),
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
  showErrorFromAppError: jest.fn(),
  showSuccessToast: jest.fn(),
  showErrorToast: jest.fn(),
  showInfoToast: jest.fn(),
  showWarningToast: jest.fn(),
}

// Firebase Auth Manager mock
export const firebaseAuthManager = {
  firebaseAuthManager: {
    getCurrentState: jest.fn(() => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      walletAddress: null,
    })),
    addListener: jest.fn((callback) => {
      callback({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        walletAddress: null,
      })
      return jest.fn() // cleanup function
    }),
  },
  FirebaseAuthState: {},
}

// Default export combining all utility mocks
export default {
  toast,
  firebaseAuthManager,
}
