/**
 * Comprehensive test suite for StoreContext.tsx
 * Tests all exports: context, provider, hooks, and root store instance
 */

import { render, renderHook } from '@testing-library/react-native'
import React from 'react'
import { Text } from 'react-native'
import {
  rootStore,
  StoreContext,
  StoreProvider,
  useAuthenticationStore,
  usePoolManagementStore,
  useStore,
  useStores,
  useUIStore,
  useWalletStore,
} from './StoreContext'

// Mock RootStore to prevent actual instantiation
jest.mock('./RootStore', () => {
  const mockAuthStore = {
    isAuthenticating: false,
    startStep: jest.fn(),
    completeStep: jest.fn(),
    authError: null,
    reset: jest.fn(),
  }

  const mockWalletStore = {
    isConnected: false,
    address: undefined,
    connect: jest.fn(),
    connectionError: null,
    isConnecting: false,
    reset: jest.fn(),
  }

  const mockPoolStore = {
    pools: [],
    loadPools: jest.fn(),
    error: null,
    loading: {},
    reset: jest.fn(),
    setUserAddress: jest.fn(),
  }

  const mockUIStore = {
    onboardingCurrentIndex: 0,
    setOnboardingIndex: jest.fn(),
    resetOnboardingState: jest.fn(),
  }

  const mockRootStore = {
    authenticationStore: mockAuthStore,
    walletStore: mockWalletStore,
    poolManagementStore: mockPoolStore,
    uiStore: mockUIStore,
    reset: jest.fn(),
    setUserContext: jest.fn(),
    get currentUserAddress() {
      return this.walletStore.address || null
    },
    get isLoading() {
      return (
        this.authenticationStore.isAuthenticating ||
        this.walletStore.isConnecting ||
        Object.values(this.poolManagementStore.loading).some((loading) => loading)
      )
    },
    get hasErrors() {
      return !!(this.authenticationStore.authError || this.walletStore.connectionError || this.poolManagementStore.error)
    },
    get allErrors() {
      const errors: string[] = []
      if (this.authenticationStore.authError && this.authenticationStore.authError.message) {
        errors.push(this.authenticationStore.authError.message)
      }
      if (this.walletStore.connectionError) errors.push(this.walletStore.connectionError)
      if (this.poolManagementStore.error) errors.push(this.poolManagementStore.error)
      return errors
    },
  }

  return {
    RootStore: jest.fn().mockImplementation(() => mockRootStore),
  }
})

