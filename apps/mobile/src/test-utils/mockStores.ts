import { AuthenticationStore } from '../stores/AuthenticationStore'
import { PoolManagementStore } from '../stores/PoolManagementStore'
import { RootStore } from '../stores/RootStore'
import { UIStore } from '../stores/UIStore'
import { WalletStore } from '../stores/WalletStore'
import { ErrorType } from '../utils/errorHandling'

/**
 * Factory functions for creating mock MobX stores with preset states
 */

export const createMockAuthenticationStore = (overrides: Partial<AuthenticationStore> = {}): AuthenticationStore => {
  const store = new AuthenticationStore()

  // Reset the store to clean state first
  store.completedSteps.clear()
  store.completedSteps.add('connect-wallet') // resetProgress adds this

  // Create a mocked version by wrapping the original methods
  const originalStartStep = store.startStep.bind(store)
  const originalCompleteStep = store.completeStep.bind(store)
  const originalFailStep = store.failStep.bind(store)
  const originalResetProgress = store.resetProgress.bind(store)
  const originalReset = store.reset.bind(store)
  const originalGetStepStatus = store.getStepStatus.bind(store)
  const originalGetStepInfo = store.getStepInfo.bind(store)
  const originalGetAllSteps = store.getAllSteps.bind(store)
  const originalSetAuthLock = store.setAuthLock.bind(store)
  const originalSetAuthError = store.setAuthError.bind(store)

  // Create spies that wrap the original functionality
  const mockStartStep = jest.fn().mockImplementation(originalStartStep)
  const mockCompleteStep = jest.fn().mockImplementation(originalCompleteStep)
  const mockFailStep = jest.fn().mockImplementation(originalFailStep)
  const mockResetProgress = jest.fn().mockImplementation(originalResetProgress)
  const mockReset = jest.fn().mockImplementation(originalReset)
  const mockGetStepStatus = jest.fn().mockImplementation(originalGetStepStatus)
  const mockGetStepInfo = jest.fn().mockImplementation(originalGetStepInfo)
  const mockGetAllSteps = jest.fn().mockImplementation(originalGetAllSteps)
  const mockSetAuthLock = jest.fn().mockImplementation(originalSetAuthLock)
  const mockSetAuthError = jest.fn().mockImplementation(originalSetAuthError)

  // Replace methods on the store with mocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).startStep = mockStartStep
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).completeStep = mockCompleteStep
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).failStep = mockFailStep
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).resetProgress = mockResetProgress
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).reset = mockReset
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).getStepStatus = mockGetStepStatus
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).getStepInfo = mockGetStepInfo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).getAllSteps = mockGetAllSteps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).setAuthLock = mockSetAuthLock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).setAuthError = mockSetAuthError

  // Apply overrides
  Object.assign(store, overrides)

  return store
}

export const createMockWalletStore = (overrides: Partial<WalletStore> = {}): WalletStore => {
  const store = new WalletStore()

  // Create mocks for the methods that tests expect to be spies
  const originalConnect = store.connect.bind(store)
  const originalDisconnect = store.disconnect.bind(store)
  const originalUpdateConnectionState = store.updateConnectionState.bind(store)

  const mockConnect = jest.fn().mockImplementation(originalConnect)
  const mockDisconnect = jest.fn().mockImplementation(originalDisconnect)
  const mockUpdateConnectionState = jest.fn().mockImplementation(originalUpdateConnectionState)

  // Replace methods on the store with mocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).connect = mockConnect
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).disconnect = mockDisconnect
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).updateConnectionState = mockUpdateConnectionState

  // Apply overrides
  Object.assign(store, overrides)

  return store
}

