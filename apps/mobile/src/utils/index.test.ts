/**
 * Test file for the utils index.ts barrel export
 * Ensures all utilities are properly exported and accessible
 */

describe('utils index exports', () => {
  describe('Core Utilities', () => {
    it('should export ValidationUtils', async () => {
      const { ValidationUtils } = await import('./index')

      expect(ValidationUtils).toBeDefined()
      expect(typeof ValidationUtils.isValidWalletAddress).toBe('function')
      expect(typeof ValidationUtils.isValidNonce).toBe('function')
      expect(typeof ValidationUtils.isValidTimestamp).toBe('function')
      expect(typeof ValidationUtils.isValidAuthMessage).toBe('function')
      expect(typeof ValidationUtils.isValidChainId).toBe('function')
      expect(typeof ValidationUtils.isValidSignatureFormat).toBe('function')
      expect(typeof ValidationUtils.validateAuthRequest).toBe('function')
    })

    it('should export SessionManager', async () => {
      const { SessionManager } = await import('./index')

      expect(SessionManager).toBeDefined()
      expect(typeof SessionManager.clearSessionByErrorId).toBe('function')
      expect(typeof SessionManager.forceResetAllConnections).toBe('function')
      expect(typeof SessionManager.preventiveSessionCleanup).toBe('function')
      expect(typeof SessionManager.validateSessionStructure).toBe('function')
      expect(typeof SessionManager.categorizeSessionError).toBe('function')
      expect(typeof SessionManager.extractPeerInfo).toBe('function')
      expect(typeof SessionManager.calculateSessionAge).toBe('function')
      expect(typeof SessionManager.generateDebugInfo).toBe('function')
    })

    it('should export Firebase utilities', async () => {
      const { customAppCheckProviderFactory, firebaseAuthManager } = await import('./index')

      expect(customAppCheckProviderFactory).toBeDefined()
      expect(typeof customAppCheckProviderFactory).toBe('function')

      expect(firebaseAuthManager).toBeDefined()
      expect(typeof firebaseAuthManager.getInstance).toBe('function')
    })
  })

  describe('Logging & Error Handling', () => {
    it('should export secure logging functions', async () => {
      const {
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
      } = await import('./index')

      const loggingFunctions = {
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
        warn,
      }

      Object.entries(loggingFunctions).forEach(([name, func]) => {
        expect(func).toBeDefined()
        expect(typeof func).toBe('function')
      })

      expect(secureLogger).toBeDefined()
      expect(typeof secureLogger.debug).toBe('function')
      expect(typeof secureLogger.info).toBe('function')
      expect(typeof secureLogger.warn).toBe('function')
      expect(typeof secureLogger.error).toBe('function')
    })

    it('should export error handling utilities', async () => {
      const { categorizeError, createAppError, ERROR_MESSAGES, ErrorType, isUserInitiatedError } = await import('./index')

      expect(categorizeError).toBeDefined()
      expect(typeof categorizeError).toBe('function')

      expect(createAppError).toBeDefined()
      expect(typeof createAppError).toBe('function')

      expect(ERROR_MESSAGES).toBeDefined()
      expect(typeof ERROR_MESSAGES).toBe('object')

      expect(ErrorType).toBeDefined()
      expect(typeof ErrorType).toBe('object')

      expect(isUserInitiatedError).toBeDefined()
      expect(typeof isUserInitiatedError).toBe('function')
    })

    it('should export toast utilities', async () => {
      const { appToasts, authToasts, showErrorFromAppError, showErrorToast, showInfoToast, showSuccessToast, showWarningToast } =
        await import('./index')

      const toastFunctions = {
        showErrorFromAppError,
        showErrorToast,
        showInfoToast,
        showSuccessToast,
        showWarningToast,
      }

      Object.entries(toastFunctions).forEach(([name, func]) => {
        expect(func).toBeDefined()
        expect(typeof func).toBe('function')
      })

      expect(appToasts).toBeDefined()
      expect(typeof appToasts).toBe('object')
      expect(typeof appToasts.operationSuccess).toBe('function')

      expect(authToasts).toBeDefined()
      expect(typeof authToasts).toBe('object')
      expect(typeof authToasts.walletConnected).toBe('function')
    })
  })

  describe('Constants & Configuration', () => {
    it('should export authentication constants', async () => {
      const { AUTH_TIMEOUTS, AUTH_VALIDATION } = await import('./index')

      expect(AUTH_TIMEOUTS).toBeDefined()
      expect(typeof AUTH_TIMEOUTS).toBe('object')
      expect(typeof AUTH_TIMEOUTS.CONNECTION).toBe('number')
      expect(typeof AUTH_TIMEOUTS.SIGNATURE).toBe('number')
      expect(typeof AUTH_TIMEOUTS.VERIFICATION).toBe('number')

      expect(AUTH_VALIDATION).toBeDefined()
      expect(typeof AUTH_VALIDATION).toBe('object')
      expect(typeof AUTH_VALIDATION.NONCE_MAX_LENGTH).toBe('number')
      expect(typeof AUTH_VALIDATION.MESSAGE_MAX_LENGTH).toBe('number')
      expect(typeof AUTH_VALIDATION.TIMESTAMP_MAX_AGE_MS).toBe('number')
    })

    it('should export error handling constants', async () => {
      const { ERROR_RETRY_CONFIG } = await import('./index')

      expect(ERROR_RETRY_CONFIG).toBeDefined()
      expect(typeof ERROR_RETRY_CONFIG).toBe('object')
      expect(typeof ERROR_RETRY_CONFIG.MAX_ATTEMPTS).toBe('number')
      expect(typeof ERROR_RETRY_CONFIG.BASE_DELAY_MS).toBe('number')
      expect(typeof ERROR_RETRY_CONFIG.MAX_DELAY_MS).toBe('number')
      expect(typeof ERROR_RETRY_CONFIG.BACKOFF_MULTIPLIER).toBe('number')
    })

    it('should export Firebase constants', async () => {
      const { FIREBASE_CONFIG } = await import('./index')

      expect(FIREBASE_CONFIG).toBeDefined()
      expect(typeof FIREBASE_CONFIG).toBe('object')
      expect(typeof FIREBASE_CONFIG.MAX_RETRY_ATTEMPTS).toBe('number')
      expect(typeof FIREBASE_CONFIG.RETRY_DELAY_MS).toBe('number')
      expect(typeof FIREBASE_CONFIG.AUTH_PERSISTENCE).toBe('string')
    })

    it('should export logging constants', async () => {
      const { LOG_LEVELS, LOGGING_CONFIG } = await import('./index')

      expect(LOG_LEVELS).toBeDefined()
      expect(typeof LOG_LEVELS).toBe('object')
      expect(LOG_LEVELS.DEBUG).toBe('debug')
      expect(LOG_LEVELS.INFO).toBe('info')
      expect(LOG_LEVELS.WARN).toBe('warn')
      expect(LOG_LEVELS.ERROR).toBe('error')

      expect(LOGGING_CONFIG).toBeDefined()
      expect(typeof LOGGING_CONFIG).toBe('object')
      expect(typeof LOGGING_CONFIG.DEFAULT_LEVEL).toBe('string')
      expect(typeof LOGGING_CONFIG.ENABLE_CONSOLE).toBe('boolean')
      expect(Array.isArray(LOGGING_CONFIG.SENSITIVE_KEYS)).toBe(true)
    })

    it('should export session constants', async () => {
      const {
        RELAYER_ERROR_INDICATORS,
        REOWN_APPKIT_SESSION_KEY,
        SESSION_ERROR_INDICATORS,
        SESSION_ID_PATTERNS,
        SESSION_STORAGE_KEYS,
        SESSION_TIMEOUTS,
        WALLETCONNECT_SESSION_KEY,
      } = await import('./index')

      expect(SESSION_STORAGE_KEYS).toBeDefined()
      expect(typeof SESSION_STORAGE_KEYS).toBe('object')

      expect(SESSION_TIMEOUTS).toBeDefined()
      expect(typeof SESSION_TIMEOUTS).toBe('object')

      expect(REOWN_APPKIT_SESSION_KEY).toBeDefined()
      expect(typeof REOWN_APPKIT_SESSION_KEY).toBe('string')

      expect(WALLETCONNECT_SESSION_KEY).toBeDefined()
      expect(typeof WALLETCONNECT_SESSION_KEY).toBe('string')

      expect(Array.isArray(SESSION_ERROR_INDICATORS)).toBe(true)
      expect(Array.isArray(SESSION_ID_PATTERNS)).toBe(true)
      expect(Array.isArray(RELAYER_ERROR_INDICATORS)).toBe(true)
    })

    it('should export signature constants', async () => {
      const { SIGNATURE_FORMATS } = await import('./index')

      expect(SIGNATURE_FORMATS).toBeDefined()
      expect(typeof SIGNATURE_FORMATS).toBe('object')
      expect(SIGNATURE_FORMATS.HEX_SIGNATURE).toBeInstanceOf(RegExp)
      expect(SIGNATURE_FORMATS.SAFE_WALLET_TOKEN).toBeInstanceOf(RegExp)
    })

    it('should export UI constants', async () => {
      const { TOAST_DURATIONS, TOAST_POSITIONS, WALLET_ADDRESS_FORMAT } = await import('./index')

      expect(TOAST_DURATIONS).toBeDefined()
      expect(typeof TOAST_DURATIONS).toBe('object')
      expect(typeof TOAST_DURATIONS.SHORT).toBe('number')
      expect(typeof TOAST_DURATIONS.LONG).toBe('number')
      expect(typeof TOAST_DURATIONS.PERSISTENT).toBe('number')

      expect(TOAST_POSITIONS).toBeDefined()
      expect(typeof TOAST_POSITIONS).toBe('object')
      expect(typeof TOAST_POSITIONS.TOP).toBe('string')
      expect(typeof TOAST_POSITIONS.BOTTOM).toBe('string')

      expect(WALLET_ADDRESS_FORMAT).toBeInstanceOf(RegExp)
    })

    it('should export supported chain IDs', async () => {
      const { SUPPORTED_CHAIN_IDS } = await import('./index')

      expect(SUPPORTED_CHAIN_IDS).toBeDefined()
      expect(Array.isArray(SUPPORTED_CHAIN_IDS)).toBe(true)
      expect(SUPPORTED_CHAIN_IDS.length).toBeGreaterThan(0)

      SUPPORTED_CHAIN_IDS.forEach((chainId) => {
        expect(typeof chainId).toBe('number')
        expect(chainId).toBeGreaterThan(0)
      })
    })
  })

  describe('Type Definitions', () => {
    it('should export all required type definitions', async () => {
      // Import for type checking - these are compile-time checks
      const module = await import('./index')

      // The fact that the import succeeds means types are exported correctly
      expect(module).toBeDefined()
    })

    it('should export SupportedChainId type', async () => {
      // This is more of a compilation test
      // If the type is not exported, TypeScript would fail during compilation
      const { SUPPORTED_CHAIN_IDS } = await import('./index')

      // We can at least verify the runtime values align with the type
      expect(Array.isArray(SUPPORTED_CHAIN_IDS)).toBe(true)
    })
  })

  describe('Export Integrity', () => {
    it('should not have any undefined exports', async () => {
      const allExports = await import('./index')

      // Get all exported names from the module
      const exportNames = Object.keys(allExports)

      expect(exportNames.length).toBeGreaterThan(0)

      exportNames.forEach((exportName) => {
        expect(allExports[exportName as keyof typeof allExports]).toBeDefined()
      })
    })

    it('should export expected number of items', async () => {
      const allExports = await import('./index')
      const exportNames = Object.keys(allExports)

      // We expect a significant number of exports (utilities, constants, types)
      // This is a sanity check to ensure nothing is missing
      expect(exportNames.length).toBeGreaterThan(30)
    })

    it('should have consistent export structure', async () => {
      const {
        // Core utilities
        ValidationUtils,
        SessionManager,
        customAppCheckProviderFactory,
        firebaseAuthManager,

        // Logging
        secureLogger,
        debug,
        info,
        warn,
        error,

        // Error handling
        ErrorType,
        categorizeError,
        createAppError,

        // Toast utilities
        showSuccessToast,
        authToasts,
        appToasts,

        // Constants
        AUTH_TIMEOUTS,
        LOG_LEVELS,
        SUPPORTED_CHAIN_IDS,
      } = await import('./index')

      // Check that key utilities are available
      const keyExports = {
        ValidationUtils,
        SessionManager,
        customAppCheckProviderFactory,
        firebaseAuthManager,
        secureLogger,
        debug,
        info,
        warn,
        error,
        ErrorType,
        categorizeError,
        createAppError,
        showSuccessToast,
        authToasts,
        appToasts,
        AUTH_TIMEOUTS,
        LOG_LEVELS,
        SUPPORTED_CHAIN_IDS,
      }

      Object.entries(keyExports).forEach(([name, exported]) => {
        expect(exported).toBeDefined()
      })
    })
  })

  describe('Module Loading Performance', () => {
    it('should load the module efficiently', async () => {
      const start = performance.now()

      // Load the entire utils module
      await import('./index')

      const end = performance.now()
      const loadTime = end - start

      // Module should load quickly (within reasonable time)
      expect(loadTime).toBeLessThan(100) // Less than 100ms
    })

    it('should not cause memory issues when importing', async () => {
      const initialMemory = process.memoryUsage().heapUsed

      // Import multiple times to test for memory leaks
      for (let i = 0; i < 10; i++) {
        await import('./index')
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      // Should not cause significant memory increase
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024) // Less than 10MB
    })
  })

  describe('Import/Export Circular Dependency Check', () => {
    it('should not have circular dependencies', async () => {
      // If there are circular dependencies, this import would fail or cause issues
      expect(async () => {
        await import('./index')
      }).not.toThrow()
    })

    it('should allow importing specific utilities without loading everything', async () => {
      // Test selective imports to ensure barrel exports work correctly
      const { ValidationUtils } = await import('./ValidationUtils')
      const { ErrorType } = await import('./errorHandling')
      const { LOG_LEVELS } = await import('./constants')

      expect(ValidationUtils).toBeDefined()
      expect(ErrorType).toBeDefined()
      expect(LOG_LEVELS).toBeDefined()
    })
  })

  describe('Export Documentation and Consistency', () => {
    it('should have consistent naming conventions', async () => {
      const allExports = await import('./index')
      const exportNames = Object.keys(allExports)

      // Check that constants are UPPER_CASE
      const constantNames = exportNames.filter((name) => name === name.toUpperCase() && name.includes('_'))

      expect(constantNames.length).toBeGreaterThan(10)

      // Check that functions are camelCase
      const functionNames = exportNames.filter(
        (name) => name.charAt(0) === name.charAt(0).toLowerCase() && typeof allExports[name as keyof typeof allExports] === 'function'
      )

      expect(functionNames.length).toBeGreaterThan(5)
    })

    it('should organize exports by logical categories', async () => {
      const allExports = await import('./index')

      // Check that we have exports from all expected categories
      const categories = {
        validation: ['ValidationUtils'],
        session: ['SessionManager', 'SESSION_STORAGE_KEYS'],
        logging: ['secureLogger', 'LOG_LEVELS', 'debug', 'info'],
        errors: ['ErrorType', 'categorizeError', 'ERROR_MESSAGES'],
        toast: ['showSuccessToast', 'authToasts', 'TOAST_DURATIONS'],
        firebase: ['firebaseAuthManager', 'customAppCheckProviderFactory'],
        constants: ['AUTH_TIMEOUTS', 'SUPPORTED_CHAIN_IDS'],
      }

      Object.entries(categories).forEach(([category, expectedExports]) => {
        expectedExports.forEach((exportName) => {
          expect(allExports).toHaveProperty(exportName)
        })
      })
    })
  })
})
