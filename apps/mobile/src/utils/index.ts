/**
 * Centralized barrel export for SuperPool mobile utilities
 * Provides clean, organized access to all utility functions and classes
 */

// ==========================================
// CORE UTILITIES
// ==========================================

// Validation utilities
export { ValidationUtils } from './ValidationUtils'
export type { SupportedChainId } from './ValidationUtils'

// Session management
export { SessionManager } from './sessionManager'

// Firebase utilities  
export { firebaseAuthManager } from './firebaseAuthManager'
export { customAppCheckProviderFactory } from './appCheckProvider'

// ==========================================
// LOGGING & ERROR HANDLING
// ==========================================

// Secure logging
export { secureLogger } from './secureLogger'
export { 
  debug, 
  info, 
  warn, 
  error, 
  devOnly,
  logWalletAddress,
  logSignaturePreview,
  logAuthStep,
  logServiceOperation,
  logServiceError,
  logRecoveryAction,
  createServiceContext
} from './secureLogger'

// Error handling
export { 
  ErrorType, 
  ERROR_MESSAGES, 
  createAppError, 
  categorizeError,
  type AppError 
} from './errorHandling'

// Toast notifications
export {
  showSuccessToast,
  showErrorToast,
  showInfoToast,
  showWarningToast,
  showErrorFromAppError,
  authToasts,
  appToasts,
  type ToastType
} from './toast'

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

export {
  // Session constants
  SESSION_STORAGE_KEYS,
  SESSION_TIMEOUTS,
  SESSION_ERROR_INDICATORS,
  RELAYER_ERROR_INDICATORS,
  SESSION_ID_PATTERNS,
  
  // Authentication constants  
  AUTH_TIMEOUTS,
  AUTH_VALIDATION,
  SUPPORTED_CHAIN_IDS,
  
  // UI constants
  TOAST_DURATIONS,
  TOAST_POSITIONS,
  
  // Logging constants
  LOG_LEVELS,
  LOGGING_CONFIG,
  
  // Firebase constants
  FIREBASE_CONFIG,
  
  // Signature constants
  SIGNATURE_FORMATS,
  WALLET_ADDRESS_FORMAT,
  
  // Error handling constants
  ERROR_RETRY_CONFIG,
  
  // Validation patterns
  
  // Type exports
  type ToastDuration,
  type ToastPosition,
  type LogLevel,
  type AuthTimeout
} from './constants'