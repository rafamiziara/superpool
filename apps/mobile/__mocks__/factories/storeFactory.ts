/**
 * Store Mock Factory Functions
 *
 * Centralized factory functions for creating mock store instances with custom configurations.
 * This is the single source of truth for all store mocking in tests.
 */

import { AuthStep } from '@superpool/types'
import { observable } from 'mobx'
import { AppError } from '../../src/utils/errorHandling'
import { AuthenticationLock } from '../../src/services/authentication/AuthenticationOrchestrator'

// Define the mock store interface
interface MockRootStore {
  authenticationStore: ReturnType<typeof createMockAuthenticationStore>
  walletStore: ReturnType<typeof createMockWalletStore>
  poolManagementStore: ReturnType<typeof createMockPoolManagementStore>
  uiStore: ReturnType<typeof createMockUIStore>
  auth?: ReturnType<typeof createMockAuthenticationStore>
  wallet?: ReturnType<typeof createMockWalletStore>
  pools?: ReturnType<typeof createMockPoolManagementStore>
  ui?: ReturnType<typeof createMockUIStore>
}

// Authentication Store Factory - Enhanced with full store interface
export const createMockAuthenticationStore = (
  overrides: Partial<{
    currentStep: AuthStep | null
    completedSteps: Set<AuthStep>
    failedStep: AuthStep | null
    isProgressComplete: boolean
    progressError: string | null
    isAuthenticating: boolean
    authWalletAddress: string | null
    authLock: {
      isLocked: boolean
      startTime: number
      walletAddress: string | null
      abortController: AbortController | null
      requestId: string | null
    }
    authError: AppError | null
    retryCount: number
    isRetryDelayActive: boolean
    isAppRefreshGracePeriod: boolean
    maxRetries: number
    isLoggingOut: boolean
  }> = {}
) => {
  // Create observable auth store state
  const storeState = observable({
    currentStep: null as AuthStep | null,
    completedSteps: observable.set<AuthStep>(['connect-wallet']),
    failedStep: null as AuthStep | null,
    isProgressComplete: false,
    progressError: null as string | null,
    authLock: {
      isLocked: false,
      startTime: 0,
      walletAddress: null as string | null,
      abortController: null as AbortController | null,
      requestId: null as string | null,
    },
    authError: null as AppError | null,

    // Retry logic state (reactive)
    retryCount: 0,
    isRetryDelayActive: false,
    isAppRefreshGracePeriod: true,
    maxRetries: 3,

    // Logout state (reactive)
    isLoggingOut: false,

    // Private reset flags (to prevent infinite loops in real store)
    isResetting: false,
    isResettingProgress: false,

    // Apply overrides
    ...overrides,
  })

  const mockStore = {
    // Make properties directly accessible and observable
    get currentStep() {
      return storeState.currentStep
    },
    set currentStep(value: AuthStep | null) {
      storeState.currentStep = value
    },

    get completedSteps() {
      return storeState.completedSteps
    },
    set completedSteps(value: Set<AuthStep>) {
      storeState.completedSteps = value
    },

    get failedStep() {
      return storeState.failedStep
    },
    set failedStep(value: AuthStep | null) {
      storeState.failedStep = value
    },

    get isProgressComplete() {
      return storeState.isProgressComplete
    },
    set isProgressComplete(value: boolean) {
      storeState.isProgressComplete = value
    },

    get progressError() {
      return storeState.progressError
    },
    set progressError(value: string | null) {
      storeState.progressError = value
    },

    get authLock() {
      return storeState.authLock
    },
    set authLock(value: Partial<AuthenticationLock>) {
      Object.assign(storeState.authLock, value)
    },

    get authError() {
      return storeState.authError
    },
    set authError(value: AppError | null) {
      storeState.authError = value
    },

    // Computed properties (getters that mimic the real store behavior)
    get isAuthenticating(): boolean {
      return storeState.authLock.isLocked
    },

    get authWalletAddress(): string | null {
      return storeState.authLock.walletAddress
    },

    // Methods that actually update the observable state
    startStep: jest.fn().mockImplementation((step: AuthStep) => {
      storeState.currentStep = step
    }),
    completeStep: jest.fn().mockImplementation((step: AuthStep) => {
      storeState.completedSteps.add(step)
      if (storeState.currentStep === step) {
        storeState.currentStep = null
      }
    }),
    failStep: jest.fn().mockImplementation((step: AuthStep, error?: string | Error) => {
      storeState.failedStep = step
      storeState.progressError = typeof error === 'string' ? error : error?.message || null
      if (storeState.currentStep === step) {
        storeState.currentStep = null
      }
    }),
    resetProgress: jest.fn().mockImplementation(() => {
      storeState.currentStep = null
      storeState.completedSteps.clear()
      storeState.completedSteps.add('connect-wallet') // Keep connect-wallet as completed
      storeState.failedStep = null
      storeState.isProgressComplete = false
      storeState.progressError = null
    }),
    reset: jest.fn().mockImplementation(() => {
      storeState.authError = null
      Object.assign(storeState.authLock, {
        isLocked: false,
        startTime: 0,
        walletAddress: null,
        abortController: null,
        requestId: null,
      })
    }),
    acquireAuthLock: jest.fn().mockReturnValue(true),
    releaseAuthLock: jest.fn(),
    getStepStatus: jest.fn().mockImplementation((step: AuthStep) => {
      if (storeState.completedSteps.has(step)) return 'completed'
      if (storeState.currentStep === step) return 'in-progress'
      if (storeState.failedStep === step) return 'failed'
      return 'pending'
    }),
    getStepInfo: jest.fn().mockImplementation((step: AuthStep) => {
      // Mock step info for common steps
      const stepInfoMap: Partial<Record<AuthStep, { step: AuthStep; title: string; description: string } | null>> = {
        'connect-wallet': { step: 'connect-wallet', title: 'Connect Wallet', description: 'Connect your wallet to continue' },
        'generate-message': { step: 'generate-message', title: 'Generate Message', description: 'Generate authentication message' },
        'request-signature': { step: 'request-signature', title: 'Request Signature', description: 'Sign message in your wallet app' },
        'verify-signature': { step: 'verify-signature', title: 'Verify Signature', description: 'Verifying your signature' },
        'firebase-auth': { step: 'firebase-auth', title: 'Firebase Auth', description: 'Authenticating with Firebase' },
      }
      return stepInfoMap[step] || null
    }),
    getAllSteps: jest.fn().mockReturnValue([
      { step: 'connect-wallet', title: 'Connect Wallet', description: 'Connect your wallet to continue' },
      { step: 'generate-message', title: 'Generate Message', description: 'Generate authentication message' },
      { step: 'request-signature', title: 'Request Signature', description: 'Sign message in your wallet app' },
      { step: 'verify-signature', title: 'Verify Signature', description: 'Verifying your signature' },
      { step: 'firebase-auth', title: 'Firebase Auth', description: 'Authenticating with Firebase' },
    ]),
    getCurrentStepInfo: jest.fn().mockImplementation(() => {
      if (storeState.currentStep) {
        return mockStore.getStepInfo(storeState.currentStep)
      }
      return null
    }),
    getCompletedStepsCount: jest.fn().mockImplementation(() => {
      return storeState.completedSteps.size
    }),
    setAuthLock: jest.fn().mockImplementation((authLock: Partial<AuthenticationLock>) => {
      Object.assign(storeState.authLock, authLock)
    }),
    setAuthError: jest.fn().mockImplementation((error: AppError | null) => {
      storeState.authError = error
    }),

    // Additional properties for full compatibility
    get retryCount() {
      return storeState.retryCount
    },
    set retryCount(value: number) {
      storeState.retryCount = value
    },

    get isRetryDelayActive() {
      return storeState.isRetryDelayActive
    },
    set isRetryDelayActive(value: boolean) {
      storeState.isRetryDelayActive = value
    },

    get isAppRefreshGracePeriod() {
      return storeState.isAppRefreshGracePeriod
    },
    set isAppRefreshGracePeriod(value: boolean) {
      storeState.isAppRefreshGracePeriod = value
    },

    get maxRetries() {
      return storeState.maxRetries
    },
    set maxRetries(value: number) {
      storeState.maxRetries = value
    },

    get isLoggingOut() {
      return storeState.isLoggingOut
    },
    set isLoggingOut(value: boolean) {
      storeState.isLoggingOut = value
    },

    // Computed getters for retry logic
    get canRetry(): boolean {
      return storeState.retryCount < storeState.maxRetries
    },

    get nextRetryDelay(): number {
      const BASE_DELAY = 2000 // 2 seconds
      return BASE_DELAY * Math.pow(2, storeState.retryCount - 1)
    },

    // Additional methods from real AuthenticationStore
    setRetryCount: jest.fn().mockImplementation((count: number) => {
      storeState.retryCount = Math.max(0, Math.min(count, storeState.maxRetries))
    }),
    setRetryDelayActive: jest.fn().mockImplementation((active: boolean) => {
      storeState.isRetryDelayActive = active
    }),
    endGracePeriod: jest.fn().mockImplementation(() => {
      storeState.isAppRefreshGracePeriod = false
    }),
    resetRetryState: jest.fn().mockImplementation(() => {
      storeState.retryCount = 0
      storeState.isRetryDelayActive = false
      storeState.isAppRefreshGracePeriod = true
    }),
    startLogout: jest.fn().mockImplementation(() => {
      storeState.isLoggingOut = true
    }),
    finishLogout: jest.fn().mockImplementation(() => {
      storeState.isLoggingOut = false
    }),
    isAuthenticatingForWallet: jest.fn().mockImplementation((walletAddress: string) => {
      return storeState.authLock.isLocked && storeState.authLock.walletAddress?.toLowerCase() === walletAddress.toLowerCase()
    }),

    // Private properties for type compatibility (read-only getters)
    get isResetting() {
      return storeState.isResetting
    },

    get isResettingProgress() {
      return storeState.isResettingProgress
    },
  }

  return mockStore
}

