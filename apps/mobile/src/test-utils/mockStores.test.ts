/**
 * Comprehensive test suite for mockStores utility functions
 * Tests all factory functions, mock store creation, and preset configurations
 */

import { AuthenticationStore } from '../stores/AuthenticationStore'
import { PoolManagementStore } from '../stores/PoolManagementStore'
import { RootStore } from '../stores/RootStore'
import { UIStore } from '../stores/UIStore'
import { WalletStore } from '../stores/WalletStore'
import { ErrorType } from '../utils/errorHandling'
import {
  createMockAuthenticationStore,
  createMockPoolManagementStore,
  createMockRootStore,
  createMockUIStore,
  createMockWalletStore,
  mockStorePresets,
} from './mockStores'

// Type interfaces for mock store objects
type MockSet<T> = Set<T> & {
  clear: jest.Mock
  add: jest.Mock
}

interface MockAuthenticationStore {
  completedSteps: MockSet<string>
  startStep: jest.Mock
  completeStep: jest.Mock
  failStep: jest.Mock
  resetProgress: jest.Mock
  reset: jest.Mock
  getStepStatus: jest.Mock
  getStepInfo: jest.Mock
  getAllSteps: jest.Mock
  setAuthLock: jest.Mock
  setAuthError: jest.Mock
}

interface MockWalletStore {
  connect: jest.Mock
  disconnect: jest.Mock
  updateConnectionState: jest.Mock
  isConnected: boolean
  address?: string
  chainId?: number
}

interface MockPoolManagementStore {
  loadPools: jest.Mock
  createPool: jest.Mock
  joinPool: jest.Mock
  addPool: jest.Mock
  updatePool: jest.Mock
  removePool: jest.Mock
  addLoan: jest.Mock
  updateLoan: jest.Mock
  addTransaction: jest.Mock
  updateTransaction: jest.Mock
  setLoading: jest.Mock
  setError: jest.Mock
}

interface MockUIStore {
  setOnboardingIndex: jest.Mock
  resetOnboardingState: jest.Mock
  onboardingCurrentIndex: number
}

interface MockRootStore {
  authenticationStore: AuthenticationStore | null
  walletStore: WalletStore | null
  poolManagementStore: PoolManagementStore | null
  uiStore: UIStore | null
}

// Mock the actual store classes
jest.mock('../stores/AuthenticationStore')
jest.mock('../stores/WalletStore')
jest.mock('../stores/PoolManagementStore')
jest.mock('../stores/UIStore')
jest.mock('../stores/RootStore')

// Mock constructors
const MockedAuthenticationStore = AuthenticationStore as jest.MockedClass<typeof AuthenticationStore>
const MockedWalletStore = WalletStore as jest.MockedClass<typeof WalletStore>
const MockedPoolManagementStore = PoolManagementStore as jest.MockedClass<typeof PoolManagementStore>
const MockedUIStore = UIStore as jest.MockedClass<typeof UIStore>
const MockedRootStore = RootStore as jest.MockedClass<typeof RootStore>

