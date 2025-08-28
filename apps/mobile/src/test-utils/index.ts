/**
 * Centralized export of all test utilities
 * Import from this file to get all testing helpers
 */

export * from './mockStores'
export * from './testProviders'
export * from './renderWithStore'

/**
 * Common test utilities and helpers
 */

/**
 * Wait for MobX reactions to settle
 * Useful when testing computed values or reactions
 */
export const waitForMobX = async (timeout = 100): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout)
  })
}

/**
 * Mock Firebase Auth user object for testing
 */
export const createMockFirebaseUser = (overrides: Record<string, unknown> = {}) => ({
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
  photoURL: null,
  phoneNumber: null,
  ...overrides,
})

/**
 * Mock Ethereum address for testing
 */
export const MOCK_ETH_ADDRESS = '0x1234567890123456789012345678901234567890'
export const MOCK_ETH_ADDRESS_2 = '0x0987654321098765432109876543210987654321'

/**
 * Common test chain IDs
 */
export const TEST_CHAIN_IDS = {
  ETHEREUM_MAINNET: 1,
  POLYGON_MAINNET: 137,
  POLYGON_AMOY: 80002,
  LOCALHOST: 31337,
} as const
