import { SignatureUtils } from './SignatureUtils'
import type { SignatureRequest } from '@superpool/types'

describe('SignatureUtils', () => {
  beforeEach(() => {
    jest.clearAllTimers()
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  describe('Timeout Management', () => {
    describe('createTimeoutPromise', () => {
      it('should create a promise that rejects after specified timeout', async () => {
        const timeoutPromise = SignatureUtils.createTimeoutPromise(5000, 'Test operation')

        // Fast-forward time
        jest.advanceTimersByTime(5000)

        await expect(timeoutPromise).rejects.toThrow('Test operation timed out after 5 seconds')
      })

      it('should handle different timeout durations', async () => {
        const promise1000 = SignatureUtils.createTimeoutPromise(1000, 'Short op')
        const promise3000 = SignatureUtils.createTimeoutPromise(3000, 'Long op')

        // Advance to 1000ms - first should reject
        jest.advanceTimersByTime(1000)
        await expect(promise1000).rejects.toThrow('Short op timed out after 1 seconds')

        // Advance to 3000ms - second should reject
        jest.advanceTimersByTime(2000)
        await expect(promise3000).rejects.toThrow('Long op timed out after 3 seconds')
      })

      it('should include operation name in error message', async () => {
        const operationName = 'Custom signing operation'
        const timeoutPromise = SignatureUtils.createTimeoutPromise(1000, operationName)

        jest.advanceTimersByTime(1000)

        await expect(timeoutPromise).rejects.toThrow('Custom signing operation timed out after 1 seconds')
      })

      it('should handle zero timeout', async () => {
        const timeoutPromise = SignatureUtils.createTimeoutPromise(0, 'Instant timeout')

        jest.advanceTimersByTime(0)

        await expect(timeoutPromise).rejects.toThrow('Instant timeout timed out after 0 seconds')
      })
    })

    describe('withTimeout', () => {
      it('should resolve with signature result when promise completes before timeout', async () => {
        const mockSignature = '0x123abc456def'
        const mockPromise = Promise.resolve(mockSignature)

        const result = SignatureUtils.withTimeout(mockPromise, 5000, 'Test signing')

        // Don't advance timers - let promise resolve naturally
        jest.useRealTimers()
        await expect(result).resolves.toBe(mockSignature)
        jest.useFakeTimers()
      })

      it('should reject with timeout error when promise takes too long', async () => {
        const slowPromise = new Promise((resolve) => setTimeout(() => resolve('slow'), 10000))

        const resultPromise = SignatureUtils.withTimeout(slowPromise, 2000, 'Slow operation')

        // Advance past timeout
        jest.advanceTimersByTime(2000)

        await expect(resultPromise).rejects.toThrow('Slow operation timed out after 2 seconds')
      })

      it('should handle promise rejection before timeout', async () => {
        const failingPromise = Promise.reject(new Error('Signature failed'))

        const resultPromise = SignatureUtils.withTimeout(failingPromise, 5000, 'Failing operation')

        jest.useRealTimers()
        await expect(resultPromise).rejects.toThrow('Signature failed')
        jest.useFakeTimers()
      })

      it('should handle promise rejection after timeout', async () => {
        const slowFailingPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Late failure')), 10000))

        const resultPromise = SignatureUtils.withTimeout(slowFailingPromise, 2000, 'Timeout first')

        // Advance past timeout (should timeout, not wait for late failure)
        jest.advanceTimersByTime(2000)

        await expect(resultPromise).rejects.toThrow('Timeout first timed out after 2 seconds')
      })

      it('should work with different return types', async () => {
        const numberPromise = Promise.resolve(42)
        const objectPromise = Promise.resolve({
          signature: '0xabc',
          type: 'test',
        })
        const arrayPromise = Promise.resolve(['item1', 'item2'])

        jest.useRealTimers()

        await expect(SignatureUtils.withTimeout(numberPromise, 1000, 'Number')).resolves.toBe(42)
        await expect(SignatureUtils.withTimeout(objectPromise, 1000, 'Object')).resolves.toEqual({ signature: '0xabc', type: 'test' })
        await expect(SignatureUtils.withTimeout(arrayPromise, 1000, 'Array')).resolves.toEqual(['item1', 'item2'])

        jest.useFakeTimers()
      })
    })
  })

  describe('Signature Validation', () => {
    describe('validateSignatureResult', () => {
      it('should return true for valid hex signature strings', () => {
        const validSignatures = [
          '0x123abc456def789',
          '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          '0x0',
          '0xabc',
        ]

        validSignatures.forEach((signature) => {
          expect(SignatureUtils.validateSignatureResult(signature)).toBe(true)
        })
      })

      it('should return false for object responses (error cases)', () => {
        const objectResponses = [{ error: 'User rejected' }, { code: -32603, message: 'Internal error' }, {}, { success: false }, []]

        objectResponses.forEach((response) => {
          expect(SignatureUtils.validateSignatureResult(response)).toBe(false)
        })
      })

      it('should return false for strings containing error JSON', () => {
        const errorStrings = [
          '{"error": "User rejected the request"}',
          '{"code": -32603, "message": "Internal error"}',
          'Some text "error" in the middle',
          '{"status": "error", "details": "Failed"}',
        ]

        errorStrings.forEach((errorString) => {
          expect(SignatureUtils.validateSignatureResult(errorString)).toBe(false)
        })
      })

      it('should return false for non-string, non-object values', () => {
        const invalidValues = [null, undefined, 123, true, false, Symbol('test'), new Date(), /regex/]

        invalidValues.forEach((value) => {
          expect(SignatureUtils.validateSignatureResult(value)).toBe(false)
        })
      })

      it('should handle edge cases', () => {
        expect(SignatureUtils.validateSignatureResult('')).toBe(true) // Empty string is valid
        expect(SignatureUtils.validateSignatureResult('regular text')).toBe(true) // No error JSON
        expect(SignatureUtils.validateSignatureResult('0x')).toBe(true) // Minimal hex
      })
    })

    describe('isValidSignatureFormat', () => {
      it('should return true for valid hex signatures', () => {
        const validHexSignatures = [
          '0x1234567890',
          '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          '0x0123456789',
          '0xABCDEF123',
        ]

        validHexSignatures.forEach((signature) => {
          expect(SignatureUtils.isValidSignatureFormat(signature)).toBe(true)
        })
      })

      it('should return true for valid Safe wallet tokens', () => {
        const validSafeTokens = ['safe-wallet:0x123:nonce123:1234567890', 'safe-wallet:0xabcdef:abc:999', 'safe-wallet:0x0:n:1']

        validSafeTokens.forEach((token) => {
          expect(SignatureUtils.isValidSignatureFormat(token)).toBe(true)
        })
      })

      it('should return false for invalid hex signatures', () => {
        const invalidHexSignatures = [
          '0x123', // Too short (< 10 chars)
          '0x', // Too short
          '123456789', // Missing 0x prefix
          'abc123def', // Missing 0x prefix
          '', // Empty
          '0xGHIJKL', // Invalid hex characters
        ]

        invalidHexSignatures.forEach((signature) => {
          expect(SignatureUtils.isValidSignatureFormat(signature)).toBe(false)
        })
      })

      it('should return false for invalid Safe wallet tokens', () => {
        const invalidSafeTokens = [
          'safe-wallet:', // Incomplete
          'unsafe-wallet:0x123:nonce:123', // Wrong prefix
          'safe-wallet', // No colon separator
          ':safe-wallet:0x123:nonce:123', // Leading colon
          'SAFE-WALLET:0x123:nonce:123', // Wrong case
        ]

        invalidSafeTokens.forEach((token) => {
          expect(SignatureUtils.isValidSignatureFormat(token)).toBe(false)
        })
      })

      it('should handle edge cases', () => {
        expect(SignatureUtils.isValidSignatureFormat('safe-wallet:')).toBe(true)
        expect(SignatureUtils.isValidSignatureFormat('0x1234567890')).toBe(true)
      })
    })
  })

  describe('Safe Wallet Detection', () => {
    describe('isSafeWalletError', () => {
      it('should return true for Safe wallet error patterns', () => {
        const safeErrorPatterns = [
          'Method disabled',
          'safe://',
          'the method eth_signTypedData_v4 does not exist',
          'Method not supported',
          'eth_signTypedData_v3 does not exist',
          'Personal sign not supported',
        ]

        safeErrorPatterns.forEach((pattern) => {
          expect(SignatureUtils.isSafeWalletError(pattern)).toBe(true)
        })
      })

      it('should return true for error messages containing Safe patterns', () => {
        const messagesWithSafePatterns = [
          'Error: Method disabled for this wallet',
          'Redirect to safe://app-name for signing',
          'WalletError: the method eth_signTypedData_v4 does not exist/is not available',
          'RPC Error: Method not supported by this provider',
          'Provider Error: eth_signTypedData_v3 does not exist',
          'Signing Error: Personal sign not supported for multisig wallets',
        ]

        messagesWithSafePatterns.forEach((message) => {
          expect(SignatureUtils.isSafeWalletError(message)).toBe(true)
        })
      })

      it('should return false for user rejection errors (not Safe-specific)', () => {
        const userRejectionErrors = [
          'User rejected',
          'user denied',
          'User cancelled the request',
          'USER REJECTED the signature request',
          'Request denied by user',
        ]

        userRejectionErrors.forEach((error) => {
          expect(SignatureUtils.isSafeWalletError(error)).toBe(false)
        })
      })

      it('should return false for generic errors', () => {
        const genericErrors = [
          'Network error',
          'Connection timeout',
          'Invalid request',
          'Server error',
          'Unknown error occurred',
          '',
          'eth_signTypedData_v2 failed', // Different version, not in pattern list
          'Method enabled', // Opposite of disabled
        ]

        genericErrors.forEach((error) => {
          expect(SignatureUtils.isSafeWalletError(error)).toBe(false)
        })
      })

      it('should be case sensitive for accuracy', () => {
        expect(SignatureUtils.isSafeWalletError('method disabled')).toBe(false) // lowercase
        expect(SignatureUtils.isSafeWalletError('Method disabled')).toBe(true) // correct case
        expect(SignatureUtils.isSafeWalletError('METHOD DISABLED')).toBe(false) // uppercase
      })

      it('should handle complex error messages', () => {
        const complexErrors = [
          'Error: Method disabled\nStack trace: ...',
          'Multiple issues: Method disabled, Network timeout',
          'User rejected then Method disabled', // Should be false due to user rejected
          'Method not supported: eth_signTypedData_v4', // Should be true
        ]

        expect(SignatureUtils.isSafeWalletError(complexErrors[0])).toBe(true)
        expect(SignatureUtils.isSafeWalletError(complexErrors[1])).toBe(true)
        expect(SignatureUtils.isSafeWalletError(complexErrors[2])).toBe(false) // User rejected takes precedence
        expect(SignatureUtils.isSafeWalletError(complexErrors[3])).toBe(true)
      })
    })
  })

  describe('Safe Wallet Token Creation', () => {
    describe('createSafeAuthToken', () => {
      const mockRequest: SignatureRequest = {
        message: 'Test authentication message',
        nonce: 'abc123def456',
        timestamp: 1234567890,
        walletAddress: '0x742d35Cc6624C4532F7845A7b6d4b7c5c4dF5b9e',
        chainId: 1,
      }

      it('should create properly formatted Safe auth token', () => {
        const token = SignatureUtils.createSafeAuthToken(mockRequest)

        expect(token).toBe(`safe-wallet:${mockRequest.walletAddress}:${mockRequest.nonce}:${mockRequest.timestamp}`)
        expect(token).toBe('safe-wallet:0x742d35Cc6624C4532F7845A7b6d4b7c5c4dF5b9e:abc123def456:1234567890')
      })

      it('should handle different wallet addresses', () => {
        const differentAddresses = [
          '0x0000000000000000000000000000000000000000',
          '0xffffffffffffffffffffffffffffffffffffffff',
          '0x123abc456def789',
        ]

        differentAddresses.forEach((address) => {
          const request = { ...mockRequest, walletAddress: address }
          const token = SignatureUtils.createSafeAuthToken(request)

          expect(token).toBe(`safe-wallet:${address}:${mockRequest.nonce}:${mockRequest.timestamp}`)
          expect(token.startsWith('safe-wallet:')).toBe(true)
          expect(token.includes(address)).toBe(true)
        })
      })

      it('should handle different nonces', () => {
        const differentNonces = ['', '0', '123', 'long-nonce-with-special-chars-!@#$%', 'unicode-nonce-测试']

        differentNonces.forEach((nonce) => {
          const request = { ...mockRequest, nonce }
          const token = SignatureUtils.createSafeAuthToken(request)

          expect(token).toBe(`safe-wallet:${mockRequest.walletAddress}:${nonce}:${mockRequest.timestamp}`)
          expect(token.includes(nonce)).toBe(true)
        })
      })

      it('should handle different timestamps', () => {
        const differentTimestamps = [0, 1, 999999999, 1234567890, 9999999999]

        differentTimestamps.forEach((timestamp) => {
          const request = { ...mockRequest, timestamp }
          const token = SignatureUtils.createSafeAuthToken(request)

          expect(token).toBe(`safe-wallet:${mockRequest.walletAddress}:${mockRequest.nonce}:${timestamp}`)
          expect(token.endsWith(`:${timestamp}`)).toBe(true)
        })
      })

      it('should maintain consistent format across calls', () => {
        const token1 = SignatureUtils.createSafeAuthToken(mockRequest)
        const token2 = SignatureUtils.createSafeAuthToken(mockRequest)

        expect(token1).toBe(token2)
        expect(token1.split(':').length).toBe(4) // safe-wallet:address:nonce:timestamp
      })

      it('should create tokens that pass format validation', () => {
        const token = SignatureUtils.createSafeAuthToken(mockRequest)

        expect(SignatureUtils.isValidSignatureFormat(token)).toBe(true)
      })
    })
  })

  describe('Logging and Debugging', () => {
    describe('logSignaturePreview', () => {
      let consoleSpy: jest.SpyInstance

      beforeEach(() => {
        consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      })

      afterEach(() => {
        consoleSpy.mockRestore()
      })

      it('should log signature preview with correct format', () => {
        const signature = '0x1234567890abcdef'
        const type = 'Personal message'

        SignatureUtils.logSignaturePreview(signature, type)

        expect(consoleSpy).toHaveBeenCalledWith('✅ Personal message signature successful:', 'string', '0x12345678...')
      })

      it('should handle different signature types', () => {
        const testCases = [
          {
            signature: '0xabcdef123456',
            type: 'EIP-712',
            expectedPreview: '0xabcdef12...',
          },
          {
            signature: 'safe-wallet:0x123:nonce:123',
            type: 'Safe wallet',
            expectedPreview: 'safe-wallet...',
          },
          { signature: '0x0', type: 'Minimal', expectedPreview: '0x0...' },
          { signature: '', type: 'Empty', expectedPreview: '...' },
        ]

        testCases.forEach(({ signature, type, expectedPreview }) => {
          SignatureUtils.logSignaturePreview(signature, type)

          expect(consoleSpy).toHaveBeenCalledWith(`✅ ${type} signature successful:`, 'string', expectedPreview)
        })
      })

      it('should truncate long signatures correctly', () => {
        const longSignature = '0x' + 'a'.repeat(128) + 'b'.repeat(10)

        SignatureUtils.logSignaturePreview(longSignature, 'Long signature')

        expect(consoleSpy).toHaveBeenCalledWith('✅ Long signature signature successful:', 'string', '0xaaaaaaaa...')
      })

      it('should handle special characters in signatures', () => {
        const specialSignatures = ['special-signature:with!@#$%^&*()', '0x123-456_789', 'unicode-测试-signature']

        specialSignatures.forEach((signature) => {
          SignatureUtils.logSignaturePreview(signature, 'Special')

          const expectedPreview = signature.substring(0, 10) + '...'
          expect(consoleSpy).toHaveBeenCalledWith('✅ Special signature successful:', 'string', expectedPreview)
        })
      })

      it('should always show string type regardless of signature content', () => {
        const signatures = ['0x123', 'safe-wallet:test', '', '12345']

        signatures.forEach((signature) => {
          SignatureUtils.logSignaturePreview(signature, 'Test')

          expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ Test signature successful:'), 'string', expect.any(String))
        })
      })
    })
  })

  describe('Static Class Behavior', () => {
    it('should not be instantiable', () => {
      expect(() => new (SignatureUtils as unknown as new () => unknown)()).toThrow()
    })

    it('should have all methods as static', () => {
      const expectedMethods = [
        'createTimeoutPromise',
        'withTimeout',
        'validateSignatureResult',
        'createSafeAuthToken',
        'isSafeWalletError',
        'isValidSignatureFormat',
        'logSignaturePreview',
      ]

      expectedMethods.forEach((methodName) => {
        expect(typeof SignatureUtils[methodName as keyof typeof SignatureUtils]).toBe('function')
      })
    })

    it('should have consistent method naming', () => {
      const methods = Object.getOwnPropertyNames(SignatureUtils)
      const functionMethods = methods.filter((name) => typeof SignatureUtils[name as keyof typeof SignatureUtils] === 'function')

      // All methods should be camelCase and descriptive
      functionMethods.forEach((methodName) => {
        expect(methodName).toMatch(/^[a-z][a-zA-Z0-9]*$/)
        expect(methodName.length).toBeGreaterThan(3) // No abbreviated names
      })
    })
  })

  describe('Integration and Edge Cases', () => {
    it('should handle concurrent timeout operations', async () => {
      const promise1 = new Promise((resolve) => setTimeout(() => resolve('result1'), 1000))
      const promise2 = new Promise((resolve) => setTimeout(() => resolve('result2'), 1500))

      const timeout1 = SignatureUtils.withTimeout(promise1, 3000, 'Op1')
      const timeout2 = SignatureUtils.withTimeout(promise2, 3000, 'Op2')

      jest.useRealTimers()
      const [result1, result2] = await Promise.all([timeout1, timeout2])
      jest.useFakeTimers()

      expect(result1).toBe('result1')
      expect(result2).toBe('result2')
    })

    it('should maintain isolation between operations', () => {
      const error1 = 'Method disabled'
      const error2 = 'User rejected'

      expect(SignatureUtils.isSafeWalletError(error1)).toBe(true)
      expect(SignatureUtils.isSafeWalletError(error2)).toBe(false)

      // Results shouldn't influence each other
      expect(SignatureUtils.isSafeWalletError(error1)).toBe(true)
    })

    it('should handle memory efficiency with repeated calls', () => {
      const request: SignatureRequest = {
        message: 'Test',
        nonce: 'nonce',
        timestamp: 123,
        walletAddress: '0x123',
        chainId: 1,
      }

      // Generate many tokens to test memory efficiency
      const tokens = []
      for (let i = 0; i < 1000; i++) {
        tokens.push(SignatureUtils.createSafeAuthToken({ ...request, timestamp: i }))
      }

      expect(tokens).toHaveLength(1000)
      expect(new Set(tokens)).toHaveLength(1000) // All unique
    })
  })
})