// Wallet Store Factory - Enhanced with full interface
export const createMockWalletStore = (
  overrides: Partial<{
    isConnected: boolean
    address: string | undefined
    chainId: number | undefined
    connectionError: string | null
    isConnecting: boolean
    _sequenceCounter: number
  }> = {}
) => {
  // Create observable store state
  const storeState = observable({
    // State
    isConnected: false,
    address: undefined as string | undefined,
    chainId: undefined as number | undefined,
    connectionError: null as string | null,
    isConnecting: false,

    // Internal sequence tracking (private in real store)
    _sequenceCounter: 0,

    // Apply overrides to state
    ...overrides,
  })

  return {
    // Make properties directly accessible and observable
    get isConnected() {
      return storeState.isConnected
    },
    set isConnected(value: boolean) {
      storeState.isConnected = value
    },

    get address() {
      return storeState.address
    },
    set address(value: string | undefined) {
      storeState.address = value
    },

    get chainId() {
      return storeState.chainId
    },
    set chainId(value: number | undefined) {
      storeState.chainId = value
    },

    get connectionError() {
      return storeState.connectionError
    },
    set connectionError(value: string | null) {
      storeState.connectionError = value
    },

    get isConnecting() {
      return storeState.isConnecting
    },
    set isConnecting(value: boolean) {
      storeState.isConnecting = value
    },

    // Add currentState computed property that the hook expects
    get currentState() {
      return {
        isConnected: storeState.isConnected,
        address: storeState.address,
        chainId: storeState.chainId,
        connectionError: storeState.connectionError,
        isConnecting: storeState.isConnecting,
      }
    },

    // Methods
    connect: jest.fn().mockImplementation((address: string, chainId?: number) => {
      storeState.isConnected = true
      storeState.address = address
      storeState.chainId = chainId
      storeState.connectionError = null
      storeState.isConnecting = false
    }),
    disconnect: jest.fn().mockImplementation(() => {
      storeState.isConnected = false
      storeState.address = undefined
      storeState.chainId = undefined
      storeState.connectionError = null
      storeState.isConnecting = false
    }),
    updateConnectionState: jest.fn().mockImplementation((isConnected: boolean, address?: string, chainId?: number) => {
      const sequenceNumber = ++storeState._sequenceCounter

      storeState.isConnected = isConnected
      storeState.address = address
      storeState.chainId = chainId

      // Return atomic state like the real implementation
      return {
        isConnected,
        address,
        chainId,
        timestamp: Date.now(),
        sequenceNumber,
      }
    }),
    setConnectionError: jest.fn(),
    captureState: jest.fn().mockImplementation(() => {
      return {
        isConnected: storeState.isConnected,
        address: storeState.address,
        chainId: storeState.chainId,
        timestamp: Date.now(),
        sequenceNumber: storeState._sequenceCounter,
      }
    }),
    validateState: jest
      .fn()
      .mockImplementation(
        (
          lockedState: { isConnected: boolean; address: string | undefined; chainId: number | undefined; sequenceNumber: number },
          currentState: { isConnected: boolean; address: string | undefined; chainId: number | undefined; sequenceNumber: number },
          checkPoint: string
        ) => {
          const isValid =
            currentState.isConnected === lockedState.isConnected &&
            currentState.address === lockedState.address &&
            currentState.chainId === lockedState.chainId &&
            currentState.sequenceNumber >= lockedState.sequenceNumber

          if (!isValid) {
            console.log(`❌ Connection state changed at ${checkPoint}:`, {
              locked: lockedState,
              current: currentState,
              sequenceDrift: currentState.sequenceNumber - lockedState.sequenceNumber,
            })
          }

          return isValid
        }
      ),
    validateInitialState: jest.fn().mockImplementation((walletAddress: string) => {
      if (!storeState.isConnected || !storeState.address) {
        return {
          isValid: false,
          error: 'Wallet connection state invalid',
        }
      }
      if (storeState.address.toLowerCase() !== walletAddress.toLowerCase()) {
        return {
          isValid: false,
          error: 'Wallet address mismatch',
        }
      }
      if (!storeState.chainId) {
        return {
          isValid: false,
          error: 'ChainId not found',
        }
      }
      return { isValid: true }
    }),

    // Additional properties for full compatibility (sequenceCounter is private in real store)
    // We need to add it for type compatibility but it won't be directly accessible
    get sequenceCounter() {
      return storeState._sequenceCounter
    },

    // Computed getters from real WalletStore
    get isWalletConnected(): boolean {
      return storeState.isConnected && !!storeState.address
    },

    // Additional methods from real WalletStore
    setConnectionState: jest.fn().mockImplementation(
      (
        state: Partial<{
          isConnected: boolean
          address: string | undefined
          chainId: number | undefined
          isConnecting: boolean
          connectionError: string | null
        }>
      ) => {
        if (state.isConnected !== undefined) storeState.isConnected = state.isConnected
        if (state.address !== undefined) storeState.address = state.address
        if (state.chainId !== undefined) storeState.chainId = state.chainId
        if (state.isConnecting !== undefined) storeState.isConnecting = state.isConnecting
        if (state.connectionError !== undefined) storeState.connectionError = state.connectionError
      }
    ),
    setConnecting: jest.fn().mockImplementation((connecting: boolean) => {
      storeState.isConnecting = connecting
      if (connecting) {
        storeState.connectionError = null
      }
    }),
    resetSequence: jest.fn().mockImplementation(() => {
      storeState._sequenceCounter = 0
    }),
    reset: jest.fn().mockImplementation(() => {
      storeState.isConnected = false
      storeState.address = undefined
      storeState.chainId = undefined
      storeState.isConnecting = false
      storeState.connectionError = null
      storeState._sequenceCounter++
    }),
  }
}

