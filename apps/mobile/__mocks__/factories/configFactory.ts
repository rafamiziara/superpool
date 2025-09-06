/**
 * Configuration Mock Factory Functions
 *
 * Centralized factory functions for creating mock configuration objects with custom values.
 * This provides a consistent way to mock application constants and configuration across tests.
 */

/**
 * Session Storage Keys Configuration Mock
 */
export const createMockSessionStorageKeys = (
  overrides: Partial<{
    REOWN_APPKIT: string
    WALLETCONNECT_V2: string
    AUTH_STATE: string
    USER_PREFERENCES: string
  }> = {}
) => ({
  REOWN_APPKIT: 'reown_appkit_session',
  WALLETCONNECT_V2: 'walletconnect_v2_session',
  AUTH_STATE: 'auth_state',
  USER_PREFERENCES: 'user_preferences',
  ...overrides,
})

/**
 * Session Configuration Mock for testing session management
 */
export const createMockSessionConfig = (
  overrides: Partial<{
    SESSION_STORAGE_KEYS: ReturnType<typeof createMockSessionStorageKeys>
    SESSION_ERROR_INDICATORS: string[]
    SESSION_ID_PATTERNS: RegExp[]
    RELAYER_ERROR_INDICATORS: string[]
    REOWN_APPKIT_SESSION_KEY: string
    WALLETCONNECT_SESSION_KEY: string
    SESSION_TIMEOUTS: {
      DEFAULT_MAX_AGE: number
      CLEANUP_BATCH_SIZE: number
      CLEANUP_DELAY: number
    }
  }> = {}
) => ({
  SESSION_STORAGE_KEYS: createMockSessionStorageKeys(),
  SESSION_ERROR_INDICATORS: ['session', 'relayer', 'pairing', 'expired', 'timeout', 'connection', 'failed'],
  SESSION_ID_PATTERNS: [/^[a-f0-9]{64}$/i, /session:\s*([a-f0-9]{64})/i],
  RELAYER_ERROR_INDICATORS: ['relayer connection failed', 'relayer timeout', 'relayer error', 'websocket', 'network'],
  REOWN_APPKIT_SESSION_KEY: 'reown_appkit_session',
  WALLETCONNECT_SESSION_KEY: 'walletconnect_session',
  SESSION_TIMEOUTS: {
    DEFAULT_MAX_AGE: 86400000,
    CLEANUP_BATCH_SIZE: 10,
    CLEANUP_DELAY: 100,
  },
  ...overrides,
})

/**
 * Auth Validation Configuration Mock
 */
export const createMockAuthValidation = (
  overrides: Partial<{
    MAX_NONCE_LENGTH: number
    MAX_MESSAGE_LENGTH: number
    MAX_TIMESTAMP_AGE: number
    MIN_SIGNATURE_LENGTH: number
  }> = {}
) => ({
  MAX_NONCE_LENGTH: 100,
  MAX_MESSAGE_LENGTH: 2000,
  MAX_TIMESTAMP_AGE: 600000, // 10 minutes
  MIN_SIGNATURE_LENGTH: 10,
  ...overrides,
})

/**
 * Signature Formats Configuration Mock
 */
export const createMockSignatureFormats = (
  overrides: Partial<{
    SAFE_WALLET_PREFIX: string
    HEX_PREFIX: string
    SAFE_TOKEN_PARTS: number
  }> = {}
) => ({
  SAFE_WALLET_PREFIX: 'safe-wallet:',
  HEX_PREFIX: '0x',
  SAFE_TOKEN_PARTS: 4,
  ...overrides,
})

/**
 * Wallet Address Format Configuration Mock
 */
export const createMockWalletAddressFormat = (
  overrides: Partial<{
    LENGTH: number
    HEX_CHARS: number
    PATTERN: RegExp
  }> = {}
) => ({
  LENGTH: 42,
  HEX_CHARS: 40,
  PATTERN: /^0x[a-fA-F0-9]{40}$/,
  ...overrides,
})

/**
 * Validation Utils Configuration Mock
 * Complete mock for ValidationUtils.test.ts
 */
export const createMockValidationConfig = (
  overrides: Partial<{
    AUTH_VALIDATION: ReturnType<typeof createMockAuthValidation>
    SIGNATURE_FORMATS: ReturnType<typeof createMockSignatureFormats>
    SUPPORTED_CHAIN_IDS: number[]
    WALLET_ADDRESS_FORMAT: ReturnType<typeof createMockWalletAddressFormat>
  }> = {}
) => ({
  AUTH_VALIDATION: createMockAuthValidation(),
  SIGNATURE_FORMATS: createMockSignatureFormats(),
  SUPPORTED_CHAIN_IDS: [1, 137, 80002, 31337],
  WALLET_ADDRESS_FORMAT: createMockWalletAddressFormat(),
  ...overrides,
})

/**
 * Complete Configuration Factory
 * Combines all configuration mocks for comprehensive testing
 */
export const createMockAppConfig = (
  overrides: Partial<{
    session: ReturnType<typeof createMockSessionConfig>
    validation: ReturnType<typeof createMockValidationConfig>
  }> = {}
) => ({
  session: createMockSessionConfig(),
  validation: createMockValidationConfig(),
  ...overrides,
})

/**
 * Quick presets for common testing scenarios
 */
export const configMockPresets = {
  /**
   * Standard session management configuration
   */
  sessionManagement: () => createMockSessionConfig(),

  /**
   * Validation testing configuration
   */
  validation: () => createMockValidationConfig(),

  /**
   * Complete app configuration for integration tests
   */
  fullApp: () => createMockAppConfig(),

  /**
   * Custom timeout configuration for performance tests
   */
  fastTimeouts: () =>
    createMockSessionConfig({
      SESSION_TIMEOUTS: {
        DEFAULT_MAX_AGE: 1000,
        CLEANUP_BATCH_SIZE: 5,
        CLEANUP_DELAY: 10,
      },
    }),

  /**
   * Alternative chain configuration for multi-chain tests
   */
  multiChain: () =>
    createMockValidationConfig({
      SUPPORTED_CHAIN_IDS: [1, 137, 80002, 31337, 42161, 10], // Include Arbitrum and Optimism
    }),
} as const
