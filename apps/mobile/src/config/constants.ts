/**
 * Shared constants for the SuperPool mobile application
 * Centralizes all configuration values, timeouts, and magic numbers
 */

// ==========================================
// WALLETCONNECT & SESSION CONSTANTS
// ==========================================

export const SESSION_STORAGE_KEYS = {
  WALLETCONNECT: '@walletconnect/client0.3//session',
  REOWN_APPKIT: '@reown/appkit',
} as const

// Legacy constants for backward compatibility
export const WALLETCONNECT_SESSION_KEY = SESSION_STORAGE_KEYS.WALLETCONNECT
export const REOWN_APPKIT_SESSION_KEY = SESSION_STORAGE_KEYS.REOWN_APPKIT

export const SESSION_TIMEOUTS = {
  DEFAULT_MAX_AGE: 86400000, // 24 hours in ms
  CLEANUP_BATCH_SIZE: 10,
  CLEANUP_DELAY: 100, // ms between batch operations
} as const

// ==========================================
// AUTHENTICATION CONSTANTS
// ==========================================

export const AUTH_TIMEOUTS = {
  REGULAR_WALLET: 15000, // 15s for regular wallets
  SAFE_WALLET: 20000, // 20s for Safe wallets
  CONNECT_WALLET: 30000, // 30s for wallet connection
  SIGNATURE_REQUEST: 25000, // 25s for signature requests
  VERIFICATION: 15000, // 15s for signature verification
  FIREBASE_AUTH: 10000, // 10s for Firebase operations
} as const

export const AUTH_VALIDATION = {
  MAX_TIMESTAMP_AGE: 600000, // 10 minutes
  MAX_NONCE_LENGTH: 100,
  MAX_MESSAGE_LENGTH: 2000,
  MIN_SIGNATURE_LENGTH: 10,
} as const

export const SUPPORTED_CHAIN_IDS = [1, 137, 80002, 31337] as const

// ==========================================
// UI CONSTANTS
// ==========================================

export const TOAST_DURATIONS = {
  DEFAULT: 4000,
  SHORT: 3000,
  LONG: 5000,
  EXTENDED: 8000,
  WALLET_SWITCHING: 12000,
  SIGNATURE_GUIDANCE: 15000,
} as const

export const TOAST_POSITIONS = {
  TOP: 'top',
  BOTTOM: 'bottom',
} as const

// ==========================================
// LOGGING CONSTANTS
// ==========================================

export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

export const LOGGING_CONFIG = {
  MAX_LOG_LENGTH: 10000,
  MAX_ERROR_STACK_DEPTH: 10,
  SENSITIVE_FIELD_TRUNCATION: 16,
} as const

// ==========================================
// FIREBASE CONSTANTS
// ==========================================

export const FIREBASE_CONFIG = {
  APP_CHECK_MINTER_ENDPOINT: 'customAppCheckMinter',
  DUMMY_TOKEN_EXPIRY: 60000, // 1 minute
} as const

// ==========================================
// WALLET SIGNATURE CONSTANTS
// ==========================================

export const SIGNATURE_FORMATS = {
  SAFE_WALLET_PREFIX: 'safe-wallet:',
  HEX_PREFIX: '0x',
  SAFE_TOKEN_PARTS: 4, // safe-wallet:address:nonce:timestamp
} as const

export const WALLET_ADDRESS_FORMAT = {
  LENGTH: 42, // 0x + 40 hex characters
  HEX_CHARS: 40,
  PATTERN: /^0x[a-fA-F0-9]{40}$/,
} as const

// ==========================================
// ERROR HANDLING CONSTANTS
// ==========================================

export const ERROR_RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000,
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY: 10000,
} as const

export const SESSION_ERROR_INDICATORS = [
  'No matching key',
  'session:',
  'pairing',
  'WalletConnect',
  'relayer',
  'expired session',
  'invalid session',
  'session not found',
  'session timeout',
] as const

export const RELAYER_ERROR_INDICATORS = ['relayer', 'websocket', 'connection failed', 'network error', 'timeout', 'disconnected'] as const

// ==========================================
// VALIDATION PATTERNS
// ==========================================

export const SESSION_ID_PATTERNS = [
  /session:\s*([a-f0-9]{64})/i, // session: followed by 64 hex chars
  /session_([a-f0-9]{64})/i, // session_ followed by 64 hex chars
  /"session":\s*"([a-f0-9]{64})"/i, // JSON format with session key
  /sessionId[=:]\s*([a-f0-9]{64})/i, // sessionId= or sessionId: format
] as const

// ==========================================
// TYPE EXPORTS
// ==========================================

export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]
export type ToastDuration = (typeof TOAST_DURATIONS)[keyof typeof TOAST_DURATIONS]
export type ToastPosition = (typeof TOAST_POSITIONS)[keyof typeof TOAST_POSITIONS]
export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS]
export type AuthTimeout = (typeof AUTH_TIMEOUTS)[keyof typeof AUTH_TIMEOUTS]
