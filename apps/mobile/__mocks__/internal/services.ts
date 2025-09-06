/**
 * Internal Service Mocks
 *
 * Consolidated mocks for service modules
 * These are basic mocks - use factory functions for specific test scenarios
 */

// Basic service mocks (will be enhanced by factories)
export const signatureService = {
  signMessage: jest.fn(),
  verifySignature: jest.fn(),
}

export const firebaseService = {
  callFunction: jest.fn(),
  authenticate: jest.fn(),
}

export const blockchainService = {
  readContract: jest.fn(),
  writeContract: jest.fn(),
}

// Default export combining all service mocks
export default {
  signatureService,
  firebaseService,
  blockchainService,
}
