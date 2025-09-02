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
