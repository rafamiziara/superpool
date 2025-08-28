import { AuthenticationStore } from '../stores/AuthenticationStore'
import { WalletStore } from '../stores/WalletStore'
import { PoolManagementStore } from '../stores/PoolManagementStore'
import { UIStore } from '../stores/UIStore'
import { RootStore } from '../stores/RootStore'
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
  const originalGetStepStatus = store.getStepStatus.bind(store)
  const originalGetStepInfo = store.getStepInfo.bind(store)
  const originalGetAllSteps = store.getAllSteps.bind(store)

  // Create spies that wrap the original functionality
  const mockStartStep = jest.fn().mockImplementation(originalStartStep)
  const mockCompleteStep = jest.fn().mockImplementation(originalCompleteStep)
  const mockFailStep = jest.fn().mockImplementation(originalFailStep)
  const mockResetProgress = jest.fn().mockImplementation(originalResetProgress)
  const mockGetStepStatus = jest.fn().mockImplementation(originalGetStepStatus)
  const mockGetStepInfo = jest.fn().mockImplementation(originalGetStepInfo)
  const mockGetAllSteps = jest.fn().mockImplementation(originalGetAllSteps)

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
  ;(store as any).getStepStatus = mockGetStepStatus
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).getStepInfo = mockGetStepInfo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(store as any).getAllSteps = mockGetAllSteps

  // Apply overrides
  Object.assign(store, overrides)

  return store
}

export const createMockWalletStore = (overrides: Partial<WalletStore> = {}): WalletStore => {
  const store = new WalletStore()

  // Apply overrides
  Object.assign(store, overrides)

  return store
}

export const createMockPoolManagementStore = (overrides: Partial<PoolManagementStore> = {}): PoolManagementStore => {
  const store = new PoolManagementStore()

  // Apply overrides
  Object.assign(store, overrides)

  return store
}

export const createMockUIStore = (overrides: Partial<UIStore> = {}): UIStore => {
  const store = new UIStore()

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

  if (storeOverrides.walletStore) {
    rootStore.walletStore = createMockWalletStore(storeOverrides.walletStore)
  }

  if (storeOverrides.poolManagementStore) {
    rootStore.poolManagementStore = createMockPoolManagementStore(storeOverrides.poolManagementStore)
  }

  if (storeOverrides.uiStore) {
    rootStore.uiStore = createMockUIStore(storeOverrides.uiStore)
  }

  return rootStore
}

/**
 * Preset mock store configurations for common test scenarios
 */

export const mockStorePresets = {
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
