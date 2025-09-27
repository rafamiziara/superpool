import React from 'react'
import type { Address } from 'viem'

// Wagmi hooks mocks
export const mockWagmiUseAccount = jest.fn(() => ({
  isConnected: false,
  isConnecting: false,
  address: undefined as Address | undefined,
  chainId: undefined as number | undefined,
}))

export const mockWagmiUseSignMessage = jest.fn(() => ({
  signMessageAsync: jest.fn().mockResolvedValue('0xsignature'),
  isPending: false,
}))

// Firebase service mocks
export const mockFirebaseAuth = {
  getReactNativePersistence: jest.fn(() => ({})),
  initializeAuth: jest.fn(() => ({ currentUser: null })),
  connectAuthEmulator: jest.fn(),
  signInWithCustomToken: jest.fn().mockResolvedValue({ user: { uid: 'test' } }),
  signOut: jest.fn().mockResolvedValue(undefined),
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback(null) // Default to not authenticated
    return jest.fn() // Return unsubscribe function
  }),
  authStateReady: jest.fn().mockResolvedValue(undefined),
}

export const mockFirebaseCallable = jest.fn(() =>
  jest.fn().mockResolvedValue({
    data: { message: 'test', nonce: '123', timestamp: Date.now(), expiresAt: new Date().toISOString() },
  })
)

// Toast mock
export const mockToast = {
  show: jest.fn(),
  hide: jest.fn(),
}

// Global mocks
// Wagmi Provider mock
export const mockWagmiProvider = ({ children }: { children: React.ReactNode }) => children

jest.mock('wagmi', () => ({
  useAccount: mockWagmiUseAccount,
  useSignMessage: mockWagmiUseSignMessage,
  WagmiProvider: mockWagmiProvider,
}))

jest.mock('firebase/auth', () => mockFirebaseAuth)

jest.mock('firebase/functions', () => ({
  httpsCallable: mockFirebaseCallable,
  getFunctions: jest.fn(() => ({})),
}))

jest.mock('react-native-toast-message', () => ({
  default: mockToast,
  show: mockToast.show,
}))
