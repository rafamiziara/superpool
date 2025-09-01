// Clean Jest setup for testing hooks, services, and MobX stores

import '@testing-library/jest-dom'
import { configure } from 'mobx'

// Configure MobX for testing environment
configure({
  enforceActions: 'never', // Relax for testing
  computedRequiresReaction: false,
  reactionRequiresObservable: false,
  observableRequiresReaction: false,
  disableErrorBoundaries: false, // Keep error boundaries enabled for testing
  isolateGlobalState: true, // Isolate test state
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
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
  mergeItem: jest.fn(() => Promise.resolve()),
}))

// Mock Expo SecureStore
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

// Mock wagmi hooks
jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    address: undefined,
    addresses: undefined,
    chain: undefined,
    chainId: undefined,
    connector: undefined,
    isConnected: false,
    isReconnecting: false,
    isConnecting: false,
    isDisconnected: true,
    status: 'disconnected',
  })),
  useSignMessage: jest.fn(() => ({
    signMessage: jest.fn().mockResolvedValue('0xmockedsignature'),
    signMessageAsync: jest.fn().mockResolvedValue('0xmockedsignature'),
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
  })),
  useSignTypedData: jest.fn(() => ({
    signTypedData: jest.fn().mockResolvedValue('0xmockedsignature'),
    signTypedDataAsync: jest.fn().mockResolvedValue('0xmockedsignature'),
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
  })),
  useDisconnect: jest.fn(() => ({
    disconnect: jest.fn().mockResolvedValue(undefined),
    disconnectAsync: jest.fn().mockResolvedValue(undefined),
    error: null,
    isLoading: false,
    isError: false,
    isSuccess: false,
  })),
}))

// Mock toast utilities
jest.mock('./utils/toast', () => ({
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
  showErrorFromAppError: jest.fn(),
  showSuccessToast: jest.fn(),
  showErrorToast: jest.fn(),
  showInfoToast: jest.fn(),
  showWarningToast: jest.fn(),
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
