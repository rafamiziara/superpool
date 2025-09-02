/**
 * Service Mock Factory Functions
 *
 * Reusable factory functions for creating mock service instances with custom configurations
 */

// Signature Service Factory
export const createMockSignatureService = (
  overrides: Partial<{
    signMessage: jest.Mock
    verifySignature: jest.Mock
  }> = {}
) => ({
  signMessage: jest.fn().mockResolvedValue('0xmockedsignature'),
  verifySignature: jest.fn().mockResolvedValue(true),
  generateNonce: jest.fn().mockResolvedValue('mock-nonce'),
  ...overrides,
})

// Firebase Service Factory
export const createMockFirebaseService = (
  overrides: Partial<{
    callFunction: jest.Mock
    authenticate: jest.Mock
    isAuthenticated: boolean
  }> = {}
) => ({
  callFunction: jest.fn().mockResolvedValue({ data: {} }),
  authenticate: jest.fn().mockResolvedValue({ user: null }),
  isAuthenticated: false,
  getCurrentUser: jest.fn().mockReturnValue(null),
  ...overrides,
})

// Blockchain Service Factory
export const createMockBlockchainService = (
  overrides: Partial<{
    readContract: jest.Mock
    writeContract: jest.Mock
    isConnected: boolean
  }> = {}
) => ({
  readContract: jest.fn().mockResolvedValue(null),
  writeContract: jest.fn().mockResolvedValue({ hash: '0xmocktxhash' }),
  isConnected: false,
  getBalance: jest.fn().mockResolvedValue('0'),
  getChainId: jest.fn().mockResolvedValue(1),
  ...overrides,
})

// Combined Service Factory (creates all services at once)
export const createMockServices = (
  overrides: Partial<{
    signature: unknown
    firebase: unknown
    blockchain: unknown
  }> = {}
) => ({
  signature: createMockSignatureService(),
  firebase: createMockFirebaseService(),
  blockchain: createMockBlockchainService(),
  ...overrides,
})
