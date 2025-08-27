/**
 * Centralized barrel export for SuperPool mobile utilities
 * Provides clean, organized access to all utility functions and classes
 */

// ==========================================
// CORE UTILITIES
// ==========================================

// Validation utilities
export type { SupportedChainId } from './constants'
export { ValidationUtils } from './ValidationUtils'

// Session management
export { SessionManager } from './sessionManager'

// Firebase utilities
export { customAppCheckProviderFactory } from './appCheckProvider'
export { firebaseAuthManager } from './firebaseAuthManager'

// ==========================================
// LOGGING & ERROR HANDLING
// ==========================================

// Secure logging
export {
  createServiceContext,
  debug,
  devOnly,
  error,
  info,
  logAuthStep,
  logRecoveryAction,
  logServiceError,
  logServiceOperation,
  logSignaturePreview,
  logWalletAddress,
  secureLogger,
  warn,
} from './secureLogger'

// Error handling
export { categorizeError, createAppError, ERROR_MESSAGES, ErrorType, isUserInitiatedError, type AppError } from './errorHandling'

// Toast notifications
export {
  appToasts,
  authToasts,
  showErrorFromAppError,
  showErrorToast,
  showInfoToast,
  showSuccessToast,
  showWarningToast,
  type ToastType,
} from './toast'

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

export {
  // Authentication constants
  AUTH_TIMEOUTS,
  AUTH_VALIDATION,
  // Error handling constants
  ERROR_RETRY_CONFIG,
  // Firebase constants
  FIREBASE_CONFIG,
  // Logging constants
  LOG_LEVELS,
  LOGGING_CONFIG,
  RELAYER_ERROR_INDICATORS,
  REOWN_APPKIT_SESSION_KEY,
  SESSION_ERROR_INDICATORS,
  SESSION_ID_PATTERNS,
  // Session constants
  SESSION_STORAGE_KEYS,
  SESSION_TIMEOUTS,
  // Signature constants
  SIGNATURE_FORMATS,
  SUPPORTED_CHAIN_IDS,

  // UI constants
  TOAST_DURATIONS,
  TOAST_POSITIONS,
  WALLET_ADDRESS_FORMAT,
  WALLETCONNECT_SESSION_KEY,
  type AuthTimeout,
  type LogLevel,
  // Validation patterns
  // Type exports
  type ToastDuration,
  type ToastPosition,
} from './constants'