describe('StoreContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('StoreContext', () => {
    it('should export StoreContext for testing', () => {
      expect(StoreContext).toBeDefined()
      expect(typeof StoreContext).toBe('object')
    })

    it('should have null as default context value', () => {
      // Test the default context value by using it without provider
      const TestComponent = () => {
        const context = React.useContext(StoreContext)
        return <Text testID="context-value">{context ? 'has-value' : 'null-value'}</Text>
      }

      const { getByTestId } = render(<TestComponent />)

      expect(getByTestId('context-value')).toHaveProp('children', 'null-value')
    })
  })

  describe('StoreProvider', () => {
    it('should provide store context to children', () => {
      const TestChild = () => {
        const store = React.useContext(StoreContext)
        return <Text testID="child">{store ? 'store-provided' : 'no-store'}</Text>
      }

      const { getByTestId } = render(
        <StoreProvider>
          <TestChild />
        </StoreProvider>
      )

      expect(getByTestId('child')).toHaveProp('children', 'store-provided')
    })

    it('should render children correctly', () => {
      const { getByTestId } = render(
        <StoreProvider>
          <Text testID="test-child">Child Component</Text>
        </StoreProvider>
      )

      expect(getByTestId('test-child')).toHaveProp('children', 'Child Component')
    })

    it('should provide the same root store instance', () => {
      let capturedStore1: unknown
      let capturedStore2: unknown

      const TestChild1 = () => {
        capturedStore1 = React.useContext(StoreContext)
        return <Text testID="child1">Child 1</Text>
      }

      const TestChild2 = () => {
        capturedStore2 = React.useContext(StoreContext)
        return <Text testID="child2">Child 2</Text>
      }

      render(
        <StoreProvider>
          <TestChild1 />
          <TestChild2 />
        </StoreProvider>
      )

      expect(capturedStore1).toBe(capturedStore2)
      expect(capturedStore1).toBeTruthy()
    })

    it('should handle multiple children', () => {
      const { getByTestId } = render(
        <StoreProvider>
          <Text testID="child1">Child 1</Text>
          <Text testID="child2">Child 2</Text>
          <Text testID="child3">Child 3</Text>
        </StoreProvider>
      )

      expect(getByTestId('child1')).toBeTruthy()
      expect(getByTestId('child2')).toBeTruthy()
      expect(getByTestId('child3')).toBeTruthy()
    })

    it('should handle React.Fragment children', () => {
      const { getByTestId } = render(
        <StoreProvider>
          <>
            <Text testID="fragment-child1">Fragment Child 1</Text>
            <Text testID="fragment-child2">Fragment Child 2</Text>
          </>
        </StoreProvider>
      )

      expect(getByTestId('fragment-child1')).toBeTruthy()
      expect(getByTestId('fragment-child2')).toBeTruthy()
    })
  })

  describe('useStore hook', () => {
    it('should return root store when used within StoreProvider', () => {
      const { result } = renderHook(() => useStore(), {
        wrapper: StoreProvider,
      })

      expect(result.current).toBeTruthy()
      expect(result.current).toHaveProperty('authenticationStore')
      expect(result.current).toHaveProperty('walletStore')
      expect(result.current).toHaveProperty('poolManagementStore')
      expect(result.current).toHaveProperty('uiStore')
    })

    it('should throw error when used outside StoreProvider', () => {
      expect(() => {
        renderHook(() => useStore())
      }).toThrow('useStore must be used within a StoreProvider')
    })

    it('should throw error with exact message', () => {
      expect(() => {
        renderHook(() => useStore())
      }).toThrow('useStore must be used within a StoreProvider')
    })

    it('should work with nested providers', () => {
      const NestedProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
        <StoreProvider>
          <StoreProvider>{children}</StoreProvider>
        </StoreProvider>
      )

      const { result } = renderHook(() => useStore(), {
        wrapper: NestedProvider,
      })

      expect(result.current).toBeTruthy()
      expect(result.current).toHaveProperty('authenticationStore')
      expect(result.current).toHaveProperty('walletStore')
      expect(result.current).toHaveProperty('poolManagementStore')
      expect(result.current).toHaveProperty('uiStore')
    })
  })

  describe('useAuthenticationStore hook', () => {
    it('should return authenticationStore from root store', () => {
      const { result } = renderHook(() => useAuthenticationStore(), {
        wrapper: StoreProvider,
      })

      expect(result.current).toBeDefined()
      expect(result.current.isAuthenticating).toBe(false)
      expect(result.current.startStep).toBeDefined()
      expect(result.current.completeStep).toBeDefined()
    })

    it('should throw error when used outside StoreProvider', () => {
      expect(() => {
        renderHook(() => useAuthenticationStore())
      }).toThrow('useStore must be used within a StoreProvider')
    })

    it('should provide access to authentication store methods', () => {
      const { result } = renderHook(() => useAuthenticationStore(), {
        wrapper: StoreProvider,
      })

      expect(result.current.startStep).toBeDefined()
      expect(result.current.completeStep).toBeDefined()
      expect(result.current.isAuthenticating).toBe(false)
    })
  })

  describe('useWalletStore hook', () => {
    it('should return walletStore from root store', () => {
      const { result } = renderHook(() => useWalletStore(), {
        wrapper: StoreProvider,
      })

      expect(result.current).toBeDefined()
      expect(result.current.isConnected).toBe(false)
      expect(result.current.connect).toBeDefined()
      expect(result.current.address).toBeUndefined()
    })

    it('should throw error when used outside StoreProvider', () => {
      expect(() => {
        renderHook(() => useWalletStore())
      }).toThrow('useStore must be used within a StoreProvider')
    })

    it('should provide access to wallet store properties', () => {
      const { result } = renderHook(() => useWalletStore(), {
        wrapper: StoreProvider,
      })

      expect(result.current.connect).toBeDefined()
      expect(result.current.isConnected).toBe(false)
      expect(result.current.address).toBeUndefined()
    })
  })

  describe('usePoolManagementStore hook', () => {
    it('should return poolManagementStore from root store', () => {
      const { result } = renderHook(() => usePoolManagementStore(), {
        wrapper: StoreProvider,
      })

      expect(result.current).toBeDefined()
      expect(result.current.pools).toEqual([])
      expect(result.current.loadPools).toBeDefined()
    })

    it('should throw error when used outside StoreProvider', () => {
      expect(() => {
        renderHook(() => usePoolManagementStore())
      }).toThrow('useStore must be used within a StoreProvider')
    })

    it('should provide access to pool management store properties', () => {
      const { result } = renderHook(() => usePoolManagementStore(), {
        wrapper: StoreProvider,
      })

      expect(result.current.loadPools).toBeDefined()
      expect(result.current.pools).toEqual([])
    })
  })

  describe('useUIStore hook', () => {
    it('should return uiStore from root store', () => {
      const { result } = renderHook(() => useUIStore(), {
        wrapper: StoreProvider,
      })

      expect(result.current).toBeDefined()
      expect(result.current.onboardingCurrentIndex).toBe(0)
      expect(result.current.setOnboardingIndex).toBeDefined()
    })

    it('should throw error when used outside StoreProvider', () => {
      expect(() => {
        renderHook(() => useUIStore())
      }).toThrow('useStore must be used within a StoreProvider')
    })

    it('should provide access to UI store properties', () => {
      const { result } = renderHook(() => useUIStore(), {
        wrapper: StoreProvider,
      })

      expect(result.current.setOnboardingIndex).toBeDefined()
      expect(result.current.onboardingCurrentIndex).toBe(0)
    })
  })

  describe('useStores hook', () => {
    it('should return all stores and root store', () => {
      const { result } = renderHook(() => useStores(), {
        wrapper: StoreProvider,
      })

      const stores = result.current
      expect(stores.authenticationStore).toBeDefined()
      expect(stores.walletStore).toBeDefined()
      expect(stores.poolManagementStore).toBeDefined()
      expect(stores.uiStore).toBeDefined()
      expect(stores.rootStore).toBeDefined()

      // Check that individual stores have expected properties
      expect(stores.authenticationStore.isAuthenticating).toBe(false)
      expect(stores.walletStore.isConnected).toBe(false)
      expect(stores.poolManagementStore.pools).toEqual([])
      expect(stores.uiStore.onboardingCurrentIndex).toBe(0)
    })

    it('should throw error when used outside StoreProvider', () => {
      expect(() => {
        renderHook(() => useStores())
      }).toThrow('useStore must be used within a StoreProvider')
    })

    it('should provide access to all individual stores', () => {
      const { result } = renderHook(() => useStores(), {
        wrapper: StoreProvider,
      })

      const stores = result.current

      expect(stores.authenticationStore).toBeDefined()
      expect(stores.walletStore).toBeDefined()
      expect(stores.poolManagementStore).toBeDefined()
      expect(stores.uiStore).toBeDefined()
      expect(stores.rootStore).toBeDefined()

      // Verify that all store methods are available
      expect(typeof stores.authenticationStore.startStep).toBe('function')
      expect(typeof stores.walletStore.connect).toBe('function')
      expect(typeof stores.poolManagementStore.loadPools).toBe('function')
      expect(typeof stores.uiStore.setOnboardingIndex).toBe('function')
    })

    it('should maintain store references across re-renders', () => {
      const { result, rerender } = renderHook(() => useStores(), {
        wrapper: StoreProvider,
      })

      const initialStores = result.current

      rerender(undefined)

      expect(result.current.authenticationStore).toBe(initialStores.authenticationStore)
      expect(result.current.walletStore).toBe(initialStores.walletStore)
      expect(result.current.poolManagementStore).toBe(initialStores.poolManagementStore)
      expect(result.current.uiStore).toBe(initialStores.uiStore)
      expect(result.current.rootStore).toBe(initialStores.rootStore)
    })
  })

  describe('rootStore export', () => {
    it('should export the root store instance', () => {
      expect(rootStore).toBeDefined()
      expect(rootStore).toHaveProperty('authenticationStore')
      expect(rootStore).toHaveProperty('walletStore')
      expect(rootStore).toHaveProperty('poolManagementStore')
      expect(rootStore).toHaveProperty('uiStore')
    })

    it('should be the same instance provided by StoreProvider', () => {
      let capturedStore: unknown

      const TestComponent = () => {
        capturedStore = React.useContext(StoreContext)
        return <Text>Test</Text>
      }

      render(
        <StoreProvider>
          <TestComponent />
        </StoreProvider>
      )

      expect(capturedStore).toBe(rootStore)
    })

    it('should maintain singleton pattern', () => {
      // Import the module multiple times to verify singleton
      const { rootStore: rootStore1 } = require('./StoreContext')
      const { rootStore: rootStore2 } = require('./StoreContext')

      expect(rootStore1).toBe(rootStore2)
      expect(rootStore1).toBe(rootStore)
    })
  })

  describe('Integration scenarios', () => {
    it('should allow multiple components to access different stores', () => {
      const AuthComponent = () => {
        const authStore = useAuthenticationStore()
        return <Text testID="auth">{authStore.isAuthenticating ? 'authenticated' : 'not-authenticated'}</Text>
      }

      const WalletComponent = () => {
        const walletStore = useWalletStore()
        return <Text testID="wallet">{walletStore.isConnected ? 'connected' : 'not-connected'}</Text>
      }

      const { getByTestId } = render(
        <StoreProvider>
          <AuthComponent />
          <WalletComponent />
        </StoreProvider>
      )

      expect(getByTestId('auth')).toHaveProp('children', 'not-authenticated')
      expect(getByTestId('wallet')).toHaveProp('children', 'not-connected')
    })

    it('should work with components that use useStores', () => {
      const MultiStoreComponent = () => {
        const { authenticationStore, walletStore } = useStores()
        const authText = authenticationStore.isAuthenticating ? 'yes' : 'no'
        const walletText = walletStore.isConnected ? 'yes' : 'no'
        return <Text testID="multi-store">{`Auth: ${authText}, Wallet: ${walletText}`}</Text>
      }

      const { getByTestId } = render(
        <StoreProvider>
          <MultiStoreComponent />
        </StoreProvider>
      )

      expect(getByTestId('multi-store')).toHaveProp('children', 'Auth: no, Wallet: no')
    })

    it('should handle deeply nested components', () => {
      const DeepChild = () => {
        const store = useStore()
        return <Text testID="deep-child">{store ? 'has-store' : 'no-store'}</Text>
      }

      const MiddleComponent = () => (
        <Text testID="middle">
          Middle
          <DeepChild />
        </Text>
      )

      const { getByTestId } = render(
        <StoreProvider>
          <MiddleComponent />
        </StoreProvider>
      )

      expect(getByTestId('deep-child')).toHaveProp('children', 'has-store')
      expect(getByTestId('middle')).toBeTruthy()
    })

    it('should support conditional rendering with stores', () => {
      const ConditionalComponent = () => {
        const { authenticationStore } = useStores()

        if (authenticationStore.isAuthenticating) {
          return <Text testID="authenticated">Authenticated Content</Text>
        }

        return <Text testID="not-authenticated">Login Required</Text>
      }

      const { getByTestId } = render(
        <StoreProvider>
          <ConditionalComponent />
        </StoreProvider>
      )

      expect(getByTestId('not-authenticated')).toHaveProp('children', 'Login Required')
    })
  })

  describe('Error boundaries and edge cases', () => {
    it('should handle errors in hook usage gracefully', () => {
      // Test that the error is thrown synchronously and can be caught
      expect(() => {
        const TestComponent = () => {
          useStore() // This will throw
          return <Text>Should not render</Text>
        }

        render(<TestComponent />)
      }).toThrow('useStore must be used within a StoreProvider')
    })

    it('should handle null context value explicitly', () => {
      const TestComponent = () => {
        const context = React.useContext(StoreContext)

        if (!context) {
          return <Text testID="null-context">No store available</Text>
        }

        return <Text testID="has-context">Store available</Text>
      }

      const { getByTestId } = render(<TestComponent />)

      expect(getByTestId('null-context')).toHaveProp('children', 'No store available')
    })

    it('should maintain context across re-renders', () => {
      let renderCount = 0

      const TestComponent = () => {
        renderCount++
        useStore()
        return <Text testID="render-count">{renderCount.toString()}</Text>
      }

      const { rerender, getByTestId } = render(
        <StoreProvider>
          <TestComponent />
        </StoreProvider>
      )

      expect(getByTestId('render-count')).toHaveProp('children', '1')

      rerender(
        <StoreProvider>
          <TestComponent />
        </StoreProvider>
      )

      expect(getByTestId('render-count')).toHaveProp('children', '2')
    })
  })

  describe('TypeScript and type safety', () => {
    it('should maintain proper TypeScript types', () => {
      const TypeTestComponent = () => {
        // These should not cause TypeScript errors and should have proper typing
        const store = useStore()
        const authStore = useAuthenticationStore()
        const walletStore = useWalletStore()
        const poolStore = usePoolManagementStore()
        const uiStore = useUIStore()
        const allStores = useStores()

        // Verify type-safe access
        expect(typeof store.authenticationStore).toBe('object')
        expect(typeof authStore.isAuthenticating).toBe('boolean')
        expect(typeof walletStore.isConnected).toBe('boolean')
        expect(Array.isArray(poolStore.pools)).toBe(true)
        expect(typeof uiStore.onboardingCurrentIndex).toBe('number')
        expect(typeof allStores.rootStore).toBe('object')

        return <Text testID="type-test">Type test passed</Text>
      }

      const { getByTestId } = render(
        <StoreProvider>
          <TypeTestComponent />
        </StoreProvider>
      )

      expect(getByTestId('type-test')).toHaveProp('children', 'Type test passed')
    })
  })
})
