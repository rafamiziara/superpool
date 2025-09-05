/**
 * Service Mock Factory Functions
 *
 * Centralized factory functions for creating mock service instances.
 * Includes authentication services, API clients, and other business logic services.
 */

type MockFn<TArgs extends unknown[] = unknown[], TReturn = unknown> = jest.Mock<TReturn, TArgs>

/**
 * Authentication Orchestrator Factory
 * Mocks the main authentication service that coordinates the auth flow
 */
export const createMockAuthenticationOrchestrator = (
  overrides: Partial<{
    authenticate: MockFn<[context: unknown], Promise<void>>
    handleDisconnection: MockFn<[], Promise<void>>
  }> = {}
) => ({
  authenticate: jest.fn().mockResolvedValue({ success: true }),
  handleDisconnection: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

/**
 * Firebase Auth Manager Factory
 * Mocks the Firebase authentication manager
 */
export const createMockFirebaseAuthManager = (
  overrides: Partial<{
    getCurrentState: jest.Mock
    addListener: jest.Mock
    signOut: jest.Mock
    auth: {
      currentUser: { uid: string } | null
      signOut: jest.Mock
    }
  }> = {}
) => ({
  getCurrentState: jest.fn(() => ({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    walletAddress: null,
  })),
  addListener: jest.fn((callback) => {
    callback({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      walletAddress: null,
    })
    return jest.fn() // cleanup function
  }),
  signOut: jest.fn().mockResolvedValue(undefined),
  auth: {
    currentUser: null as { uid: string } | null,
    signOut: jest.fn(() => Promise.resolve()),
  },
  ...overrides,
})

/**
 * API Client Factory
 * Mocks HTTP API clients for backend communication
 */
export const createMockApiClient = (
  overrides: Partial<{
    get: jest.Mock
    post: jest.Mock
    put: jest.Mock
    delete: jest.Mock
  }> = {}
) => ({
  get: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  post: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  put: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  delete: jest.fn().mockResolvedValue({ data: {}, status: 200 }),
  ...overrides,
})

/**
 * Pool Service Factory
 * Mocks the pool management service
 */
export const createMockPoolService = (
  overrides: Partial<{
    loadPools: jest.Mock
    createPool: jest.Mock
    joinPool: jest.Mock
    leavePool: jest.Mock
  }> = {}
) => ({
  loadPools: jest.fn().mockResolvedValue([]),
  createPool: jest.fn().mockResolvedValue({ id: 'mock-pool-id' }),
  joinPool: jest.fn().mockResolvedValue(undefined),
  leavePool: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

/**
 * Signature Service Factory
 * Mocks wallet signature services
 */
export const createMockSignatureService = (
  overrides: Partial<{
    signMessage: jest.Mock
    signTypedData: jest.Mock
    verifySignature: jest.Mock
  }> = {}
) => ({
  signMessage: jest.fn().mockResolvedValue('0xmockedsignature'),
  signTypedData: jest.fn().mockResolvedValue('0xmockedsignature'),
  verifySignature: jest.fn().mockResolvedValue(true),
  ...overrides,
})

/**
 * Authentication Step Executor Factory
 * Mocks the step executor for authentication flow
 */
export const createMockAuthenticationStepExecutor = (
  overrides: Partial<{
    executeStep: MockFn<[stepName: string, stepFunction: () => Promise<void>], Promise<void>>
    executeLockStep: MockFn<[stepFunction: () => Promise<void>], Promise<void>>
    executeInternalStep: MockFn<[], void>
  }> = {}
) => ({
  executeStep: jest.fn().mockImplementation(async (stepName: string, stepFunction: () => Promise<void>): Promise<void> => {
    // Actually call the step function to ensure coverage
    return await stepFunction()
  }),
  executeLockStep: jest.fn().mockImplementation(async (stepFunction: () => Promise<void>): Promise<void> => {
    // Actually call the step function to ensure coverage
    return await stepFunction()
  }),
  executeInternalStep: jest.fn(),
  ...overrides,
})

/**
 * Authentication Validator Factory
 * Mocks validation services for authentication
 */
export const createMockAuthenticationValidator = (
  overrides: Partial<{
    validatePreConditions: jest.Mock
    validateStateConsistency: jest.Mock
    checkAuthenticationAborted: jest.Mock
    captureConnectionState: jest.Mock
  }> = {}
) => ({
  validatePreConditions: jest.fn(),
  validateStateConsistency: jest.fn().mockReturnValue(true),
  checkAuthenticationAborted: jest.fn().mockReturnValue(false),
  captureConnectionState: jest.fn().mockReturnValue({
    address: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
    chainId: 137,
    isConnected: true,
    timestamp: Date.now(),
    sequenceNumber: 1,
  }),
  ...overrides,
})

/**
 * Firebase Authenticator Factory
 * Mocks Firebase authentication services
 */
export const createMockFirebaseAuthenticator = (
  overrides: Partial<{
    verifySignatureAndGetToken: jest.Mock
    signInWithFirebase: jest.Mock
  }> = {}
) => ({
  verifySignatureAndGetToken: jest.fn().mockResolvedValue('mock-firebase-token'),
  signInWithFirebase: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

/**
 * Message Generator Factory
 * Mocks authentication message generation
 */
export const createMockMessageGenerator = (
  overrides: Partial<{
    generateAuthenticationMessage: jest.Mock
  }> = {}
) => ({
  generateAuthenticationMessage: jest.fn().mockResolvedValue({
    message: 'Mock auth message',
    nonce: 'mock-nonce',
    timestamp: Date.now(),
  }),
  ...overrides,
})

/**
 * Signature Handler Factory
 * Mocks signature request handling
 */
export const createMockSignatureHandler = (
  overrides: Partial<{
    requestWalletSignature: jest.Mock
  }> = {}
) => ({
  requestWalletSignature: jest.fn().mockResolvedValue({
    signature: 'mock-signature',
    signatureType: 'personal-sign',
    walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
  }),
  ...overrides,
})

/**
 * Auth Error Recovery Service Factory
 * Mocks error recovery services
 */
export const createMockAuthErrorRecoveryService = (
  overrides: Partial<{
    initialize: jest.Mock
    handleAuthenticationError: jest.Mock
    showErrorFeedback: jest.Mock
    handleFirebaseCleanup: jest.Mock
  }> = {}
) => ({
  initialize: jest.fn(),
  handleAuthenticationError: jest.fn().mockResolvedValue({
    appError: new Error('Mock error'),
    recoveryResult: {
      shouldDisconnect: false,
      shouldShowError: true,
      errorDelay: 0,
      cleanupPerformed: false,
    },
  }),
  showErrorFeedback: jest.fn(),
  handleFirebaseCleanup: jest.fn(),
  ...overrides,
})

/**
 * Session Manager Factory
 * Mocks session management utilities
 */
export const createMockSessionManager = (
  overrides: Partial<{
    getSessionDebugInfo: jest.Mock
    detectSessionCorruption: jest.Mock
    handleSessionCorruption: jest.Mock
    clearAllWalletConnectSessions: jest.Mock
    clearSpecificSession: jest.Mock
    hasValidSession: jest.Mock
    forceResetAllConnections: jest.Mock
    clearQueryCache: jest.Mock
    clearSessionByErrorId: jest.Mock
    preventiveSessionCleanup: jest.Mock
  }> = {}
) => ({
  getSessionDebugInfo: jest.fn().mockResolvedValue({
    totalKeys: 5,
    walletConnectKeys: ['key1', 'key2'],
    sessionData: {},
  }),
  detectSessionCorruption: jest.fn().mockReturnValue(false),
  handleSessionCorruption: jest.fn().mockResolvedValue(undefined),
  clearAllWalletConnectSessions: jest.fn().mockResolvedValue(undefined),
  clearSpecificSession: jest.fn().mockResolvedValue(undefined),
  hasValidSession: jest.fn().mockResolvedValue(false),
  forceResetAllConnections: jest.fn().mockResolvedValue(undefined),
  clearQueryCache: jest.fn().mockResolvedValue(undefined),
  clearSessionByErrorId: jest.fn().mockResolvedValue(undefined),
  preventiveSessionCleanup: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

/**
 * Router Factory
 * Mocks router navigation
 */
export const createMockRouter = (
  overrides: Partial<{
    replace: jest.Mock
  }> = {}
) => ({
  replace: jest.fn(),
  ...overrides,
})

/**
 * Signature Strategy Factory
 * Mocks the signature strategy factory
 */
export const createMockSignatureStrategyFactory = (
  overrides: Partial<{
    getStrategy: jest.Mock
  }> = {}
) => ({
  getStrategy: jest.fn().mockReturnValue({
    getStrategyName: jest.fn().mockReturnValue('mock-strategy'),
    sign: jest.fn().mockResolvedValue({
      signature: '0xmockedsignature',
      signatureType: 'personal-sign',
    }),
    canHandle: jest.fn().mockReturnValue(true),
  }),
  ...overrides,
})

/**
 * Signature Utils Factory
 * Mocks signature utility functions
 */
export const createMockSignatureUtils = (
  overrides: Partial<{
    isValidSignatureFormat: jest.Mock
  }> = {}
) => ({
  isValidSignatureFormat: jest.fn().mockReturnValue(true),
  ...overrides,
})

/**
 * Dev Utils Factory
 * Mocks development utility functions
 */
export const createMockDevUtils = (
  overrides: Partial<{
    devOnly: jest.Mock
  }> = {}
) => ({
  devOnly: jest.fn(),
  ...overrides,
})

/**
 * Connector Factory
 * Mocks Wagmi connector instances
 */
export const createMockConnector = (
  overrides: Partial<{
    id: string
    name: string
    type: string
    icon: string | undefined
    rdns: string | undefined
    supportsSimulation: boolean
    uid: string
    setup: jest.Mock
    connect: jest.Mock
    disconnect: jest.Mock
    getAccounts: jest.Mock
    getChainId: jest.Mock
    getProvider: jest.Mock
    switchChain: jest.Mock
    isAuthorized: jest.Mock
    emitter: {
      emit: jest.Mock
      listenerCount: jest.Mock
      listeners: jest.Mock
      off: jest.Mock
      on: jest.Mock
      once: jest.Mock
      removeAllListeners: jest.Mock
    }
  }> = {}
) => ({
  id: 'mock-connector',
  name: 'Mock Connector',
  type: 'injected',
  icon: undefined,
  rdns: undefined,
  supportsSimulation: true,
  uid: 'mock-uid-123',
  setup: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  getAccounts: jest.fn(),
  getChainId: jest.fn(),
  getProvider: jest.fn(),
  switchChain: jest.fn(),
  isAuthorized: jest.fn(),
  emitter: {
    emit: jest.fn(),
    listenerCount: jest.fn(),
    listeners: jest.fn(),
    off: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  ...overrides,
})

/**
 * Signature Functions Factory
 * Mocks Wagmi signature functions
 */
export const createMockSignatureFunctions = (
  overrides: Partial<{
    signTypedDataAsync: jest.Mock
    signMessageAsync: jest.Mock
  }> = {}
) => ({
  signTypedDataAsync: jest.fn().mockResolvedValue('0xmocked-typed-signature'),
  signMessageAsync: jest.fn().mockResolvedValue('0xmocked-signature'),
  ...overrides,
})

/**
 * Enhanced Auth Toasts Factory
 * Mocks authentication toast notifications with additional success method
 */
export const createMockEnhancedAuthToasts = (
  overrides: Partial<{
    success: jest.Mock
    authSuccess: jest.Mock
    walletConnected: jest.Mock
    walletDisconnected: jest.Mock
    connectionFailed: jest.Mock
    signatureRejected: jest.Mock
    networkMismatch: jest.Mock
    sessionRecovery: jest.Mock
    sessionExpired: jest.Mock
  }> = {}
) => ({
  success: jest.fn(),
  authSuccess: jest.fn(),
  walletConnected: jest.fn(),
  walletDisconnected: jest.fn(),
  connectionFailed: jest.fn(),
  signatureRejected: jest.fn(),
  networkMismatch: jest.fn(),
  sessionRecovery: jest.fn(),
  sessionExpired: jest.fn(),
  ...overrides,
})

/**
 * Firebase Auth Factory
 * Mocks Firebase auth instance
 */
export const createMockFirebaseAuth = (
  overrides: Partial<{
    currentUser: { uid: string } | null
  }> = {}
) => ({
  currentUser: null as { uid: string } | null,
  ...overrides,
})
