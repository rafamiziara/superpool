/**
 * Internal Store Mocks
 *
 * Consolidated mocks for MobX stores
 * These are basic mocks - use factory functions for specific test scenarios
 */

// Basic store mocks (will be enhanced by factories)
export const authStore = {
  isAuthenticated: false,
  user: null,
  authenticate: jest.fn(),
  logout: jest.fn(),
}

export const walletStore = {
  isConnected: false,
  address: null,
  connect: jest.fn(),
  disconnect: jest.fn(),
}

export const poolStore = {
  pools: [],
  loadPools: jest.fn(),
  createPool: jest.fn(),
}

// Default export combining all store mocks
export default {
  authStore,
  walletStore,
  poolStore,
}
