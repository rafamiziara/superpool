/**
 * Store Mock Factory Functions
 *
 * Centralized factory functions for creating mock store instances with custom configurations.
 * This is the single source of truth for all store mocking in tests.
 */

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
) => ({
  // State
  currentStep: null,
  completedSteps: new Set<AuthStep>(['connect-wallet']),
  failedStep: null,
  isProgressComplete: false,
  progressError: null,
  isAuthenticating: false,
  authWalletAddress: null,
  authLock: {
    isLocked: false,
    startTime: 0,
    walletAddress: null,
    abortController: null,
    requestId: null,
  },
  authError: null,

  // Methods
  startStep: jest.fn(),
  completeStep: jest.fn(),
  failStep: jest.fn(),
  resetProgress: jest.fn(),
  reset: jest.fn(),
  acquireAuthLock: jest.fn().mockReturnValue(true),
  releaseAuthLock: jest.fn(),
  getStepStatus: jest.fn().mockImplementation((step: AuthStep) => {
    const completedSteps = overrides.completedSteps || new Set(['connect-wallet'])
    if (completedSteps.has(step)) return 'completed'
    if (overrides.currentStep === step) return 'in-progress'
    if (overrides.failedStep === step) return 'failed'
    return 'pending'
  }),
  getStepInfo: jest.fn().mockReturnValue(null),
  getAllSteps: jest.fn().mockReturnValue(['connect-wallet', 'generate-message', 'request-signature', 'verify-signature', 'firebase-auth']),
  getCurrentStepInfo: jest.fn().mockReturnValue(null),
  getCompletedStepsCount: jest.fn().mockImplementation(() => {
    const completedSteps = overrides.completedSteps || new Set(['connect-wallet'])
    return completedSteps.size
  }),
  setAuthLock: jest.fn(),
  setAuthError: jest.fn(),

  // Apply overrides
  ...overrides,
})

// Wallet Store Factory - Enhanced with full interface
export const createMockWalletStore = (
  overrides: Partial<{
    isConnected: boolean
    address: string | undefined
    chainId: number | undefined
    connectionError: string | null
    isConnecting: boolean
  }> = {}
) => ({
  // State
  isConnected: false,
  address: undefined,
  chainId: undefined,
  connectionError: null,
  isConnecting: false,

  // Methods
  connect: jest.fn(),
  disconnect: jest.fn(),
  updateConnectionState: jest.fn(),
  setConnectionError: jest.fn(),
  captureState: jest.fn(),
  validateState: jest.fn(),

  // Apply overrides
  ...overrides,
})

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
