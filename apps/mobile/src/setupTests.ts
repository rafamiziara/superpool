// Basic Jest setup for testing utility classes and services

// Mock Firebase (only when needed)
jest.mock('firebase/auth', () => ({
  signInWithCustomToken: jest.fn(),
  signOut: jest.fn(),
}))

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => jest.fn()),
}))

// Mock toast utilities (only when needed)
jest.mock('./utils/toast', () => ({
  authToasts: {
    connecting: jest.fn(),
    walletAppGuidance: jest.fn(),
    signingMessage: jest.fn(),
    verifying: jest.fn(),
    success: jest.fn(),
    sessionError: jest.fn(),
  },
  showErrorFromAppError: jest.fn(),
}))

// Global test timeout
jest.setTimeout(10000)