describe('mockStores', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createMockAuthenticationStore', () => {
    let mockStore: MockAuthenticationStore

    beforeEach(() => {
      const completedSteps = new Set(['connect-wallet']) as MockSet<string>
      completedSteps.clear = jest.fn()
      completedSteps.add = jest.fn()

      mockStore = {
        completedSteps,
        startStep: jest.fn(),
        completeStep: jest.fn(),
        failStep: jest.fn(),
        resetProgress: jest.fn(),
        reset: jest.fn(),
        getStepStatus: jest.fn(),
        getStepInfo: jest.fn(),
        getAllSteps: jest.fn(),
        setAuthLock: jest.fn(),
        setAuthError: jest.fn(),
      }

      MockedAuthenticationStore.mockImplementation(() => mockStore as unknown as AuthenticationStore)
    })

    it('should create a mock AuthenticationStore instance', () => {
      const store = createMockAuthenticationStore()

      expect(AuthenticationStore).toHaveBeenCalled()
      expect(store).toBe(mockStore)
    })

    it('should clear and reset completedSteps on creation', () => {
      const newCompletedSteps = new Set() as MockSet<string>
      newCompletedSteps.clear = jest.fn()
      newCompletedSteps.add = jest.fn()
      mockStore.completedSteps = newCompletedSteps

      createMockAuthenticationStore()

      expect(mockStore.completedSteps.clear).toHaveBeenCalled()
      expect(mockStore.completedSteps.add).toHaveBeenCalledWith('connect-wallet')
    })

    it('should wrap all store methods with jest mocks', () => {
      const store = createMockAuthenticationStore()

      // Check that methods are jest functions
      expect(jest.isMockFunction(store.startStep)).toBe(true)
      expect(jest.isMockFunction(store.completeStep)).toBe(true)
      expect(jest.isMockFunction(store.failStep)).toBe(true)
      expect(jest.isMockFunction(store.resetProgress)).toBe(true)
      expect(jest.isMockFunction(store.reset)).toBe(true)
      expect(jest.isMockFunction(store.getStepStatus)).toBe(true)
      expect(jest.isMockFunction(store.getStepInfo)).toBe(true)
      expect(jest.isMockFunction(store.getAllSteps)).toBe(true)
      expect(jest.isMockFunction(store.setAuthLock)).toBe(true)
      expect(jest.isMockFunction(store.setAuthError)).toBe(true)
    })

    it('should apply overrides to store properties', () => {
      const overrides = {
        authLock: {
          isLocked: true,
          startTime: 12345,
          walletAddress: '0xtest',
          abortController: new AbortController(),
          requestId: 'test-id',
        },
      }

      const store = createMockAuthenticationStore(overrides)

      expect(store.authLock).toEqual(overrides.authLock)
    })

    it('should preserve original method functionality while adding spy capabilities', () => {
      const originalMethod = jest.fn().mockReturnValue('original-result')
      mockStore.startStep = originalMethod

      const store = createMockAuthenticationStore()

      // Mock should call original implementation
      const result = store.startStep('connect-wallet')
      expect(result).toBe('original-result')
      expect(store.startStep).toHaveBeenCalledWith('connect-wallet')
    })
  })

  describe('createMockWalletStore', () => {
    let mockStore: MockWalletStore

    beforeEach(() => {
      mockStore = {
        connect: jest.fn(),
        disconnect: jest.fn(),
        updateConnectionState: jest.fn(),
        isConnected: false,
        address: undefined,
        chainId: undefined,
      }

      MockedWalletStore.mockImplementation(() => mockStore as unknown as WalletStore)
    })

    it('should create a mock WalletStore instance', () => {
      const store = createMockWalletStore()

      expect(WalletStore).toHaveBeenCalled()
      expect(store).toBe(mockStore)
    })

    it('should wrap wallet methods with jest mocks', () => {
      const store = createMockWalletStore()

      expect(jest.isMockFunction(store.connect)).toBe(true)
      expect(jest.isMockFunction(store.disconnect)).toBe(true)
      expect(jest.isMockFunction(store.updateConnectionState)).toBe(true)
    })

    it('should apply overrides to store properties', () => {
      const overrides = {
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
        chainId: 137,
      }

      const store = createMockWalletStore(overrides)

      expect(store.isConnected).toBe(true)
      expect(store.address).toBe('0x1234567890123456789012345678901234567890')
      expect(store.chainId).toBe(137)
    })
  })

  describe('createMockPoolManagementStore', () => {
    let mockStore: MockPoolManagementStore

    beforeEach(() => {
      mockStore = {
        loadPools: jest.fn(),
        createPool: jest.fn(),
        joinPool: jest.fn(),
        addPool: jest.fn(),
        updatePool: jest.fn(),
        removePool: jest.fn(),
        addLoan: jest.fn(),
        updateLoan: jest.fn(),
        addTransaction: jest.fn(),
        updateTransaction: jest.fn(),
        setLoading: jest.fn(),
        setError: jest.fn(),
      }

      MockedPoolManagementStore.mockImplementation(() => mockStore as unknown as PoolManagementStore)
    })

    it('should create a mock PoolManagementStore instance', () => {
      const store = createMockPoolManagementStore()

      expect(PoolManagementStore).toHaveBeenCalled()
      expect(store).toBe(mockStore)
    })

    it('should wrap all pool management methods with jest mocks', () => {
      const store = createMockPoolManagementStore()

      expect(jest.isMockFunction(store.loadPools)).toBe(true)
      expect(jest.isMockFunction(store.createPool)).toBe(true)
      expect(jest.isMockFunction(store.joinPool)).toBe(true)
      expect(jest.isMockFunction(store.addPool)).toBe(true)
      expect(jest.isMockFunction(store.updatePool)).toBe(true)
      expect(jest.isMockFunction(store.removePool)).toBe(true)
      expect(jest.isMockFunction(store.addLoan)).toBe(true)
      expect(jest.isMockFunction(store.updateLoan)).toBe(true)
      expect(jest.isMockFunction(store.addTransaction)).toBe(true)
      expect(jest.isMockFunction(store.updateTransaction)).toBe(true)
      expect(jest.isMockFunction(store.setLoading)).toBe(true)
      expect(jest.isMockFunction(store.setError)).toBe(true)
    })

    it('should apply overrides to store properties', () => {
      const overrides = {
        userAddress: '0xtest',
        loading: {
          pools: true,
          loans: false,
          transactions: false,
          memberActions: false,
        },
      }

      const store = createMockPoolManagementStore(overrides)

      expect(store.userAddress).toBe('0xtest')
      expect(store.loading).toEqual(overrides.loading)
    })
  })

  describe('createMockUIStore', () => {
    let mockStore: MockUIStore

    beforeEach(() => {
      mockStore = {
        setOnboardingIndex: jest.fn(),
        resetOnboardingState: jest.fn(),
        onboardingCurrentIndex: 0,
      }

      MockedUIStore.mockImplementation(() => mockStore as unknown as UIStore)
    })

    it('should create a mock UIStore instance', () => {
      const store = createMockUIStore()

      expect(UIStore).toHaveBeenCalled()
      expect(store).toBe(mockStore)
    })

    it('should wrap UI methods with jest mocks', () => {
      const store = createMockUIStore()

      expect(jest.isMockFunction(store.setOnboardingIndex)).toBe(true)
      expect(jest.isMockFunction(store.resetOnboardingState)).toBe(true)
    })

    it('should apply overrides to store properties', () => {
      const overrides = {
        onboardingCurrentIndex: 3,
      }

      const store = createMockUIStore(overrides)

      expect(store.onboardingCurrentIndex).toBe(3)
    })
  })

  describe('createMockRootStore', () => {
    let mockRootStore: MockRootStore

    beforeEach(() => {
      mockRootStore = {
        authenticationStore: null,
        walletStore: null,
        poolManagementStore: null,
        uiStore: null,
      }

      MockedRootStore.mockImplementation(() => mockRootStore as unknown as RootStore)
    })

    it('should create a mock RootStore instance', () => {
      const store = createMockRootStore()

      expect(RootStore).toHaveBeenCalled()
      expect(store).toBe(mockRootStore)
    })

    it('should replace all child stores with mocked versions', () => {
      const store = createMockRootStore()

      expect(store.authenticationStore).toBeTruthy()
      expect(store.walletStore).toBeTruthy()
      expect(store.poolManagementStore).toBeTruthy()
      expect(store.uiStore).toBeTruthy()
    })

    it('should pass overrides to individual store mocks', () => {
      const storeOverrides = {
        authenticationStore: {
          authLock: {
            isLocked: true,
            startTime: 12345,
            walletAddress: '0xtest',
            abortController: new AbortController(),
            requestId: 'test-id',
          },
        },
        walletStore: {
          isConnected: true,
          address: '0xtest',
        },
        poolManagementStore: {
          userAddress: '0xtest',
        },
        uiStore: {
          onboardingCurrentIndex: 2,
        },
      }

      const store = createMockRootStore(storeOverrides)

      expect(store.authenticationStore.authLock).toEqual(storeOverrides.authenticationStore.authLock)
      expect(store.walletStore.isConnected).toBe(true)
      expect(store.walletStore.address).toBe('0xtest')
      expect(store.poolManagementStore.userAddress).toBe('0xtest')
      expect(store.uiStore.onboardingCurrentIndex).toBe(2)
    })

    it('should work with empty overrides', () => {
      const store = createMockRootStore({})

      expect(store.authenticationStore).toBeTruthy()
      expect(store.walletStore).toBeTruthy()
      expect(store.poolManagementStore).toBeTruthy()
      expect(store.uiStore).toBeTruthy()
    })
  })

  describe('mockStorePresets', () => {
    describe('poolWithData', () => {
      it('should create a store with test pool data', () => {
        const store = mockStorePresets.poolWithData()

        expect(store.walletStore.isConnected).toBe(true)
        expect(store.walletStore.address).toBe('0x1234567890123456789012345678901234567890')
        expect(store.walletStore.chainId).toBe(137)
        expect(store.poolManagementStore.userAddress).toBe('0x1234567890123456789012345678901234567890')

        // Check that addPool was called
        expect(store.poolManagementStore.addPool).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'test-pool-1',
            name: 'Test Pool',
            description: 'A test pool for unit tests',
            contractAddress: '0x1234567890123456789012345678901234567890',
          })
        )
      })

      it('should create pool with correct properties', () => {
        const store = mockStorePresets.poolWithData()
        const addPoolCall = (store.poolManagementStore.addPool as jest.Mock).mock.calls[0][0]

        expect(addPoolCall).toMatchObject({
          id: 'test-pool-1',
          name: 'Test Pool',
          description: 'A test pool for unit tests',
          contractAddress: '0x1234567890123456789012345678901234567890',
          creator: '0x1234567890123456789012345678901234567890',
          maxMembers: 10,
          minimumContribution: BigInt(50),
          interestRate: 500,
          loanDuration: 2592000,
          totalLiquidity: BigInt(1000),
          availableLiquidity: BigInt(800),
          totalBorrowed: BigInt(200),
          isActive: true,
          isPaused: false,
        })

        expect(addPoolCall.createdAt).toBeInstanceOf(Date)
        expect(addPoolCall.updatedAt).toBeInstanceOf(Date)
      })
    })

    describe('loadingPools', () => {
      it('should create a store with pools loading state', () => {
        const store = mockStorePresets.loadingPools()

        expect(store.poolManagementStore.loading).toEqual({
          pools: true,
          loans: false,
          transactions: false,
          memberActions: false,
        })
      })
    })

    describe('loadingMemberActions', () => {
      it('should create a store with member actions loading state', () => {
        const store = mockStorePresets.loadingMemberActions()

        expect(store.poolManagementStore.loading).toEqual({
          pools: false,
          loans: false,
          transactions: false,
          memberActions: true,
        })
      })
    })

    describe('onboardingInProgress', () => {
      it('should create a store with onboarding state', () => {
        const store = mockStorePresets.onboardingInProgress()

        expect(store.uiStore.onboardingCurrentIndex).toBe(2)
      })
    })

    describe('authenticatedWithPoolData', () => {
      it('should create a store with authentication and pool data', () => {
        const store = mockStorePresets.authenticatedWithPoolData()

        // Should have same data as poolWithData
        expect(store.walletStore.isConnected).toBe(true)
        expect(store.walletStore.address).toBe('0x1234567890123456789012345678901234567890')
        expect(store.poolManagementStore.addPool).toHaveBeenCalled()
      })
    })

    describe('poolManagementError', () => {
      it('should create a store with pool management error state', () => {
        const store = mockStorePresets.poolManagementError()

        expect(store.poolManagementStore.error).toBe('Failed to load pool data')
        expect(store.poolManagementStore.loading).toEqual({
          pools: false,
          loans: false,
          transactions: false,
          memberActions: false,
        })
      })
    })

    describe('authenticatedWithWallet', () => {
      it('should create a store with connected wallet', () => {
        const store = mockStorePresets.authenticatedWithWallet()

        expect(store.walletStore.isConnected).toBe(true)
        expect(store.walletStore.address).toBe('0x1234567890123456789012345678901234567890')
        expect(store.walletStore.chainId).toBe(137)
        expect(store.walletStore.connectionError).toBeNull()
        expect(store.walletStore.isConnecting).toBe(false)
      })
    })

    describe('unauthenticated', () => {
      it('should create a store with disconnected wallet', () => {
        const store = mockStorePresets.unauthenticated()

        expect(store.walletStore.isConnected).toBe(false)
        expect(store.walletStore.address).toBeUndefined()
        expect(store.walletStore.chainId).toBeUndefined()
        expect(store.walletStore.connectionError).toBeNull()
        expect(store.walletStore.isConnecting).toBe(false)
      })
    })

    describe('authenticating', () => {
      it('should create a store with authentication in progress', () => {
        const store = mockStorePresets.authenticating()

        expect(store.authenticationStore.authLock).toMatchObject({
          isLocked: true,
          startTime: expect.any(Number) as number,
          walletAddress: '0x1234567890123456789012345678901234567890',
          abortController: expect.any(AbortController) as AbortController,
          requestId: 'test-request-id',
        })
      })
    })

    describe('connectingWallet', () => {
      it('should create a store with wallet connection in progress', () => {
        const store = mockStorePresets.connectingWallet()

        expect(store.walletStore.isConnected).toBe(false)
        expect(store.walletStore.address).toBeUndefined()
        expect(store.walletStore.chainId).toBeUndefined()
        expect(store.walletStore.connectionError).toBeNull()
        expect(store.walletStore.isConnecting).toBe(true)
      })
    })

    describe('authenticationError', () => {
      it('should create a store with authentication error', () => {
        const store = mockStorePresets.authenticationError()

        expect(store.authenticationStore.authError).toMatchObject({
          name: 'AppError',
          message: 'Authentication failed',
          type: ErrorType.AUTHENTICATION_FAILED,
          userFriendlyMessage: 'Authentication failed',
          timestamp: expect.any(Date) as Date,
        })
      })
    })

    describe('walletConnectionError', () => {
      it('should create a store with wallet connection error', () => {
        const store = mockStorePresets.walletConnectionError()

        expect(store.walletStore.isConnected).toBe(false)
        expect(store.walletStore.address).toBeUndefined()
        expect(store.walletStore.chainId).toBeUndefined()
        expect(store.walletStore.connectionError).toBe('Failed to connect wallet')
        expect(store.walletStore.isConnecting).toBe(false)
      })
    })
  })

  describe('Mock function behavior', () => {
    it('should preserve original functionality while adding spy capabilities', () => {
      const originalReturn = 'original-result'
      const mockAuthStore = {
        completedSteps: new Set(),
        startStep: jest.fn().mockReturnValue(originalReturn),
        completeStep: jest.fn(),
        failStep: jest.fn(),
        resetProgress: jest.fn(),
        reset: jest.fn(),
        getStepStatus: jest.fn(),
        getStepInfo: jest.fn(),
        getAllSteps: jest.fn(),
        setAuthLock: jest.fn(),
        setAuthError: jest.fn(),
      }

      mockAuthStore.completedSteps.clear = jest.fn()
      mockAuthStore.completedSteps.add = jest.fn()

      MockedAuthenticationStore.mockImplementation(() => mockAuthStore as unknown as AuthenticationStore)

      const store = createMockAuthenticationStore()
      const result = store.startStep('connect-wallet')

      expect(result).toBe(originalReturn)
      expect(store.startStep).toHaveBeenCalledWith('connect-wallet')
    })

    it('should allow test-specific mock implementations', () => {
      const store = createMockAuthenticationStore() as AuthenticationStore

      // Override mock implementation for specific test
      ;(store.startStep as jest.Mock).mockImplementation(() => 'test-specific-result')

      const result = store.startStep('generate-message')
      expect(result).toBe('test-specific-result')
    })
  })

  describe('Type safety and compatibility', () => {
    it('should maintain TypeScript compatibility with actual stores', () => {
      const authStore = createMockAuthenticationStore()
      const walletStore = createMockWalletStore()
      const poolStore = createMockPoolManagementStore()
      const uiStore = createMockUIStore()
      const rootStore = createMockRootStore()

      // Should be able to call expected methods
      expect(() => authStore.startStep('generate-message')).not.toThrow()
      expect(() => walletStore.connect('0x1234567890123456789012345678901234567890', 1)).not.toThrow()
      expect(() => poolStore.loadPools()).not.toThrow()
      expect(() => uiStore.setOnboardingIndex(1)).not.toThrow()

      // Should have expected properties
      expect(rootStore.authenticationStore).toBeTruthy()
      expect(rootStore.walletStore).toBeTruthy()
      expect(rootStore.poolManagementStore).toBeTruthy()
      expect(rootStore.uiStore).toBeTruthy()
    })
  })
})
