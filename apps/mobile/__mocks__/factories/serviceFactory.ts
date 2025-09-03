/**
 * Service Mock Factory Functions
 *
 * Centralized factory functions for creating mock service instances.
 * Includes authentication services, API clients, and other business logic services.
 */

/**
 * Authentication Orchestrator Factory
 * Mocks the main authentication service that coordinates the auth flow
 */
export const createMockAuthenticationOrchestrator = (
  overrides: Partial<{
    authenticate: jest.Mock
    handleDisconnection: jest.Mock
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
    executeStep: jest.Mock
    executeLockStep: jest.Mock
    executeInternalStep: jest.Mock
  }> = {}
) => ({
  executeStep: jest.fn().mockImplementation(async (stepName: string, stepFunction: () => Promise<any>) => {
    // Actually call the step function to ensure coverage
    return await stepFunction()
  }),
  executeLockStep: jest.fn().mockImplementation(async (stepFunction: () => Promise<any>) => {
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
