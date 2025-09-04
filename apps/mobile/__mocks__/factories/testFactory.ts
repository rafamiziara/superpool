/**
 * Test Helper Factory Functions
 *
 * Centralized test utilities and helper functions for consistent testing patterns.
 * Includes render functions, test utilities, and common test data.
 */

import { render, renderHook, RenderOptions, RenderResult } from '@testing-library/react-native'
import React, { ReactElement, ReactNode } from 'react'
import { createMockRootStore } from './storeFactory'

/**
 * Common test utilities and helpers
 */

/**
 * Wait for MobX reactions to settle
 * Useful when testing computed values or reactions
 */
export const waitForMobX = async (timeout = 100): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout)
  })
}

/**
 * Mock Firebase Auth user object for testing
 */
export const createMockFirebaseUser = (overrides: Record<string, unknown> = {}) => ({
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  photoURL: null,
  phoneNumber: null,
  ...overrides,
})

/**
 * Mock Ethereum addresses for testing
 */
export const MOCK_ETH_ADDRESS = '0x1234567890123456789012345678901234567890'
export const MOCK_ETH_ADDRESS_2 = '0x0987654321098765432109876543210987654321'

/**
 * Common test chain IDs
 */
export const TEST_CHAIN_IDS = {
  ETHEREUM_MAINNET: 1,
  POLYGON_MAINNET: 137,
  POLYGON_AMOY: 80002,
  LOCALHOST: 31337,
} as const

/**
 * Test Store Provider Component
 *
 * Provides a mock MobX store context for testing components
 */
interface TestStoreProviderProps {
  children: ReactNode
  store?: ReturnType<typeof createMockRootStore>
}

export const TestStoreProvider: React.FC<TestStoreProviderProps> = ({ children, store = createMockRootStore() }) => {
  // Create a simple context provider for testing
  // This is a simplified version that just passes the store as a prop
  // In real implementation, this would use the actual StoreContext
  const StoreContextProvider = ({ children: contextChildren }: { children: ReactNode }) => {
    // For testing purposes, we'll inject the store via React context
    // This assumes the actual StoreContext is available
    try {
      const { StoreContext } = require('../../src/stores/StoreContext')
      return React.createElement(StoreContext.Provider, { value: store }, contextChildren)
    } catch {
      // Fallback for when StoreContext is not available
      return React.createElement('div', { 'data-testid': 'mock-store-provider' }, contextChildren)
    }
  }

  return React.createElement(StoreContextProvider, null, children)
}

/**
 * Custom render options that includes store configuration
 */
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: ReturnType<typeof createMockRootStore>
  wrapper?: React.ComponentType<{ children: React.ReactNode }>
}

/**
 * Custom render function that wraps components with TestStoreProvider
 * This is the recommended way to render components that use MobX stores in tests
 */
export const renderWithStore = (ui: ReactElement, options: CustomRenderOptions = {}): RenderResult => {
  const { store = createMockRootStore(), wrapper: CustomWrapper, ...renderOptions } = options

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    if (CustomWrapper) {
      return React.createElement(TestStoreProvider, { store, children: React.createElement(CustomWrapper, { children }) })
    }

    return React.createElement(TestStoreProvider, { store, children })
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

/**
 * Custom renderHook function that wraps hooks with TestStoreProvider
 * This is the recommended way to test hooks that use MobX stores
 */
export const renderHookWithStore = <TResult>(hook: () => TResult, options: { store?: ReturnType<typeof createMockRootStore> } = {}) => {
  const { store = createMockRootStore() } = options

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return React.createElement(TestStoreProvider, { store, children })
  }

  return renderHook(() => hook(), { wrapper: Wrapper })
}

/**
 * Higher-order component that wraps a component with TestStoreProvider
 */
export const withMockStore = <P extends object>(Component: React.ComponentType<P>, store?: ReturnType<typeof createMockRootStore>) => {
  const WrappedComponent: React.FC<P> = (props) =>
    React.createElement(TestStoreProvider, { store, children: React.createElement(Component, props) })

  WrappedComponent.displayName = `withMockStore(${Component.displayName || Component.name})`

  return WrappedComponent
}

