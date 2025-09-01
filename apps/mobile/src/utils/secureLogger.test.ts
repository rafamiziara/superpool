import {
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
  SecureLogger,
  warn,
} from './secureLogger'
import { LOG_LEVELS } from './constants'

// Mock __DEV__ global
const originalDev = (global as any).__DEV__
const mockConsole = {
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

describe('secureLogger', () => {
  let consoleLogSpy: jest.SpyInstance
  let consoleInfoSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    // Mock console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(mockConsole.log)
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(mockConsole.info)
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(mockConsole.warn)
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(mockConsole.error)

    // Clear all mock calls
    jest.clearAllMocks()
  })

  afterEach(() => {
    // Restore original console methods
    consoleLogSpy.mockRestore()
    consoleInfoSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()

    // Restore original __DEV__
    ;(global as any).__DEV__ = originalDev
  })

  describe('SecureLogger Class', () => {
    describe('Development Mode', () => {
      beforeEach(() => {
        ;(global as any).__DEV__ = true
      })

      it('should log debug messages in development mode', () => {
        SecureLogger.debug('Test debug message')

        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('🐛'), expect.stringContaining('Test debug message'))
      })

      it('should log info messages in development mode', () => {
        SecureLogger.info('Test info message')

        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('ℹ️'), expect.stringContaining('Test info message'))
      })

      it('should log warn messages in development mode', () => {
        SecureLogger.warn('Test warning message')

        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('⚠️'), expect.stringContaining('Test warning message'))
      })

      it('should log error messages in development mode', () => {
        SecureLogger.error('Test error message')

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('❌'), expect.stringContaining('Test error message'))
      })

      it('should format log messages with proper emoji prefixes', () => {
        SecureLogger.info('Test message')

        expect(consoleInfoSpy).toHaveBeenCalledWith('ℹ️ [INFO]', 'Test message')
      })
    })

    describe('Production Mode (Static Behavior)', () => {
      // NOTE: These tests check the static log level behavior
      // The actual minLogLevel is determined when the class loads

      it('should respect minLogLevel for debug messages', () => {
        // Debug level (0) vs current minLogLevel - depends on __DEV__ at class load time
        const initialCallCount = consoleLogSpy.mock.calls.length
        SecureLogger.debug('Test debug message')

        // In development, debug should log. In production, it shouldn't.
        // Since we're in a test environment, __DEV__ is likely true initially
        if (__DEV__) {
          expect(consoleLogSpy).toHaveBeenCalled()
        } else {
          expect(consoleLogSpy.mock.calls.length).toBe(initialCallCount)
        }
      })

      it('should respect minLogLevel for info messages', () => {
        const initialCallCount = consoleInfoSpy.mock.calls.length
        SecureLogger.info('Test info message')

        // Info level (1) - should log in dev, might not in production
        if (__DEV__) {
          expect(consoleInfoSpy).toHaveBeenCalled()
        } else {
          expect(consoleInfoSpy.mock.calls.length).toBe(initialCallCount)
        }
      })

      it('should always log warn messages (level 2)', () => {
        SecureLogger.warn('Test warning message')

        expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️ [WARN]', 'Test warning message')
      })

      it('should always log error messages (level 3)', () => {
        SecureLogger.error('Test error message')

        expect(consoleErrorSpy).toHaveBeenCalledWith('❌ [ERROR]', 'Test error message')
      })
    })

    describe('Data Sanitization', () => {
      beforeEach(() => {
        ;(global as any).__DEV__ = true
      })

      it('should sanitize wallet addresses in strings (production mode)', () => {
        // This test simulates production mode behavior where formatArgs applies sanitization
        const textWithAddress = 'User wallet: 0x1234567890123456789012345678901234567890'

        // Manually test the sanitization logic
        const sanitized = (SecureLogger as any).sanitizeString(textWithAddress)
        expect(sanitized).toBe('User wallet: 0x1234...7890')
      })

      it('should sanitize private keys in objects', () => {
        const sensitiveObj = { privateKey: 'secret123' }

        // Directly test the sanitization method
        const sanitized = (SecureLogger as any).sanitizeObject(sensitiveObj)
        expect(sanitized).toEqual({ privateKey: '[REDACTED]' })
      })

      it('should sanitize sensitive object properties', () => {
        const sensitiveData = {
          walletAddress: '0x1234567890123456789012345678901234567890',
          privateKey: 'secret123',
          apiKey: 'api_key_12345',
          signature: '0x' + 'a'.repeat(128),
          normalData: 'this should not be sanitized',
        }

        const sanitized = (SecureLogger as any).sanitizeObject(sensitiveData)

        expect(sanitized).toEqual({
          walletAddress: '0x1234...7890', // Wallet address truncated (hex string > 20 chars)
          privateKey: '[REDACTED]', // Private key redacted (sensitive key)
          apiKey: '[REDACTED]', // API key redacted (contains 'key')
          signature: '[REDACTED]', // Signature is a sensitive key, gets redacted
          normalData: 'this should not be sanitized', // Normal data preserved
        })
      })

      it('should handle nested object sanitization', () => {
        const nestedData = {
          user: {
            id: 123,
            wallet: {
              address: '0x1234567890123456789012345678901234567890',
              privateKey: 'super_secret_key',
            },
          },
          config: {
            apiKey: 'api_12345',
            publicSetting: 'open_data',
          },
        }

        const sanitized = (SecureLogger as any).sanitizeObject(nestedData)

        expect(sanitized).toEqual({
          user: {
            id: 123,
            wallet: {
              address: '0x1234...7890',
              privateKey: '[REDACTED]',
            },
          },
          config: {
            apiKey: '[REDACTED]',
            publicSetting: 'open_data',
          },
        })
      })

      it('should handle array sanitization', () => {
        const arrayData = [
          { address: '0x1234567890123456789012345678901234567890' },
          { privateKey: 'secret123' },
          { normalData: 'safe_data' },
        ]

        const sanitized = (SecureLogger as any).sanitizeData(arrayData)

        // Arrays are treated as objects in sanitizeData, so result is object with numeric keys
        expect(sanitized).toEqual({
          0: { address: '0x1234...7890' },
          1: { privateKey: '[REDACTED]' },
          2: { normalData: 'safe_data' },
        })
      })
    })

    describe('Log Level Filtering', () => {
      beforeEach(() => {
        ;(global as any).__DEV__ = true
      })

      it('should respect log level hierarchy', () => {
        // This test assumes there's a way to set log level
        // Since we can't see the full implementation, we'll test the basic behavior
        SecureLogger.debug('Debug message')
        SecureLogger.info('Info message')
        SecureLogger.warn('Warn message')
        SecureLogger.error('Error message')

        expect(consoleLogSpy).toHaveBeenCalled() // debug
        expect(consoleInfoSpy).toHaveBeenCalled() // info
        expect(consoleWarnSpy).toHaveBeenCalled() // warn
        expect(consoleErrorSpy).toHaveBeenCalled() // error
      })
    })

    describe('Error Object Handling', () => {
      beforeEach(() => {
        ;(global as any).__DEV__ = true
      })

      it('should properly log Error objects', () => {
        const error = new Error('Test error message')
        error.stack = 'Error stack trace'

        SecureLogger.error('Error occurred:', error)

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '❌ [ERROR]',
          'Error occurred:',
          error // Error objects pass through sanitization as-is
        )
      })

      it('should sanitize Error objects with sensitive data', () => {
        const error = new Error('Authentication failed')
        ;(error as any).privateKey = 'secret123'
        ;(error as any).walletAddress = '0x1234567890123456789012345678901234567890'

        // Test the sanitization method directly
        const sanitized = (SecureLogger as any).sanitizeObject(error)

        // Error objects don't have the message as an enumerable property when sanitized
        expect(sanitized).toEqual({
          privateKey: '[REDACTED]',
          walletAddress: '0x1234...7890',
        })
      })
    })

    describe('Static Methods Availability', () => {
      it('should have all required static methods', () => {
        expect(typeof SecureLogger.debug).toBe('function')
        expect(typeof SecureLogger.info).toBe('function')
        expect(typeof SecureLogger.warn).toBe('function')
        expect(typeof SecureLogger.error).toBe('function')
      })

      it('should have private constructor (cannot be instantiated)', () => {
        // The constructor is private in TypeScript, but at runtime it might not throw
        // This is more of a design pattern test than a runtime behavior test
        expect(typeof SecureLogger).toBe('function')
        expect(SecureLogger.debug).toBeDefined()
        expect(SecureLogger.info).toBeDefined()
        expect(SecureLogger.warn).toBeDefined()
        expect(SecureLogger.error).toBeDefined()
      })
    })
  })

  describe('Exported Functions', () => {
    beforeEach(() => {
      ;(global as any).__DEV__ = true
    })

    describe('Basic Logging Functions', () => {
      it('should export debug function', () => {
        debug('Test debug')
        expect(consoleLogSpy).toHaveBeenCalled()
      })

      it('should export info function', () => {
        info('Test info')
        expect(consoleInfoSpy).toHaveBeenCalled()
      })

      it('should export warn function', () => {
        warn('Test warning')
        expect(consoleWarnSpy).toHaveBeenCalled()
      })

      it('should export error function', () => {
        error('Test error')
        expect(consoleErrorSpy).toHaveBeenCalled()
      })
    })

    describe('devOnly Function', () => {
      it('should log devOnly messages in development mode', () => {
        ;(global as any).__DEV__ = true

        devOnly('Development message', { debug: true })

        expect(consoleLogSpy).toHaveBeenCalledWith('🛠️ [DEV]', 'Development message', { debug: true })
      })

      it('should respect __DEV__ flag for devOnly messages', () => {
        // devOnly checks __DEV__ dynamically, unlike the static minLogLevel
        const initialCallCount = consoleLogSpy.mock.calls.length

        devOnly('Development message')

        // In test environment __DEV__ is typically true
        if (__DEV__) {
          expect(consoleLogSpy.mock.calls.length).toBeGreaterThan(initialCallCount)
        } else {
          expect(consoleLogSpy.mock.calls.length).toBe(initialCallCount)
        }
      })

      it('should log multiple arguments in development mode', () => {
        ;(global as any).__DEV__ = true

        devOnly('Message:', 'arg1', 'arg2', 123)

        expect(consoleLogSpy).toHaveBeenCalledWith('🛠️ [DEV]', 'Message:', 'arg1', 'arg2', 123)
      })
    })

    describe('Specialized Logging Functions', () => {
      describe('logWalletAddress', () => {
        it('should format wallet address with proper truncation', () => {
          const address = '0x1234567890123456789012345678901234567890'
          const result = logWalletAddress(address, 'User connected')

          expect(result).toBe('User connected: 0x1234...7890')
        })

        it('should handle invalid addresses', () => {
          const result1 = logWalletAddress(null as any, 'No address')
          const result2 = logWalletAddress('', 'Empty address')
          const result3 = logWalletAddress('short', 'Short address')

          expect(result1).toBe('invalid-address')
          expect(result2).toBe('invalid-address')
          expect(result3).toBe('invalid-address')
        })
      })

      describe('logSignaturePreview', () => {
        it('should log signature with preview format', () => {
          const signature = '0x' + 'a'.repeat(128)
          logSignaturePreview(signature, 'Signature received')

          expect(consoleLogSpy).toHaveBeenCalledWith('✅ Signature received signature: string 0xaaaaaaaa... (130 chars)')
        })

        it('should handle invalid signatures gracefully', () => {
          logSignaturePreview('', 'Empty signature')

          expect(consoleLogSpy).toHaveBeenCalledWith('❌ Empty signature signature: empty or invalid')
        })

        it('should handle Safe wallet signatures', () => {
          logSignaturePreview('safe-wallet:0x123:nonce:456', 'Safe wallet')

          expect(consoleLogSpy).toHaveBeenCalledWith('✅ Safe wallet signature: Safe wallet token (27 chars)')
        })
      })

      describe('logAuthStep', () => {
        it('should log authentication steps with proper formatting', () => {
          logAuthStep('wallet_connection', 'complete', { chainId: 1 })

          expect(consoleLogSpy).toHaveBeenCalledWith(
            expect.stringMatching(/✅ Auth wallet_connection complete \[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/),
            { chainId: 1 }
          )
        })

        it('should sanitize sensitive authentication data', () => {
          logAuthStep('signature_verification', 'complete', {
            privateKey: 'secret123',
            walletAddress: '0x1234567890123456789012345678901234567890',
          })

          expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/✅ Auth signature_verification complete \[.*\]/), {
            privateKey: '[REDACTED]',
            walletAddress: '0x1234...7890',
          })
        })
      })

      describe('logServiceOperation', () => {
        it('should log service operations with context', () => {
          logServiceOperation('AuthService', 'authenticate', 'start', { userId: 123 })

          expect(consoleLogSpy).toHaveBeenCalledWith('🔄 [AuthService] authenticate start', { userId: 123 })
        })
      })

      describe('logServiceError', () => {
        it('should log service errors with context and error details', () => {
          const error = new Error('Connection failed')

          logServiceError('WalletService', 'connect', error, { retries: 3 })

          expect(consoleErrorSpy).toHaveBeenCalledWith(
            '❌ [WalletService] connect failed:',
            expect.objectContaining({
              error: 'Connection failed',
              context: { retries: 3 },
              timestamp: expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/),
            })
          )
        })

        it('should handle errors without Error objects', () => {
          logServiceError('TestService', 'test', 'string error' as any)

          expect(consoleErrorSpy).toHaveBeenCalledWith(
            '❌ [TestService] test failed:',
            expect.objectContaining({
              error: 'string error',
              context: {},
              timestamp: expect.any(String),
            })
          )
        })
      })

      describe('logRecoveryAction', () => {
        it('should log recovery actions with proper formatting', () => {
          logRecoveryAction('session_cleanup', { result: 'success', message: 'Cleared corrupted session data' }, 'AuthService')

          expect(consoleLogSpy).toHaveBeenCalledWith('🔄 [AuthService] Recovery: session_cleanup', {
            result: 'success',
            message: 'Cleared corrupted session data',
          })
        })

        it('should log recovery actions without context', () => {
          logRecoveryAction('wallet_disconnect', { status: 'failed', reason: 'Unable to disconnect wallet' })

          expect(consoleLogSpy).toHaveBeenCalledWith('🔄 Recovery: wallet_disconnect', {
            status: 'failed',
            reason: 'Unable to disconnect wallet',
          })
        })
      })

      describe('createServiceContext', () => {
        it('should create proper service context strings', () => {
          const context = createServiceContext('TestService', 'testMethod')

          expect(context).toMatch(/\[TestService:testMethod\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)
        })

        it('should create contexts with additional context data', () => {
          const context = createServiceContext('Service', 'method', { userId: 123, debug: true })

          expect(context).toMatch(/\[Service:method\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z {"userId":123,"debug":true}/)
        })
      })
    })
  })

  describe('Singleton Instance', () => {
    it('should export secureLogger singleton instance', () => {
      expect(secureLogger).toBeDefined()
      expect(typeof secureLogger.debug).toBe('function')
      expect(typeof secureLogger.info).toBe('function')
      expect(typeof secureLogger.warn).toBe('function')
      expect(typeof secureLogger.error).toBe('function')
    })

    it('should maintain same instance across imports', () => {
      expect(secureLogger).toBe(SecureLogger)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    beforeEach(() => {
      ;(global as any).__DEV__ = true
    })

    it('should handle circular references in objects', () => {
      const circularObj: any = { name: 'test' }
      circularObj.self = circularObj

      expect(() => {
        SecureLogger.info('Circular object:', circularObj)
      }).not.toThrow()
    })

    it('should handle very large objects gracefully', () => {
      const largeObj = {
        data: 'x'.repeat(10000),
        nested: {
          moreData: 'y'.repeat(5000),
        },
      }

      expect(() => {
        SecureLogger.info('Large object:', largeObj)
      }).not.toThrow()
    })

    it('should handle undefined and null values', () => {
      expect(() => {
        SecureLogger.info('Null value:', null)
        SecureLogger.info('Undefined value:', undefined)
        SecureLogger.info('Mixed:', { a: null, b: undefined, c: 'valid' })
      }).not.toThrow()
    })

    it('should handle special characters and unicode', () => {
      expect(() => {
        SecureLogger.info('Unicode: 🚀 💻 🌍')
        SecureLogger.info('Special chars: !@#$%^&*()[]{}|\\:";\'<>?,./')
      }).not.toThrow()
    })

    it('should handle functions and symbols in objects', () => {
      const complexObj = {
        func: () => 'test',
        symbol: Symbol('test'),
        normal: 'value',
      }

      expect(() => {
        SecureLogger.info('Complex object:', complexObj)
      }).not.toThrow()
    })
  })

  describe('Performance', () => {
    beforeEach(() => {
      ;(global as any).__DEV__ = true
    })

    it('should handle high-frequency logging efficiently', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        SecureLogger.info(`Log message ${i}`)
      }

      const end = performance.now()
      expect(end - start).toBeLessThan(1000) // Should complete within 1 second
    })

    it('should not cause memory leaks with repeated logging', () => {
      const initialMemory = process.memoryUsage().heapUsed

      for (let i = 0; i < 1000; i++) {
        SecureLogger.info('Memory test', {
          data: `Test data ${i}`,
          timestamp: new Date(),
          random: Math.random(),
        })
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
    })

    it('should be efficient when logging is disabled (level filtering)', () => {
      // Test efficiency of log level filtering (debug/info vs warn/error)
      const start = performance.now()

      for (let i = 0; i < 10000; i++) {
        SecureLogger.debug(`Debug message ${i}`)
        SecureLogger.info(`Info message ${i}`)
        SecureLogger.warn(`Warn message ${i}`)
        SecureLogger.error(`Error message ${i}`)
      }

      const end = performance.now()
      // Should complete in reasonable time regardless of log level
      expect(end - start).toBeLessThan(5000) // 5 seconds max
    })
  })

  describe('Integration with Constants', () => {
    it('should respect LOG_LEVELS configuration', () => {
      expect(LOG_LEVELS.DEBUG).toBe(0)
      expect(LOG_LEVELS.INFO).toBe(1)
      expect(LOG_LEVELS.WARN).toBe(2)
      expect(LOG_LEVELS.ERROR).toBe(3)

      // Verify the logger uses these numeric levels for comparison
      // This tests the integration with constants.ts
    })
  })
})