export const createMockPoolManagementStore = (overrides: Partial<PoolManagementStore> = {}): PoolManagementStore => {
  const store = new PoolManagementStore()

  // Create mocks for async methods that tests expect to be spies
  const originalLoadPools = store.loadPools.bind(store)
  const originalCreatePool = store.createPool.bind(store)
  const originalJoinPool = store.joinPool.bind(store)
  const originalAddPool = store.addPool.bind(store)
  const originalUpdatePool = store.updatePool.bind(store)
  const originalRemovePool = store.removePool.bind(store)
  const originalAddLoan = store.addLoan.bind(store)
  const originalUpdateLoan = store.updateLoan.bind(store)
  const originalAddTransaction = store.addTransaction.bind(store)
  const originalUpdateTransaction = store.updateTransaction.bind(store)
  const originalSetLoading = store.setLoading.bind(store)
  const originalSetError = store.setError.bind(store)

  const mockLoadPools = jest.fn().mockImplementation(originalLoadPools)
  const mockCreatePool = jest.fn().mockImplementation(originalCreatePool)
  const mockJoinPool = jest.fn().mockImplementation(originalJoinPool)
  const mockAddPool = jest.fn().mockImplementation(originalAddPool)
  const mockUpdatePool = jest.fn().mockImplementation(originalUpdatePool)
  const mockRemovePool = jest.fn().mockImplementation(originalRemovePool)
  const mockAddLoan = jest.fn().mockImplementation(originalAddLoan)
  const mockUpdateLoan = jest.fn().mockImplementation(originalUpdateLoan)
  const mockAddTransaction = jest.fn().mockImplementation(originalAddTransaction)
  const mockUpdateTransaction = jest.fn().mockImplementation(originalUpdateTransaction)
  const mockSetLoading = jest.fn().mockImplementation(originalSetLoading)
  const mockSetError = jest.fn().mockImplementation(originalSetError)

  // Replace methods on the store with mocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).loadPools = mockLoadPools
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).createPool = mockCreatePool
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).joinPool = mockJoinPool
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).addPool = mockAddPool
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).updatePool = mockUpdatePool
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).removePool = mockRemovePool
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).addLoan = mockAddLoan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).updateLoan = mockUpdateLoan
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).addTransaction = mockAddTransaction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).updateTransaction = mockUpdateTransaction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).setLoading = mockSetLoading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).setError = mockSetError

  // Apply overrides
  Object.assign(store, overrides)

  return store
}

export const createMockUIStore = (overrides: Partial<UIStore> = {}): UIStore => {
  const store = new UIStore()

  // Create mocks for methods that tests expect to be spies
  const originalSetOnboardingIndex = store.setOnboardingIndex.bind(store)
  const originalResetOnboardingState = store.resetOnboardingState.bind(store)

  const mockSetOnboardingIndex = jest.fn().mockImplementation(originalSetOnboardingIndex)
  const mockResetOnboardingState = jest.fn().mockImplementation(originalResetOnboardingState)

  // Replace methods on the store with mocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).setOnboardingIndex = mockSetOnboardingIndex
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).resetOnboardingState = mockResetOnboardingState

  // Apply overrides
  Object.assign(store, overrides)

  return store
}

export const createMockRootStore = (
  storeOverrides: {
    authenticationStore?: Partial<AuthenticationStore>
    walletStore?: Partial<WalletStore>
    poolManagementStore?: Partial<PoolManagementStore>
    uiStore?: Partial<UIStore>
  } = {}
): RootStore => {
  const rootStore = new RootStore()

  // Always replace authenticationStore with mocked version for tests
  rootStore.authenticationStore = createMockAuthenticationStore(storeOverrides.authenticationStore || {})

  // Always replace walletStore with mocked version for tests
  rootStore.walletStore = createMockWalletStore(storeOverrides.walletStore || {})

  // Always replace poolManagementStore with mocked version for tests
  rootStore.poolManagementStore = createMockPoolManagementStore(storeOverrides.poolManagementStore || {})

  // Always replace uiStore with mocked version for tests
  rootStore.uiStore = createMockUIStore(storeOverrides.uiStore || {})

  return rootStore
}

/**
 * Preset mock store configurations for common test scenarios
 */

export const mockStorePresets = {
  // Pool management store with test data
  poolWithData: () => {
    const mockPool = {
      id: 'test-pool-1',
      name: 'Test Pool',
      description: 'A test pool for unit tests',
      contractAddress: '0x1234567890123456789012345678901234567890',
      creator: '0x1234567890123456789012345678901234567890',
      admins: ['0x1234567890123456789012345678901234567890'],
      members: ['0x1234567890123456789012345678901234567890'],
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
        address: '0x1234567890123456789012345678901234567890',
        chainId: 137,
      },
      poolManagementStore: {
        userAddress: '0x1234567890123456789012345678901234567890',
      },
    })

    // Add test pool data
    store.poolManagementStore.addPool(mockPool)

    return store
  },

  // Loading states for different stores
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

  // UI state presets
  onboardingInProgress: () =>
    createMockRootStore({
      uiStore: {
        onboardingCurrentIndex: 2,
      },
    }),

  // Combined states
  authenticatedWithPoolData: () => {
    const store = mockStorePresets.poolWithData()
    return store
  },

  // Error with specific store states
  poolManagementError: () =>
    createMockRootStore({
      poolManagementStore: {
        error: 'Failed to load pool data',
        loading: {
          pools: false,
          loans: false,
          transactions: false,
          memberActions: false,
        },
      },
    }),
  // Authenticated user with connected wallet
  authenticatedWithWallet: () =>
    createMockRootStore({
      walletStore: {
        isConnected: true,
        address: '0x1234567890123456789012345678901234567890',
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
          walletAddress: '0x1234567890123456789012345678901234567890',
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
          type: ErrorType.AUTHENTICATION_FAILED,
          userFriendlyMessage: 'Authentication failed',
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
}