// Pool Management Store Factory - Enhanced
export const createMockPoolManagementStore = (
  overrides: Partial<{
    pools: unknown[]
    selectedPool: unknown
    loading: {
      pools: boolean
      loans: boolean
      transactions: boolean
      memberActions: boolean
    }
    error: string | null
    userAddress: string | null
  }> = {}
) => ({
  // State
  pools: [],
  selectedPool: null,
  loading: {
    pools: false,
    loans: false,
    transactions: false,
    memberActions: false,
  },
  error: null,
  userAddress: null,

  // Methods
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

  // Apply overrides
  ...overrides,
})

// UI Store Factory - Enhanced
export const createMockUIStore = (
  overrides: Partial<{
    onboardingCurrentIndex: number
  }> = {}
) => ({
  // State
  onboardingCurrentIndex: 0,

  // Methods
  setOnboardingIndex: jest.fn(),
  resetOnboardingState: jest.fn(),

  // Apply overrides
  ...overrides,
})

// Root Store Factory - Central store combining all sub-stores
export const createMockRootStore = (
  overrides: Partial<{
    auth: unknown
    authenticationStore: unknown
    wallet: unknown
    walletStore: unknown
    pools: unknown
    poolManagementStore: unknown
    ui: unknown
    uiStore: unknown
  }> = {}
) =>
  ({
    // Store instances using consistent naming
    authenticationStore: createMockAuthenticationStore(overrides.authenticationStore || overrides.auth || {}),
    walletStore: createMockWalletStore(overrides.walletStore || overrides.wallet || {}),
    poolManagementStore: createMockPoolManagementStore(overrides.poolManagementStore || overrides.pools || {}),
    uiStore: createMockUIStore(overrides.uiStore || overrides.ui || {}),

    // Backward compatibility aliases
    auth: undefined, // Will be set below
    wallet: undefined, // Will be set below
    pools: undefined, // Will be set below
    ui: undefined, // Will be set below

    // Apply any direct overrides
    ...overrides,
  }) as MockRootStore

// Set up aliases for backward compatibility
const setupAliases = (store: MockRootStore) => {
  store.auth = store.authenticationStore
  store.wallet = store.walletStore
  store.pools = store.poolManagementStore
  store.ui = store.uiStore
  return store
}

// Export enhanced root store factory
export const createEnhancedMockRootStore = (overrides: Partial<MockRootStore> = {}) => {
  return setupAliases(createMockRootStore(overrides))
}

// Legacy aliases for backward compatibility
export const createMockAuthStore = createMockAuthenticationStore
export const createMockPoolStore = createMockPoolManagementStore
