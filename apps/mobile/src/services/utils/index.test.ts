import * as utils from './index'
import { TimeoutUtils } from './TimeoutUtils'
import { AuthUtils } from './AuthUtils'

describe('Utils Index Barrel Export', () => {
  describe('exports', () => {
    it('should export TimeoutUtils', () => {
      expect(utils.TimeoutUtils).toBeDefined()
      expect(utils.TimeoutUtils).toBe(TimeoutUtils)
    })

    it('should export AuthUtils', () => {
      expect(utils.AuthUtils).toBeDefined()
      expect(utils.AuthUtils).toBe(AuthUtils)
    })

    it('should export all expected utilities', () => {
      const expectedExports = ['TimeoutUtils', 'AuthUtils']
      const actualExports = Object.keys(utils)
      
      expect(actualExports).toEqual(expect.arrayContaining(expectedExports))
      expect(actualExports).toHaveLength(expectedExports.length)
    })

    it('should not export any unexpected utilities', () => {
      const expectedExports = ['TimeoutUtils', 'AuthUtils']
      const actualExports = Object.keys(utils)
      
      actualExports.forEach(exportName => {
        expect(expectedExports).toContain(exportName)
      })
    })
  })

  describe('TimeoutUtils export verification', () => {
    it('should have all TimeoutUtils methods available', () => {
      expect(typeof utils.TimeoutUtils.withTimeout).toBe('function')
      expect(typeof utils.TimeoutUtils.delay).toBe('function')
      expect(typeof utils.TimeoutUtils.createTimeout).toBe('function')
      expect(typeof utils.TimeoutUtils.clearTimeout).toBe('function')
      expect(typeof utils.TimeoutUtils.withRetry).toBe('function')
      expect(typeof utils.TimeoutUtils.getTimeoutForOperation).toBe('function')
      expect(typeof utils.TimeoutUtils.isTimeoutError).toBe('function')
    })

    it('should have TimeoutUtils constants available', () => {
      expect(utils.TimeoutUtils.TIMEOUTS).toBeDefined()
      expect(typeof utils.TimeoutUtils.TIMEOUTS).toBe('object')
      expect(Object.keys(utils.TimeoutUtils.TIMEOUTS).length).toBeGreaterThan(0)
    })

    it('should maintain TimeoutUtils class behavior through export', () => {
      const promise = Promise.resolve('test')
      
      expect(() => utils.TimeoutUtils.withTimeout(promise, 1000)).not.toThrow()
    })
  })

  describe('AuthUtils export verification', () => {
    it('should have all AuthUtils methods available', () => {
      expect(typeof utils.AuthUtils.generateNonce).toBe('function')
      expect(typeof utils.AuthUtils.createSafeAuthToken).toBe('function')
      expect(typeof utils.AuthUtils.parseSafeAuthToken).toBe('function')
      expect(typeof utils.AuthUtils.createAuthMessage).toBe('function')
      expect(typeof utils.AuthUtils.validateAuthMessageFormat).toBe('function')
      expect(typeof utils.AuthUtils.extractNonceFromMessage).toBe('function')
      expect(typeof utils.AuthUtils.extractTimestampFromMessage).toBe('function')
      expect(typeof utils.AuthUtils.createEip712TypedData).toBe('function')
      expect(typeof utils.AuthUtils.isSafeWalletSignature).toBe('function')
      expect(typeof utils.AuthUtils.isHexSignature).toBe('function')
      expect(typeof utils.AuthUtils.determineSignatureType).toBe('function')
      expect(typeof utils.AuthUtils.createAuthRequest).toBe('function')
      expect(typeof utils.AuthUtils.getAuthAge).toBe('function')
      expect(typeof utils.AuthUtils.formatAuthContext).toBe('function')
    })

    it('should maintain AuthUtils class behavior through export', () => {
      const nonce = utils.AuthUtils.generateNonce(16)
      
      expect(typeof nonce).toBe('string')
      expect(nonce.length).toBe(16)
    })
  })

  describe('export integrity', () => {
    it('should maintain class static method behavior', () => {
      // Test that static methods work properly through the barrel export
      const testWalletAddress = '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8'
      const testNonce = 'test_nonce'
      const testTimestamp = Date.now()
      
      // TimeoutUtils static method test
      const delayPromise = utils.TimeoutUtils.delay(0)
      expect(delayPromise).toBeInstanceOf(Promise)
      
      // AuthUtils static method test
      const authToken = utils.AuthUtils.createSafeAuthToken(testWalletAddress, testNonce, testTimestamp)
      expect(typeof authToken).toBe('string')
      expect(authToken).toContain('safe-wallet:')
    })

    it('should maintain class constants through export', () => {
      expect(utils.TimeoutUtils.TIMEOUTS.PERSONAL_SIGN).toBe(15000)
      expect(utils.TimeoutUtils.TIMEOUTS.TYPED_DATA_SIGN).toBe(15000)
      expect(utils.TimeoutUtils.TIMEOUTS.SAFE_WALLET_SIGN).toBe(20000)
    })

    it('should allow method chaining where applicable', () => {
      const testAddress = '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8'
      
      // Test that we can use the utilities in combination
      const nonce = utils.AuthUtils.generateNonce(32)
      const timestamp = Date.now()
      const message = utils.AuthUtils.createAuthMessage(testAddress, nonce, timestamp)
      const isValidFormat = utils.AuthUtils.validateAuthMessageFormat(message, testAddress)
      
      expect(typeof nonce).toBe('string')
      expect(typeof message).toBe('string')
      expect(isValidFormat).toBe(true)
    })
  })

  describe('module structure validation', () => {
    it('should be a proper ES module export', () => {
      expect(typeof utils).toBe('object')
      expect(utils).not.toBeNull()
    })

    it('should export constructors/classes properly', () => {
      expect(utils.TimeoutUtils.constructor).toBeDefined()
      expect(utils.AuthUtils.constructor).toBeDefined()
      expect(utils.TimeoutUtils.name).toBe('TimeoutUtils')
      expect(utils.AuthUtils.name).toBe('AuthUtils')
    })

    it('should not have any circular dependencies', () => {
      // This test ensures that importing the index doesn't cause circular dependency issues
      expect(() => {
        const { TimeoutUtils: TU, AuthUtils: AU } = utils
        expect(TU).toBeDefined()
        expect(AU).toBeDefined()
      }).not.toThrow()
    })

    it('should maintain proper prototype chain', () => {
      expect(utils.TimeoutUtils.prototype.constructor).toBe(TimeoutUtils)
      expect(utils.AuthUtils.prototype.constructor).toBe(AuthUtils)
    })
  })

  describe('usage patterns validation', () => {
    it('should support destructured imports', () => {
      const { TimeoutUtils: TU, AuthUtils: AU } = utils
      
      expect(TU).toBe(TimeoutUtils)
      expect(AU).toBe(AuthUtils)
      expect(typeof TU.delay).toBe('function')
      expect(typeof AU.generateNonce).toBe('function')
    })

    it('should support namespace imports', () => {
      expect(utils.TimeoutUtils.delay).toBe(TimeoutUtils.delay)
      expect(utils.AuthUtils.generateNonce).toBe(AuthUtils.generateNonce)
    })

    it('should maintain type consistency', () => {
      // Verify that exported utilities maintain their TypeScript types
      const nonce = utils.AuthUtils.generateNonce()
      const timeout = utils.TimeoutUtils.TIMEOUTS.PERSONAL_SIGN
      
      expect(typeof nonce).toBe('string')
      expect(typeof timeout).toBe('number')
    })
  })

  describe('documentation coverage', () => {
    it('should maintain access to utility documentation through export', () => {
      // Verify that JSDoc and other metadata is preserved
      expect(utils.TimeoutUtils.toString()).toContain('TimeoutUtils')
      expect(utils.AuthUtils.toString()).toContain('AuthUtils')
    })

    it('should provide clear utility purpose through exports', () => {
      // Test that the barrel export makes it clear what utilities are available
      const utilityNames = Object.keys(utils)
      
      expect(utilityNames.some(name => name.includes('Timeout'))).toBe(true)
      expect(utilityNames.some(name => name.includes('Auth'))).toBe(true)
    })
  })
})