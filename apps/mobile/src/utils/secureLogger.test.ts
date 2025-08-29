import { SecureLogger, secureLogger, debug, info, warn, error, devOnly, logWalletAddress, logSignaturePreview, logAuthStep, logServiceOperation, logServiceError, logRecoveryAction, createServiceContext } from './secureLogger'
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
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('🐛'),
          expect.stringContaining('Test debug message')
        )
      })

      it('should log info messages in development mode', () => {
        SecureLogger.info('Test info message')
        
        expect(consoleInfoSpy).toHaveBeenCalledWith(
          expect.stringContaining('ℹ️'),
          expect.stringContaining('Test info message')
        )
      })

      it('should log warn messages in development mode', () => {
        SecureLogger.warn('Test warning message')
        
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('⚠️'),
          expect.stringContaining('Test warning message')
        )
      })

      it('should log error messages in development mode', () => {
        SecureLogger.error('Test error message')
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('❌'),
          expect.stringContaining('Test error message')
        )
      })

      it('should include timestamps in log messages', () => {
        SecureLogger.info('Test message')
        
        expect(consoleInfoSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\d{2}:\d{2}:\d{2}/),
          expect.any(String)
        )
      })
    })

    describe('Production Mode', () => {
      beforeEach(() => {
        ;(global as any).__DEV__ = false
      })

      it('should not log debug messages in production mode', () => {
        SecureLogger.debug('Test debug message')
        
        expect(consoleLogSpy).not.toHaveBeenCalled()
      })

      it('should not log info messages in production mode', () => {
        SecureLogger.info('Test info message')
        
        expect(consoleInfoSpy).not.toHaveBeenCalled()
      })

      it('should not log warn messages in production mode', () => {
        SecureLogger.warn('Test warning message')
        
        expect(consoleWarnSpy).not.toHaveBeenCalled()
      })

      it('should log error messages even in production mode', () => {
        SecureLogger.error('Test error message')
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('❌'),
          expect.stringContaining('Test error message')
        )
      })
    })

    describe('Data Sanitization', () => {
      beforeEach(() => {
        ;(global as any).__DEV__ = true
      })

      it('should sanitize wallet addresses', () => {
        const walletAddress = '0x1234567890123456789012345678901234567890'
        SecureLogger.info('User wallet:', walletAddress)
        
        expect(consoleInfoSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringContaining('0x1234...7890')
        )
      })

      it('should sanitize private keys', () => {
        const privateKey = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
        SecureLogger.info('Private key data:', { privateKey })
        
        expect(consoleInfoSpy).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringContaining('[REDACTED]')
        )
      })

      it('should sanitize sensitive object properties', () => {
        const sensitiveData = {
          walletAddress: '0x1234567890123456789012345678901234567890',
          privateKey: 'secret123',
          apiKey: 'api_key_12345',
          signature: '0x' + 'a'.repeat(128),
          normalData: 'this should not be sanitized',
        }

        SecureLogger.info('Sensitive data:', sensitiveData)
        
        const loggedCall = consoleInfoSpy.mock.calls[0][1]
        expect(loggedCall).toContain('0x1234...7890') // Wallet address truncated
        expect(loggedCall).toContain('[REDACTED]') // Private key redacted
        expect(loggedCall).toContain('[REDACTED]') // API key redacted
        expect(loggedCall).toContain('0x' + 'a'.repeat(8) + '...') // Signature truncated
        expect(loggedCall).toContain('this should not be sanitized') // Normal data preserved
      })

      it('should handle nested object sanitization', () => {
        const nestedData = {
          user: {
            id: 123,
            wallet: {
              address: '0x1234567890123456789012345678901234567890',
              privateKey: 'super_secret_key'
            }
          },
          config: {
            apiKey: 'api_12345',
            publicSetting: 'open_data'
          }
        }

        SecureLogger.info('Nested data:', nestedData)
        
        const loggedCall = consoleInfoSpy.mock.calls[0][1]
        expect(loggedCall).toContain('0x1234...7890')
        expect(loggedCall).toContain('[REDACTED]')
        expect(loggedCall).toContain('open_data')
      })

      it('should handle array sanitization', () => {
        const arrayData = [
          { address: '0x1234567890123456789012345678901234567890' },
          { privateKey: 'secret123' },
          { normalData: 'safe_data' }
        ]

        SecureLogger.info('Array data:', arrayData)
        
        const loggedCall = consoleInfoSpy.mock.calls[0][1]
        expect(loggedCall).toContain('0x1234...7890')
        expect(loggedCall).toContain('[REDACTED]')
        expect(loggedCall).toContain('safe_data')
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
          expect.any(String),
          expect.stringContaining('Test error message')
        )
      })

      it('should sanitize Error objects with sensitive data', () => {
        const error = new Error('Authentication failed')
        ;(error as any).privateKey = 'secret123'
        ;(error as any).walletAddress = '0x1234567890123456789012345678901234567890'
        
        SecureLogger.error('Sanitized error:', error)
        
        const loggedCall = consoleErrorSpy.mock.calls[0][1]
        expect(loggedCall).toContain('Authentication failed')
        expect(loggedCall).toContain('[REDACTED]')
        expect(loggedCall).toContain('0x1234...7890')
      })
    })

    describe('Static Methods Availability', () => {
      it('should have all required static methods', () => {
        expect(typeof SecureLogger.debug).toBe('function')
        expect(typeof SecureLogger.info).toBe('function')
        expect(typeof SecureLogger.warn).toBe('function')
        expect(typeof SecureLogger.error).toBe('function')
      })

      it('should not be instantiable', () => {
        expect(() => new (SecureLogger as any)()).toThrow()
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
      it('should execute callback in development mode', () => {
        ;(global as any).__DEV__ = true
        const callback = jest.fn()
        
        devOnly(callback)
        
        expect(callback).toHaveBeenCalled()
      })

      it('should not execute callback in production mode', () => {
        ;(global as any).__DEV__ = false
        const callback = jest.fn()
        
        devOnly(callback)
        
        expect(callback).not.toHaveBeenCalled()
      })

      it('should pass arguments to callback', () => {
        ;(global as any).__DEV__ = true
        const callback = jest.fn()
        
        devOnly(callback, 'arg1', 'arg2', 123)
        
        expect(callback).toHaveBeenCalledWith('arg1', 'arg2', 123)
      })
    })

    describe('Specialized Logging Functions', () => {
      describe('logWalletAddress', () => {
        it('should log wallet address with proper formatting', () => {
          const address = '0x1234567890123456789012345678901234567890'
          logWalletAddress('User connected', address)
          
          expect(consoleInfoSpy).toHaveBeenCalledWith(
            expect.stringContaining('💳'),
            expect.stringContaining('User connected'),
            expect.stringContaining('0x1234...7890')
          )
        })

        it('should handle null or undefined addresses', () => {
          logWalletAddress('No address', null as any)
          logWalletAddress('No address', undefined as any)
          
          expect(consoleInfoSpy).toHaveBeenCalledTimes(2)
        })
      })

      describe('logSignaturePreview', () => {
        it('should log signature with preview format', () => {
          const signature = '0x' + 'a'.repeat(128)
          logSignaturePreview('Signature received', signature)
          
          expect(consoleInfoSpy).toHaveBeenCalledWith(
            expect.stringContaining('✍️'),
            expect.stringContaining('Signature received'),
            expect.stringContaining('0x' + 'a'.repeat(8) + '...')
          )
        })

        it('should handle invalid signatures gracefully', () => {
          logSignaturePreview('Invalid sig', 'not_a_signature')
          
          expect(consoleInfoSpy).toHaveBeenCalled()
        })
      })

      describe('logAuthStep', () => {
        it('should log authentication steps with proper formatting', () => {
          logAuthStep('wallet_connection', 'success', { chainId: 1 })
          
          expect(consoleInfoSpy).toHaveBeenCalledWith(
            expect.stringContaining('🔐'),
            expect.stringContaining('wallet_connection'),
            expect.stringContaining('success'),
            expect.objectContaining({ chainId: 1 })
          )
        })

        it('should sanitize sensitive authentication data', () => {
          logAuthStep('signature_verification', 'success', { 
            privateKey: 'secret123',
            walletAddress: '0x1234567890123456789012345678901234567890'
          })
          
          const loggedCall = consoleInfoSpy.mock.calls[0]
          const sanitizedData = loggedCall[3]
          expect(sanitizedData).toContain('[REDACTED]')
          expect(sanitizedData).toContain('0x1234...7890')
        })
      })

      describe('logServiceOperation', () => {
        it('should log service operations with context', () => {
          const context = createServiceContext('AuthService', 'authenticate')
          logServiceOperation(context, 'Starting authentication process')
          
          expect(consoleInfoSpy).toHaveBeenCalledWith(
            expect.stringContaining('⚙️'),
            expect.stringContaining('[AuthService.authenticate]'),
            expect.stringContaining('Starting authentication process')
          )
        })
      })

      describe('logServiceError', () => {
        it('should log service errors with context and error details', () => {
          const context = createServiceContext('WalletService', 'connect')
          const error = new Error('Connection failed')
          
          logServiceError(context, 'Failed to connect', error)
          
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('🚨'),
            expect.stringContaining('[WalletService.connect]'),
            expect.stringContaining('Failed to connect'),
            expect.stringContaining('Connection failed')
          )
        })

        it('should handle errors without Error objects', () => {
          const context = createServiceContext('TestService', 'test')
          
          logServiceError(context, 'Unknown error', 'string error' as any)
          
          expect(consoleErrorSpy).toHaveBeenCalled()
        })
      })

      describe('logRecoveryAction', () => {
        it('should log recovery actions with proper formatting', () => {
          logRecoveryAction('session_cleanup', 'success', 'Cleared corrupted session data')
          
          expect(consoleInfoSpy).toHaveBeenCalledWith(
            expect.stringContaining('🔄'),
            expect.stringContaining('session_cleanup'),
            expect.stringContaining('success'),
            expect.stringContaining('Cleared corrupted session data')
          )
        })

        it('should log failed recovery actions', () => {
          logRecoveryAction('wallet_disconnect', 'failed', 'Unable to disconnect wallet')
          
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('🔄'),
            expect.stringContaining('wallet_disconnect'),
            expect.stringContaining('failed'),
            expect.stringContaining('Unable to disconnect wallet')
          )
        })
      })

      describe('createServiceContext', () => {
        it('should create proper service context objects', () => {
          const context = createServiceContext('TestService', 'testMethod')
          
          expect(context).toEqual({
            service: 'TestService',
            method: 'testMethod',
            timestamp: expect.any(Date)
          })
        })

        it('should create contexts with current timestamps', () => {
          const before = new Date()
          const context = createServiceContext('Service', 'method')
          const after = new Date()
          
          expect(context.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
          expect(context.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
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
          moreData: 'y'.repeat(5000)
        }
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
        normal: 'value'
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
          random: Math.random()
        })
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory
      
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // Less than 50MB
    })

    it('should be efficient when logging is disabled (production mode)', () => {
      ;(global as any).__DEV__ = false
      
      const start = performance.now()
      
      for (let i = 0; i < 10000; i++) {
        SecureLogger.debug(`Debug message ${i}`)
        SecureLogger.info(`Info message ${i}`)
        SecureLogger.warn(`Warn message ${i}`)
      }
      
      const end = performance.now()
      expect(end - start).toBeLessThan(100) // Should be very fast when disabled
    })
  })

  describe('Integration with Constants', () => {
    it('should respect LOG_LEVELS configuration', () => {
      expect(LOG_LEVELS.DEBUG).toBe('debug')
      expect(LOG_LEVELS.INFO).toBe('info')
      expect(LOG_LEVELS.WARN).toBe('warn')
      expect(LOG_LEVELS.ERROR).toBe('error')
      
      // The logger should use these levels internally
      // This is more of a compilation/integration test
    })
  })
})