/**
 * Store Mock Factory Functions
 *
 * Reusable factory functions for creating mock store instances with custom configurations
 */

// Authentication Store Factory
export const createMockAuthStore = (
  overrides: Partial<{
    isAuthenticated: boolean
    user: unknown
    walletAddress: string | null
    isLoading: boolean
  }> = {}
) => ({
  isAuthenticated: false,
  user: null,
  walletAddress: null,
  isLoading: false,
  authenticate: jest.fn(),
  logout: jest.fn(),
  setUser: jest.fn(),
  setWalletAddress: jest.fn(),
  ...overrides,
})

// Wallet Connection Store Factory
export const createMockWalletStore = (
  overrides: Partial<{
    isConnected: boolean
    address: string | null
    chain: unknown
    isConnecting: boolean
  }> = {}
) => ({
  isConnected: false,
  address: null,
  chain: null,
  isConnecting: false,
  connect: jest.fn(),
  disconnect: jest.fn(),
  switchChain: jest.fn(),
  ...overrides,
})

// Pool Management Store Factory
export const createMockPoolStore = (
  overrides: Partial<{
    pools: unknown[]
    selectedPool: unknown
    isLoading: boolean
  }> = {}
) => ({
  pools: [],
  selectedPool: null,
  isLoading: false,
  loadPools: jest.fn(),
  createPool: jest.fn(),
  selectPool: jest.fn(),
  updatePool: jest.fn(),
  ...overrides,
})

// Root Store Factory (combines all stores)
export const createMockRootStore = (
  overrides: Partial<{
    auth: unknown
    wallet: unknown
    pools: unknown
  }> = {}
) => ({
  auth: createMockAuthStore(),
  wallet: createMockWalletStore(),
  pools: createMockPoolStore(),
  ...overrides,
})
