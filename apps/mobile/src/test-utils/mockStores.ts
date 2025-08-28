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

  // Replace stores with mocked versions
  if (storeOverrides.authenticationStore) {
    rootStore.authenticationStore = createMockAuthenticationStore(storeOverrides.authenticationStore)
  }

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