/**
 * Utility function to create a minimal render for non-store components
 * Use this only when you need to test components that don't use MobX stores
 */
export const renderWithoutStore = render

/**
 * Mock Store Presets for common test scenarios
 */
export const mockStorePresets = {
  // Connected wallet with authenticated user
  authenticatedWithWallet: () =>
    createMockRootStore({
      authenticationStore: {
        authError: null,
        authLock: {
          isLocked: false,
          startTime: 0,
          walletAddress: null,
          abortController: null,
          requestId: null,
        },
      },
      walletStore: {
        isConnected: true,
        address: MOCK_ETH_ADDRESS,
        chainId: 137,
        connectionError: null,
        isConnecting: false,
      },
    }),

  // Unauthenticated user
  unauthenticated: () =>
    createMockRootStore({
      walletStore: {
        isConnected: false,
        address: undefined,
        chainId: undefined,
        connectionError: null,
        isConnecting: false,
      },
    }),

  // Authentication in progress
  authenticating: () =>
    createMockRootStore({
      authenticationStore: {
        authLock: {
          isLocked: true,
          startTime: Date.now(),
          walletAddress: MOCK_ETH_ADDRESS,
          abortController: new AbortController(),
          requestId: 'test-request-id',
        },
      },
    }),

  // Wallet connection in progress
  connectingWallet: () =>
    createMockRootStore({
      walletStore: {
        isConnected: false,
        address: undefined,
        chainId: undefined,
        connectionError: null,
        isConnecting: true,
      },
    }),

  // Error states
  authenticationError: () =>
    createMockRootStore({
      authenticationStore: {
        authError: {
          name: 'AppError',
          message: 'Authentication failed',
          type: 'AUTHENTICATION_FAILED',
          userFriendlyMessage: 'Authentication failed',
          timestamp: new Date(),
        },
      },
    }),

  walletConnectionError: () =>
    createMockRootStore({
      walletStore: {
        isConnected: false,
        address: undefined,
        chainId: undefined,
        connectionError: 'Failed to connect wallet',
        isConnecting: false,
      },
    }),

  // Pool management with data
  poolWithData: () => {
    const mockPool = {
      id: 'test-pool-1',
      name: 'Test Pool',
      description: 'A test pool for unit tests',
      contractAddress: MOCK_ETH_ADDRESS,
      creator: MOCK_ETH_ADDRESS,
      admins: [MOCK_ETH_ADDRESS],
      members: [MOCK_ETH_ADDRESS],
      maxMembers: 10,
      minimumContribution: BigInt(50),
      interestRate: 500,
      loanDuration: 2592000,
      totalLiquidity: BigInt(1000),
      availableLiquidity: BigInt(800),
      totalBorrowed: BigInt(200),
      isActive: true,
      isPaused: false,
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-02'),
    }

    const store = createMockRootStore({
      walletStore: {
        isConnected: true,
        address: MOCK_ETH_ADDRESS,
        chainId: 137,
      },
      poolManagementStore: {
        userAddress: MOCK_ETH_ADDRESS,
      },
    })

    // Add test pool data
    store.poolManagementStore.addPool(mockPool)

    return store
  },

  // Loading states
  loadingPools: () =>
    createMockRootStore({
      poolManagementStore: {
        loading: {
          pools: true,
          loans: false,
          transactions: false,
          memberActions: false,
        },
      },
    }),

  loadingMemberActions: () =>
    createMockRootStore({
      poolManagementStore: {
        loading: {
          pools: false,
          loans: false,
          transactions: false,
          memberActions: true,
        },
      },
    }),
}

/**
 * Re-export store factory functions for convenience
 */
export { createMockRootStore } from './storeFactory'

/**
 * Re-export common testing library functions for convenience
 */
export * from '@testing-library/react-native'

// Override the default render to use renderWithStore by default
export { renderWithStore as render }
