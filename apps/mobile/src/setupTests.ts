// Comprehensive Jest setup for testing hooks and services

// Mock React Native modules
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Dimensions: { get: jest.fn(() => ({ width: 375, height: 812 })) },
}))

// Mock Wagmi hooks
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
  useConnect: jest.fn(() => ({
    connect: jest.fn(),
    connectors: [],
    isLoading: false,
    error: null,
  })),
  useDisconnect: jest.fn(() => ({
    disconnect: jest.fn(),
  })),
}))

// Mock Firebase modules
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

// Mock React Native modules
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}))

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
  hide: jest.fn(),
}))

// Mock Expo modules
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
