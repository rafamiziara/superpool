import { SafeWalletStrategy } from './SafeWalletStrategy'
import { SignatureUtils } from './SignatureUtils'
import type { SignatureRequest, SignatureFunctions, SignatureResult } from '@superpool/types'
import type { Connector } from 'wagmi'

// Mock SignatureUtils
jest.mock('./SignatureUtils', () => ({
  SignatureUtils: {
    withTimeout: jest.fn(),
    validateSignatureResult: jest.fn(),
    createSafeAuthToken: jest.fn(),
  },
}))

// Mock devOnly utility
jest.mock('../../../utils', () => ({
  devOnly: jest.fn(),
}))

const mockSignatureUtils = SignatureUtils as jest.Mocked<typeof SignatureUtils>
const { devOnly } = require('../../../utils')

describe('SafeWalletStrategy', () => {
  let strategy: SafeWalletStrategy
  let mockSignatureFunctions: jest.Mocked<SignatureFunctions>
  let mockRequest: SignatureRequest
  let mockSafeConnector: Connector

  beforeEach(() => {
    strategy = new SafeWalletStrategy()

    mockSignatureFunctions = {
      signMessageAsync: jest.fn(),
      signTypedDataAsync: jest.fn(),
    }

    mockRequest = {
      message: 'Please sign this authentication message to verify your wallet ownership',
      nonce: 'safe123nonce456',
      timestamp: 1234567890,
      walletAddress: '0x742d35Cc6624C4532F7845A7b6d4b7c5c4dF5b9e',
      chainId: 1,
    }

    mockSafeConnector = {
      id: 'safe',
      name: 'Safe Wallet',
      type: 'safe',
    } as Connector

    // Reset all mocks
    jest.clearAllMocks()

    // Set up default mock implementations
    mockSignatureUtils.withTimeout.mockImplementation(async (promise) => await promise)
    mockSignatureUtils.validateSignatureResult.mockReturnValue(true)
    mockSignatureUtils.createSafeAuthToken.mockReturnValue('safe-wallet:0x742d35:safe123:1234567890')
    devOnly.mockImplementation(() => {})
  })

  describe('Strategy Interface Implementation', () => {
    describe('canHandle', () => {
      it('should return false when no connector is provided', () => {
        expect(strategy.canHandle()).toBe(false)
        expect(strategy.canHandle(undefined)).toBe(false)
      })

      it('should return true for Safe connectors by ID', () => {
        const safeConnectors = [
          { id: 'safe', name: 'Any Name', type: 'any' },
          { id: 'safe-wallet', name: 'Wallet', type: 'custom' },
          { id: 'SAFE', name: 'Wallet', type: 'custom' },
          { id: 'mysafeconnector', name: 'Wallet', type: 'custom' },
        ] as Connector[]

        safeConnectors.forEach((connector) => {
          expect(strategy.canHandle(connector)).toBe(true)
        })
      })

      it('should return true for Safe connectors by name (case insensitive)', () => {
        const safeConnectors = [
          { id: 'wallet1', name: 'Safe Wallet', type: 'custom' },
          { id: 'wallet2', name: 'SAFE WALLET', type: 'custom' },
          { id: 'wallet3', name: 'safe wallet', type: 'custom' },
          { id: 'wallet4', name: 'MySafeWallet', type: 'custom' },
          { id: 'wallet5', name: 'WalletSafe', type: 'custom' },
        ] as Connector[]

        safeConnectors.forEach((connector) => {
          expect(strategy.canHandle(connector)).toBe(true)
        })
      })

      it('should return false for non-Safe connectors', () => {
        const nonSafeConnectors = [
          { id: 'metamask', name: 'MetaMask', type: 'injected' },
          { id: 'walletconnect', name: 'WalletConnect', type: 'walletconnect' },
          { id: 'coinbase', name: 'Coinbase Wallet', type: 'coinbaseWallet' },
          { id: 'injected', name: 'Browser Wallet', type: 'injected' },
          { id: 'custom', name: 'Custom Wallet', type: 'custom' },
        ] as Connector[]

        nonSafeConnectors.forEach((connector) => {
          expect(strategy.canHandle(connector)).toBe(false)
        })
      })

      it('should handle edge cases with connector properties', () => {
        expect(strategy.canHandle({ id: '', name: '', type: '' } as Connector)).toBe(false)
        expect(strategy.canHandle({ id: null, name: null, type: 'test' } as any)).toBe(false)
        expect(strategy.canHandle({ id: undefined, name: undefined, type: 'test' } as any)).toBe(false)
      })

      it('should handle partial Safe matches correctly', () => {
        const edgeCases = [
          { id: 'unsafe', name: 'Wallet', type: 'custom' }, // 'safe' in id but not Safe wallet
          { id: 'wallet', name: 'Unsafe Wallet', type: 'custom' }, // 'safe' in name but not Safe wallet
          { id: 'safewallet', name: 'Wallet', type: 'custom' }, // Contains 'safe'
          { id: 'wallet', name: 'SafeWallet', type: 'custom' }, // Contains 'safe'
        ] as Connector[]

        // These should all return true because they contain 'safe'
        edgeCases.forEach((connector) => {
          expect(strategy.canHandle(connector)).toBe(true)
        })
      })
    })

    describe('getStrategyName', () => {
      it('should return correct strategy name', () => {
        expect(strategy.getStrategyName()).toBe('safe-wallet')
      })

      it('should be consistent across instances', () => {
        const strategy2 = new SafeWalletStrategy()
        expect(strategy.getStrategyName()).toBe(strategy2.getStrategyName())
      })
    })
  })

  describe('Direct Signing Flow', () => {
    describe('sign method - successful direct signing', () => {
      beforeEach(() => {
        mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x1234567890abcdef')
        mockSignatureUtils.validateSignatureResult.mockReturnValue(true)
      })

      it('should successfully sign with direct connector signing', async () => {
        const result = await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(result).toEqual({
          signature: '0x1234567890abcdef',
          signatureType: 'personal-sign',
        })

        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
          message: mockRequest.message,
          account: mockRequest.walletAddress as `0x${string}`,
          connector: mockSafeConnector,
        })

        expect(mockSignatureUtils.withTimeout).toHaveBeenCalledWith(
          expect.any(Promise),
          20000, // Safe wallet timeout
          'Safe connector signing'
        )

        expect(mockSignatureUtils.validateSignatureResult).toHaveBeenCalledWith('0x1234567890abcdef')
        expect(devOnly).toHaveBeenCalledWith('✅ Safe wallet direct signing successful:', 'string', '0x12345678...')
      })

      it('should use correct timeout for Safe wallets', async () => {
        await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(mockSignatureUtils.withTimeout).toHaveBeenCalledWith(
          expect.any(Promise),
          20000, // Safe wallet timeout (20s)
          'Safe connector signing'
        )
      })

      it('should pass connector to signing function', async () => {
        await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
          message: mockRequest.message,
          account: mockRequest.walletAddress as `0x${string}`,
          connector: mockSafeConnector,
        })
      })

      it('should handle different Safe connectors', async () => {
        const differentSafeConnectors = [
          { id: 'safe', name: 'Safe', type: 'safe' },
          { id: 'gnosis-safe', name: 'Gnosis Safe', type: 'safe' },
          { id: 'safe-mobile', name: 'Safe Mobile', type: 'safe' },
        ] as Connector[]

        for (const connector of differentSafeConnectors) {
          mockSignatureFunctions.signMessageAsync.mockClear()

          await strategy.sign(mockRequest, mockSignatureFunctions, connector)

          expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
            message: mockRequest.message,
            account: mockRequest.walletAddress as `0x${string}`,
            connector,
          })
        }
      })

      it('should work without connector parameter (fallback)', async () => {
        const result = await strategy.sign(mockRequest, mockSignatureFunctions)

        expect(result).toEqual({
          signature: '0x1234567890abcdef',
          signatureType: 'personal-sign',
        })

        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
          message: mockRequest.message,
          account: mockRequest.walletAddress as `0x${string}`,
          connector: undefined,
        })
      })
    })

    describe('sign method - direct signing validation failure', () => {
      beforeEach(() => {
        mockSignatureFunctions.signMessageAsync.mockResolvedValue('invalid-signature')
        mockSignatureUtils.validateSignatureResult.mockReturnValue(false)
      })

      it('should fallback to ownership verification when validation fails', async () => {
        const result = await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(result).toEqual({
          signature: 'safe-wallet:0x742d35:safe123:1234567890',
          signatureType: 'safe-wallet',
        })

        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalled()
        expect(mockSignatureUtils.validateSignatureResult).toHaveBeenCalledWith('invalid-signature')
        expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
      })

      it('should log validation failure and fallback', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

        await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(consoleSpy).toHaveBeenCalledWith('🔐 Safe wallet detected, trying direct connector signing...')
        expect(consoleSpy).toHaveBeenCalledWith('🔐 Using Safe wallet authentication (ownership verification)')
        expect(consoleSpy).toHaveBeenCalledWith('🔐 Safe wallet authentication token generated')

        consoleSpy.mockRestore()
      })
    })

    describe('sign method - direct signing exception', () => {
      it('should fallback to ownership verification when signing throws error', async () => {
        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Safe connector failed'))

        const result = await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(result).toEqual({
          signature: 'safe-wallet:0x742d35:safe123:1234567890',
          signatureType: 'safe-wallet',
        })

        expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
      })

      it('should log signing error and fallback', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        const errorMessage = 'Method not supported by Safe'

        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error(errorMessage))

        await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(consoleSpy).toHaveBeenCalledWith(
          '❌ Safe direct signing failed, using ownership verification fallback...',
          expect.any(Error)
        )

        consoleSpy.mockRestore()
      })

      it('should handle different error types', async () => {
        const errorTypes = [
          new Error('Network timeout'),
          new Error('User rejected'),
          new Error('Method disabled'),
          { message: 'Object error' },
          'String error',
          null,
          undefined,
        ]

        for (const error of errorTypes) {
          mockSignatureFunctions.signMessageAsync.mockRejectedValueOnce(error)
          mockSignatureUtils.createSafeAuthToken.mockReturnValue(`safe-wallet:test:${Math.random()}`)

          const result = await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

          expect(result.signatureType).toBe('safe-wallet')
          expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
        }
      })
    })

    describe('sign method - timeout scenarios', () => {
      it('should handle timeout from SignatureUtils', async () => {
        mockSignatureUtils.withTimeout.mockRejectedValue(new Error('Safe connector signing timed out after 20 seconds'))

        const result = await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(result.signatureType).toBe('safe-wallet')
        expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
      })

      it('should use 20 second timeout for Safe wallets', async () => {
        mockSignatureFunctions.signMessageAsync.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('0x123'), 100)))

        await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(mockSignatureUtils.withTimeout).toHaveBeenCalledWith(expect.any(Promise), 20000, 'Safe connector signing')
      })
    })
  })

  describe('Fallback Mechanism', () => {
    describe('createFallbackSignature private method', () => {
      it('should create fallback signature with Safe auth token', async () => {
        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Failed'))

        const result = await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(result).toEqual({
          signature: 'safe-wallet:0x742d35:safe123:1234567890',
          signatureType: 'safe-wallet',
        })

        expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
      })

      it('should log fallback creation', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Failed'))

        await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(consoleSpy).toHaveBeenCalledWith('🔐 Using Safe wallet authentication (ownership verification)')
        expect(consoleSpy).toHaveBeenCalledWith('🔐 Safe wallet authentication token generated')

        consoleSpy.mockRestore()
      })

      it('should handle different request parameters in fallback', async () => {
        const differentRequests = [
          { ...mockRequest, walletAddress: '0x123' },
          { ...mockRequest, nonce: 'different-nonce' },
          { ...mockRequest, timestamp: 999999999 },
          { ...mockRequest, chainId: 137 },
        ]

        for (const request of differentRequests) {
          mockSignatureFunctions.signMessageAsync.mockRejectedValueOnce(new Error('Failed'))

          await strategy.sign(request, mockSignatureFunctions, mockSafeConnector)

          expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(request)
        }
      })
    })
  })

  describe('Integration with SignatureUtils', () => {
    it('should call all required SignatureUtils methods in successful flow', async () => {
      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123abc')

      await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(mockSignatureUtils.withTimeout).toHaveBeenCalledWith(expect.any(Promise), 20000, 'Safe connector signing')
      expect(mockSignatureUtils.validateSignatureResult).toHaveBeenCalledWith('0x123abc')
    })

    it('should call SignatureUtils for fallback token creation', async () => {
      mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Failed'))

      await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
    })

    it('should maintain proper method call order', async () => {
      const callOrder: string[] = []

      mockSignatureUtils.withTimeout.mockImplementation(async (promise) => {
        callOrder.push('withTimeout')
        return await promise
      })

      mockSignatureUtils.validateSignatureResult.mockImplementation((sig) => {
        callOrder.push('validateSignatureResult')
        return true
      })

      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(callOrder).toEqual(['withTimeout', 'validateSignatureResult'])
    })

    it('should call createSafeAuthToken when fallback is needed', async () => {
      mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Direct signing failed'))

      await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledTimes(1)
      expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
    })
  })

  describe('Console Logging Integration', () => {
    let consoleSpy: jest.SpyInstance

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    it('should log direct signing attempt', async () => {
      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(consoleSpy).toHaveBeenCalledWith('🔐 Safe wallet detected, trying direct connector signing...')
    })

    it('should log fallback when direct signing fails', async () => {
      mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Failed'))

      await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(consoleSpy).toHaveBeenCalledWith('❌ Safe direct signing failed, using ownership verification fallback...', expect.any(Error))
      expect(consoleSpy).toHaveBeenCalledWith('🔐 Using Safe wallet authentication (ownership verification)')
      expect(consoleSpy).toHaveBeenCalledWith('🔐 Safe wallet authentication token generated')
    })

    it('should log development-only success messages', async () => {
      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x1234567890abcdef')

      await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(devOnly).toHaveBeenCalledWith('✅ Safe wallet direct signing successful:', 'string', '0x12345678...')
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle requests with different message formats', async () => {
      const messages = [
        '',
        'Short msg',
        'Very long Safe wallet authentication message with lots of details...',
        'Special chars: !@#$%^&*()_+',
        'Unicode: 测试消息',
      ]

      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      for (const message of messages) {
        const request = { ...mockRequest, message }
        await strategy.sign(request, mockSignatureFunctions, mockSafeConnector)

        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
          message,
          account: mockRequest.walletAddress as `0x${string}`,
          connector: mockSafeConnector,
        })
      }
    })

    it('should handle requests with different wallet addresses', async () => {
      const addresses = ['0x0000000000000000000000000000000000000000', '0xffffffffffffffffffffffffffffffffffffffff', '0x123', '0xabc456def']

      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      for (const walletAddress of addresses) {
        const request = { ...mockRequest, walletAddress }
        await strategy.sign(request, mockSignatureFunctions, mockSafeConnector)

        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
          message: mockRequest.message,
          account: walletAddress as `0x${string}`,
          connector: mockSafeConnector,
        })
      }
    })

    it('should handle null/undefined signature results', async () => {
      mockSignatureFunctions.signMessageAsync.mockResolvedValue(null as any)
      mockSignatureUtils.validateSignatureResult.mockReturnValue(false)

      const result = await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(result.signatureType).toBe('safe-wallet')
      expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
    })

    it('should always fallback to Safe auth token on any failure', async () => {
      const failures = [
        () => mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Network error')),
        () => mockSignatureFunctions.signMessageAsync.mockRejectedValue('String error'),
        () => mockSignatureFunctions.signMessageAsync.mockRejectedValue(null),
        () => {
          mockSignatureFunctions.signMessageAsync.mockResolvedValue('invalid')
          mockSignatureUtils.validateSignatureResult.mockReturnValue(false)
        },
      ]

      for (const setupFailure of failures) {
        jest.clearAllMocks()
        setupFailure()

        const result = await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(result.signatureType).toBe('safe-wallet')
        expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
      }
    })
  })

  describe('Class Construction and Instances', () => {
    it('should create new instances successfully', () => {
      const strategy1 = new SafeWalletStrategy()
      const strategy2 = new SafeWalletStrategy()

      expect(strategy1).toBeInstanceOf(SafeWalletStrategy)
      expect(strategy2).toBeInstanceOf(SafeWalletStrategy)
      expect(strategy1).not.toBe(strategy2) // Different instances
    })

    it('should have consistent behavior across instances', () => {
      const strategy1 = new SafeWalletStrategy()
      const strategy2 = new SafeWalletStrategy()
      const testConnector = { id: 'safe', name: 'Safe', type: 'safe' } as Connector

      expect(strategy1.getStrategyName()).toBe(strategy2.getStrategyName())
      expect(strategy1.canHandle(testConnector)).toBe(strategy2.canHandle(testConnector))
    })

    it('should have static timeout constant accessible', () => {
      // Access private static through any cast for testing
      const strategyAny = strategy as any
      const timeout = strategyAny.constructor.TIMEOUT_MS

      expect(timeout).toBe(20000)
    })
  })

  describe('Performance and Memory', () => {
    it('should handle multiple concurrent sign requests', async () => {
      mockSignatureFunctions.signMessageAsync.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('0x123'), 10)))

      const requests = Array(5).fill(mockRequest)
      const promises = requests.map((req) => strategy.sign(req, mockSignatureFunctions, mockSafeConnector))

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      results.forEach((result) => {
        expect(result.signatureType).toBe('personal-sign')
      })
    })

    it('should not leak memory with repeated usage', () => {
      // Create many instances to test memory efficiency
      const strategies = []
      for (let i = 0; i < 100; i++) {
        strategies.push(new SafeWalletStrategy())
      }

      expect(strategies).toHaveLength(100)
      strategies.forEach((s) => {
        expect(s.getStrategyName()).toBe('safe-wallet')
      })
    })

    it('should handle fallback creation efficiently', async () => {
      // Test repeated fallback creation
      for (let i = 0; i < 50; i++) {
        mockSignatureFunctions.signMessageAsync.mockRejectedValueOnce(new Error(`Failure ${i}`))

        const result = await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        expect(result.signatureType).toBe('safe-wallet')
      }

      expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledTimes(50)
    })
  })

  describe('Integration with devOnly utility', () => {
    it('should call devOnly for successful signing logs', async () => {
      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x1234567890abcdef')

      await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(devOnly).toHaveBeenCalledWith('✅ Safe wallet direct signing successful:', 'string', '0x12345678...')
    })

    it('should not call devOnly on fallback path', async () => {
      mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Failed'))

      await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

      expect(devOnly).not.toHaveBeenCalled()
    })

    it('should handle different signature lengths in devOnly call', async () => {
      const signatures = ['0x12', '0x1234567890', '0x' + 'a'.repeat(100), '']

      for (const signature of signatures) {
        mockSignatureFunctions.signMessageAsync.mockResolvedValueOnce(signature)
        devOnly.mockClear()

        await strategy.sign(mockRequest, mockSignatureFunctions, mockSafeConnector)

        const expectedPreview = signature.substring(0, 10) + '...'
        expect(devOnly).toHaveBeenCalledWith('✅ Safe wallet direct signing successful:', 'string', expectedPreview)
      }
    })
  })
})
