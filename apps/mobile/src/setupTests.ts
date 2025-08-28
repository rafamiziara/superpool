// Clean Jest setup for testing hooks, services, and MobX stores

import '@testing-library/jest-dom'
import { configure } from 'mobx'

// Configure MobX for testing environment
configure({
  enforceActions: 'never', // Relax for testing
  computedRequiresReaction: false,
  reactionRequiresObservable: false,
  observableRequiresReaction: false,
  disableErrorBoundaries: true,
})

// Mock Firebase modules (minimal essential mocks only)
jest.mock('firebase/auth', () => ({
  signInWithCustomToken: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  User: {},
}))

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(() => jest.fn()),
  getFunctions: jest.fn(),
}))

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => []),
  getApp: jest.fn(),
}))

// Mock React Native AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}))

// Mock Expo SecureStore
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

// Mock toast utilities
jest.mock('./utils/toast', () => ({
  authToasts: {
    connecting: jest.fn(),
    walletAppGuidance: jest.fn(),
    signingMessage: jest.fn(),
    verifying: jest.fn(),
    success: jest.fn(),
    sessionError: jest.fn(),
  },
  appToasts: {
    walletConnected: jest.fn(),
    walletDisconnected: jest.fn(),
  },
  showErrorFromAppError: jest.fn(),
}))

// Mock Firebase auth manager
jest.mock('./utils/firebaseAuthManager', () => ({
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
}))

// Global test timeout
jest.setTimeout(10000)
