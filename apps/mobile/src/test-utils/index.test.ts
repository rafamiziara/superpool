/**
 * Comprehensive test suite for test-utils index module
 * Tests all exported utilities, constants, and helper functions
 */

import {
  // Re-exported from mockStores
  createMockAuthenticationStore,
  createMockWalletStore,
  createMockPoolManagementStore,
  createMockUIStore,
  createMockRootStore,
  mockStorePresets,
  
  // Re-exported from testProviders
  TestStoreProvider,
  withMockStore,
  
  // Re-exported from renderWithStore
  renderWithStore,
  renderHookWithStore,
  renderWithoutStore,
  
  // Direct exports
  waitForMobX,
  createMockFirebaseUser,
  MOCK_ETH_ADDRESS,
  MOCK_ETH_ADDRESS_2,
  TEST_CHAIN_IDS,
} from './index'

// Import the actual modules to verify re-exports
import * as mockStores from './mockStores'
import * as testProviders from './testProviders'
import * as renderWithStoreModule from './renderWithStore'

describe('test-utils index', () => {
  describe('re-exports from mockStores', () => {
    it('should re-export createMockAuthenticationStore', () => {
      expect(createMockAuthenticationStore).toBe(mockStores.createMockAuthenticationStore)
    })

    it('should re-export createMockWalletStore', () => {
      expect(createMockWalletStore).toBe(mockStores.createMockWalletStore)
    })

    it('should re-export createMockPoolManagementStore', () => {
      expect(createMockPoolManagementStore).toBe(mockStores.createMockPoolManagementStore)
    })

    it('should re-export createMockUIStore', () => {
      expect(createMockUIStore).toBe(mockStores.createMockUIStore)
    })

    it('should re-export createMockRootStore', () => {
      expect(createMockRootStore).toBe(mockStores.createMockRootStore)
    })

    it('should re-export mockStorePresets', () => {
      expect(mockStorePresets).toBe(mockStores.mockStorePresets)
    })
  })

  describe('re-exports from testProviders', () => {
    it('should re-export TestStoreProvider', () => {
      expect(TestStoreProvider).toBe(testProviders.TestStoreProvider)
    })

    it('should re-export withMockStore', () => {
      expect(withMockStore).toBe(testProviders.withMockStore)
    })
  })

  describe('re-exports from renderWithStore', () => {
    it('should re-export renderWithStore', () => {
      expect(renderWithStore).toBe(renderWithStoreModule.renderWithStore)
    })

    it('should re-export renderHookWithStore', () => {
      expect(renderHookWithStore).toBe(renderWithStoreModule.renderHookWithStore)
    })

    it('should re-export renderWithoutStore', () => {
      expect(renderWithoutStore).toBe(renderWithStoreModule.renderWithoutStore)
    })
  })

  describe('waitForMobX utility', () => {
    beforeEach(() => {
      jest.clearAllTimers()
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should wait for default timeout of 100ms', async () => {
      const promise = waitForMobX()
      
      expect(jest.getTimerCount()).toBe(1)
      
      jest.advanceTimersByTime(100)
      await expect(promise).resolves.toBeUndefined()
    })

    it('should wait for custom timeout', async () => {
      const customTimeout = 250
      const promise = waitForMobX(customTimeout)
      
      expect(jest.getTimerCount()).toBe(1)
      
      // Should resolve after timeout
      jest.advanceTimersByTime(customTimeout)
      await expect(promise).resolves.toBeUndefined()
    })

    it('should return a Promise<void>', async () => {
      const result = waitForMobX()
      
      expect(result).toBeInstanceOf(Promise)
      
      jest.advanceTimersByTime(100)
      const resolvedValue = await result
      expect(resolvedValue).toBeUndefined()
    })

    it('should work with zero timeout', async () => {
      const promise = waitForMobX(0)
      
      jest.advanceTimersByTime(0)
      await expect(promise).resolves.toBeUndefined()
    })

    it('should work with very large timeout', async () => {
      const largeTimeout = 10000
      const promise = waitForMobX(largeTimeout)
      
      expect(jest.getTimerCount()).toBe(1)
      
      jest.advanceTimersByTime(largeTimeout)
      await expect(promise).resolves.toBeUndefined()
    })

    it('should work in real-time scenarios', async () => {
      jest.useRealTimers()
      
      const startTime = Date.now()
      const timeout = 50
      
      await waitForMobX(timeout)
      
      const endTime = Date.now()
      const elapsed = endTime - startTime
      
      // Should take approximately the specified timeout
      // Allow for some tolerance in timing
      expect(elapsed).toBeGreaterThanOrEqual(timeout - 10)
      expect(elapsed).toBeLessThan(timeout + 50)
    })
  })

  describe('createMockFirebaseUser utility', () => {
    it('should create mock user with default values', () => {
      const mockUser = createMockFirebaseUser()
      
      expect(mockUser).toEqual({
        uid: 'test-user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        photoURL: null,
        phoneNumber: null,
      })
    })

    it('should apply overrides to default values', () => {
      const overrides = {
        uid: 'custom-user-id',
        email: 'custom@example.com',
        displayName: 'Custom User',
        emailVerified: false,
      }
      
      const mockUser = createMockFirebaseUser(overrides)
      
      expect(mockUser).toEqual({
        uid: 'custom-user-id',
        email: 'custom@example.com',
        displayName: 'Custom User',
        emailVerified: false,
        photoURL: null,
        phoneNumber: null,
      })
    })

    it('should handle partial overrides', () => {
      const overrides = {
        photoURL: 'https://example.com/photo.jpg',
        phoneNumber: '+1234567890',
      }
      
      const mockUser = createMockFirebaseUser(overrides)
      
      expect(mockUser).toEqual({
        uid: 'test-user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        photoURL: 'https://example.com/photo.jpg',
        phoneNumber: '+1234567890',
      })
    })

    it('should handle empty overrides', () => {
      const mockUser = createMockFirebaseUser({})
      
      expect(mockUser).toEqual({
        uid: 'test-user-id',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        photoURL: null,
        phoneNumber: null,
      })
    })

    it('should handle additional properties in overrides', () => {
      const overrides = {
        uid: 'new-id',
        customProperty: 'custom-value',
        metadata: {
          creationTime: '2023-01-01',
          lastSignInTime: '2023-01-02',
        },
      }
      
      const mockUser = createMockFirebaseUser(overrides)
      
      expect(mockUser).toEqual({
        uid: 'new-id',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
        photoURL: null,
        phoneNumber: null,
        customProperty: 'custom-value',
        metadata: {
          creationTime: '2023-01-01',
          lastSignInTime: '2023-01-02',
        },
      })
    })

    it('should handle null and undefined overrides', () => {
      const overrides = {
        displayName: null,
        email: undefined,
      }
      
      const mockUser = createMockFirebaseUser(overrides)
      
      expect(mockUser).toEqual({
        uid: 'test-user-id',
        email: undefined,
        displayName: null,
        emailVerified: true,
        photoURL: null,
        phoneNumber: null,
      })
    })
  })

  describe('Ethereum address constants', () => {
    it('should export MOCK_ETH_ADDRESS with correct format', () => {
      expect(MOCK_ETH_ADDRESS).toBe('0x1234567890123456789012345678901234567890')
      expect(MOCK_ETH_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(MOCK_ETH_ADDRESS.length).toBe(42) // 0x + 40 hex chars
    })

    it('should export MOCK_ETH_ADDRESS_2 with correct format', () => {
      expect(MOCK_ETH_ADDRESS_2).toBe('0x0987654321098765432109876543210987654321')
      expect(MOCK_ETH_ADDRESS_2).toMatch(/^0x[a-fA-F0-9]{40}$/)
      expect(MOCK_ETH_ADDRESS_2.length).toBe(42) // 0x + 40 hex chars
    })

    it('should have different addresses', () => {
      expect(MOCK_ETH_ADDRESS).not.toBe(MOCK_ETH_ADDRESS_2)
    })

    it('should be valid Ethereum addresses', () => {
      // Basic Ethereum address validation
      const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/
      
      expect(ethereumAddressRegex.test(MOCK_ETH_ADDRESS)).toBe(true)
      expect(ethereumAddressRegex.test(MOCK_ETH_ADDRESS_2)).toBe(true)
    })
  })

  describe('TEST_CHAIN_IDS constants', () => {
    it('should export TEST_CHAIN_IDS with correct values', () => {
      expect(TEST_CHAIN_IDS).toEqual({
        ETHEREUM_MAINNET: 1,
        POLYGON_MAINNET: 137,
        POLYGON_AMOY: 80002,
        LOCALHOST: 31337,
      })
    })

    it('should be readonly (as const assertion)', () => {
      // TypeScript should treat this as readonly, but we can test the structure
      expect(typeof TEST_CHAIN_IDS.ETHEREUM_MAINNET).toBe('number')
      expect(typeof TEST_CHAIN_IDS.POLYGON_MAINNET).toBe('number')
      expect(typeof TEST_CHAIN_IDS.POLYGON_AMOY).toBe('number')
      expect(typeof TEST_CHAIN_IDS.LOCALHOST).toBe('number')
    })

    it('should contain standard chain IDs', () => {
      expect(TEST_CHAIN_IDS.ETHEREUM_MAINNET).toBe(1)
      expect(TEST_CHAIN_IDS.POLYGON_MAINNET).toBe(137)
      expect(TEST_CHAIN_IDS.POLYGON_AMOY).toBe(80002)
      expect(TEST_CHAIN_IDS.LOCALHOST).toBe(31337)
    })

    it('should be accessible as object properties', () => {
      expect(TEST_CHAIN_IDS.ETHEREUM_MAINNET).toBeDefined()
      expect(TEST_CHAIN_IDS.POLYGON_MAINNET).toBeDefined()
      expect(TEST_CHAIN_IDS.POLYGON_AMOY).toBeDefined()
      expect(TEST_CHAIN_IDS.LOCALHOST).toBeDefined()
    })

    it('should work in switch statements', () => {
      const getChainName = (chainId: number): string => {
        switch (chainId) {
          case TEST_CHAIN_IDS.ETHEREUM_MAINNET:
            return 'Ethereum Mainnet'
          case TEST_CHAIN_IDS.POLYGON_MAINNET:
            return 'Polygon Mainnet'
          case TEST_CHAIN_IDS.POLYGON_AMOY:
            return 'Polygon Amoy'
          case TEST_CHAIN_IDS.LOCALHOST:
            return 'Localhost'
          default:
            return 'Unknown'
        }
      }

      expect(getChainName(TEST_CHAIN_IDS.ETHEREUM_MAINNET)).toBe('Ethereum Mainnet')
      expect(getChainName(TEST_CHAIN_IDS.POLYGON_MAINNET)).toBe('Polygon Mainnet')
      expect(getChainName(TEST_CHAIN_IDS.POLYGON_AMOY)).toBe('Polygon Amoy')
      expect(getChainName(TEST_CHAIN_IDS.LOCALHOST)).toBe('Localhost')
    })
  })

  describe('module completeness', () => {
    it('should export all utilities from mockStores', () => {
      const mockStoresExports = Object.keys(mockStores)
      const expectedMockStoresExports = [
        'createMockAuthenticationStore',
        'createMockWalletStore', 
        'createMockPoolManagementStore',
        'createMockUIStore',
        'createMockRootStore',
        'mockStorePresets'
      ]

      expectedMockStoresExports.forEach(exportName => {
        expect(mockStoresExports).toContain(exportName)
      })
    })

    it('should export all utilities from testProviders', () => {
      const testProvidersExports = Object.keys(testProviders)
      const expectedTestProvidersExports = [
        'TestStoreProvider',
        'withMockStore'
      ]

      expectedTestProvidersExports.forEach(exportName => {
        expect(testProvidersExports).toContain(exportName)
      })
    })

    it('should export all utilities from renderWithStore', () => {
      const renderWithStoreExports = Object.keys(renderWithStoreModule)
      const expectedRenderWithStoreExports = [
        'renderWithStore',
        'renderHookWithStore', 
        'renderWithoutStore'
      ]

      expectedRenderWithStoreExports.forEach(exportName => {
        expect(renderWithStoreExports).toContain(exportName)
      })
    })
  })

  describe('TypeScript compatibility', () => {
    it('should maintain proper TypeScript types for re-exported functions', () => {
      // These tests verify that the re-exports maintain proper typing
      expect(typeof createMockAuthenticationStore).toBe('function')
      expect(typeof createMockWalletStore).toBe('function')
      expect(typeof createMockPoolManagementStore).toBe('function')
      expect(typeof createMockUIStore).toBe('function')
      expect(typeof createMockRootStore).toBe('function')
      expect(typeof mockStorePresets).toBe('object')
      expect(typeof TestStoreProvider).toBe('function')
      expect(typeof withMockStore).toBe('function')
      expect(typeof renderWithStore).toBe('function')
      expect(typeof renderHookWithStore).toBe('function')
      expect(typeof renderWithoutStore).toBe('function')
    })

    it('should maintain proper TypeScript types for direct exports', () => {
      expect(typeof waitForMobX).toBe('function')
      expect(typeof createMockFirebaseUser).toBe('function')
      expect(typeof MOCK_ETH_ADDRESS).toBe('string')
      expect(typeof MOCK_ETH_ADDRESS_2).toBe('string')
      expect(typeof TEST_CHAIN_IDS).toBe('object')
    })
  })

  describe('integration testing', () => {
    it('should work together in a typical test scenario', async () => {
      // Create a mock store
      const store = createMockRootStore({
        walletStore: {
          isConnected: true,
          address: MOCK_ETH_ADDRESS,
          chainId: TEST_CHAIN_IDS.POLYGON_MAINNET,
        }
      })

      // Create a mock Firebase user
      const mockUser = createMockFirebaseUser({
        uid: 'test-integration-user',
        email: 'integration@test.com',
      })

      // Wait for MobX reactions (in real tests, this would be useful)
      await waitForMobX(10)

      // Verify everything works together
      expect(store).toBeTruthy()
      expect(mockUser.uid).toBe('test-integration-user')
      expect(mockUser.email).toBe('integration@test.com')
      expect(store.walletStore.address).toBe(MOCK_ETH_ADDRESS)
      expect(store.walletStore.chainId).toBe(TEST_CHAIN_IDS.POLYGON_MAINNET)
    })
  })
})