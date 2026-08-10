import { AppCheckToken, CustomProviderOptions } from 'firebase/app-check'
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

export const mockWriteContractAsync = jest.fn()
export const mockEstimateContractGas = jest.fn()
export const mockWaitForTransactionReceipt = jest.fn()
export const mockGetTransactionReceipt = jest.fn()

export const mockWagmiUseWriteContract = jest.fn(() => ({
  writeContractAsync: mockWriteContractAsync,
  isPending: false,
}))

export type MockPublicClient = {
  chain?: { id: number }
  estimateContractGas: jest.Mock
  waitForTransactionReceipt: jest.Mock
  getTransactionReceipt: jest.Mock
}

export const mockWagmiUsePublicClient = jest.fn((): MockPublicClient | undefined => ({
  chain: { id: 31337 },
  estimateContractGas: mockEstimateContractGas,
  waitForTransactionReceipt: mockWaitForTransactionReceipt,
  getTransactionReceipt: mockGetTransactionReceipt,
}))

// Firebase service mocks
export const mockFirebaseAuth = {
  getReactNativePersistence: jest.fn(() => ({})),
  initializeAuth: jest.fn(() => ({ currentUser: null })),
  connectAuthEmulator: jest.fn(),
  signInWithCustomToken: jest.fn().mockResolvedValue({ user: { uid: 'test' } }),
  signOut: jest.fn().mockResolvedValue(undefined),
  onAuthStateChanged: jest.fn((_, callback) => {
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
  usePublicClient: mockWagmiUsePublicClient,
  useWriteContract: mockWagmiUseWriteContract,
  WagmiProvider: mockWagmiProvider,
}))

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({ name: 'test-app' })),
}))

jest.mock('firebase/app-check', () => ({
  initializeAppCheck: jest.fn(() => ({})),
  CustomProvider: class CustomProvider {
    private _getToken: () => Promise<AppCheckToken>

    constructor(options: CustomProviderOptions) {
      this._getToken = options.getToken
    }

    getToken(): Promise<AppCheckToken> {
      return this._getToken()
    }
  },
}))

jest.mock('firebase/auth', () => mockFirebaseAuth)

jest.mock('firebase/functions', () => ({
  httpsCallable: mockFirebaseCallable,
  getFunctions: jest.fn(() => ({})),
  connectFunctionsEmulator: jest.fn(),
}))

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  connectFirestoreEmulator: jest.fn(),
}))

jest.mock('react-native-toast-message', () => ({
  default: mockToast,
  show: mockToast.show,
}))
