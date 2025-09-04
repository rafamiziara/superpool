/**
 * Store Mock Factory Functions
 *
 * Centralized factory functions for creating mock store instances with custom configurations.
 * This is the single source of truth for all store mocking in tests.
 */

import { observable } from 'mobx'
import { AuthStep } from '@superpool/types'

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
    authError: {
      name: string
      message: string
      type: string
      userFriendlyMessage: string
      timestamp: Date
    } | null
  }> = {}
) => {
  // Create observable auth store state
  const storeState = observable({
    currentStep: null as AuthStep | null,
    completedSteps: new Set<AuthStep>(['connect-wallet']),
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
    authError: null as any,

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
    set authLock(value: any) {
      Object.assign(storeState.authLock, value)
    },

    get authError() {
      return storeState.authError
    },
    set authError(value: any) {
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
    failStep: jest.fn().mockImplementation((step: AuthStep, error?: any) => {
      storeState.failedStep = step
      storeState.progressError = error || null
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
    setAuthLock: jest.fn().mockImplementation((authLock: any) => {
      Object.assign(storeState.authLock, authLock)
    }),
    setAuthError: jest.fn().mockImplementation((error: any) => {
      storeState.authError = error
    }),
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
    connect: jest.fn(),
    disconnect: jest.fn(),
    updateConnectionState: jest.fn(),
    setConnectionError: jest.fn(),
    captureState: jest.fn(),
    validateState: jest.fn(),
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
    authenticationStore: createMockAuthenticationStore((overrides.authenticationStore as any) || (overrides.auth as any)),
    walletStore: createMockWalletStore((overrides.walletStore as any) || (overrides.wallet as any)),
    poolManagementStore: createMockPoolManagementStore((overrides.poolManagementStore as any) || (overrides.pools as any)),
    uiStore: createMockUIStore((overrides.uiStore as any) || (overrides.ui as any)),

    // Backward compatibility aliases
    auth: undefined, // Will be set below
    wallet: undefined, // Will be set below
    pools: undefined, // Will be set below
    ui: undefined, // Will be set below

    // Apply any direct overrides
    ...overrides,
  }) as any

// Set up aliases for backward compatibility
const setupAliases = (store: any) => {
  store.auth = store.authenticationStore
  store.wallet = store.walletStore
  store.pools = store.poolManagementStore
  store.ui = store.uiStore
  return store
}

// Export enhanced root store factory
export const createEnhancedMockRootStore = (overrides: any = {}) => {
  return setupAliases(createMockRootStore(overrides))
}

// Legacy aliases for backward compatibility
export const createMockAuthStore = createMockAuthenticationStore
export const createMockPoolStore = createMockPoolManagementStore
