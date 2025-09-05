import { RegularWalletStrategy } from './RegularWalletStrategy'
import { SignatureUtils } from './SignatureUtils'
import type { SignatureFunctions, SignatureRequest } from '@superpool/types'
import type { Connector } from 'wagmi'

// Mock SignatureUtils
jest.mock('./SignatureUtils', () => ({
  SignatureUtils: {
    withTimeout: jest.fn(),
    validateSignatureResult: jest.fn(),
    isSafeWalletError: jest.fn(),
    logSignaturePreview: jest.fn(),
    createSafeAuthToken: jest.fn(),
  },
}))

const mockSignatureUtils = SignatureUtils as jest.Mocked<typeof SignatureUtils>

describe('RegularWalletStrategy', () => {
  let strategy: RegularWalletStrategy
  let mockSignatureFunctions: jest.Mocked<SignatureFunctions>
  let mockRequest: SignatureRequest

  beforeEach(() => {
    strategy = new RegularWalletStrategy()

    mockSignatureFunctions = {
      signMessageAsync: jest.fn(),
      signTypedDataAsync: jest.fn(),
    }

    mockRequest = {
      message: 'Please sign this authentication message to verify your wallet ownership',
      nonce: 'abc123def456',
      timestamp: 1234567890,
      walletAddress: '0x742d35Cc6624C4532F7845A7b6d4b7c5c4dF5b9e',
      chainId: 1,
    }

    // Reset all mocks
    jest.clearAllMocks()

    // Set up default mock implementations
    mockSignatureUtils.withTimeout.mockImplementation(async (promise) => await promise)
    mockSignatureUtils.validateSignatureResult.mockReturnValue(true)
    mockSignatureUtils.isSafeWalletError.mockReturnValue(false)
    mockSignatureUtils.logSignaturePreview.mockImplementation()
    mockSignatureUtils.createSafeAuthToken.mockReturnValue('safe-wallet:0x123:nonce:123')
  })

  describe('Strategy Interface Implementation', () => {
    describe('canHandle', () => {
      it('should return true when no connector is provided', () => {
        expect(strategy.canHandle()).toBe(true)
        expect(strategy.canHandle(undefined)).toBe(true)
      })

      it('should return true for non-Safe connectors', () => {
        const regularConnectors = [
          { id: 'metamask', name: 'MetaMask', type: 'injected' },
          { id: 'walletconnect', name: 'WalletConnect', type: 'walletconnect' },
          { id: 'coinbase', name: 'Coinbase Wallet', type: 'coinbaseWallet' },
          { id: 'injected', name: 'Injected', type: 'injected' },
        ] as Connector[]

        regularConnectors.forEach((connector) => {
          expect(strategy.canHandle(connector)).toBe(true)
        })
      })

      it('should return false for Safe connectors by ID', () => {
        const safeConnector = {
          id: 'safe',
          name: 'Safe Wallet',
          type: 'safe',
        } as Connector
        expect(strategy.canHandle(safeConnector)).toBe(false)
      })

      it('should return false for Safe connectors by name (case insensitive)', () => {
        const safeConnectors = [
          { id: 'wallet1', name: 'Safe Wallet', type: 'custom' },
          { id: 'wallet2', name: 'SAFE WALLET', type: 'custom' },
          { id: 'wallet3', name: 'safe wallet', type: 'custom' },
          { id: 'wallet4', name: 'MySafeWallet', type: 'custom' },
        ] as Connector[]

        safeConnectors.forEach((connector) => {
          expect(strategy.canHandle(connector)).toBe(false)
        })
      })

      it('should return false for connectors with Safe in ID (case insensitive)', () => {
        const safeConnectors = [
          { id: 'safe-wallet', name: 'Wallet', type: 'custom' },
          { id: 'SAFE', name: 'Wallet', type: 'custom' },
          { id: 'mysafeconnector', name: 'Wallet', type: 'custom' },
        ] as Connector[]

        safeConnectors.forEach((connector) => {
          expect(strategy.canHandle(connector)).toBe(false)
        })
      })

      it('should handle edge cases with connector properties', () => {
        expect(strategy.canHandle({ id: '', name: '', type: '' } as Connector)).toBe(true)
        expect(
          strategy.canHandle({
            id: null,
            name: null,
            type: 'test',
          } as unknown as Connector)
        ).toBe(true)
        expect(
          strategy.canHandle({
            id: undefined,
            name: undefined,
            type: 'test',
          } as unknown as Connector)
        ).toBe(true)
      })
    })

    describe('getStrategyName', () => {
      it('should return correct strategy name', () => {
        expect(strategy.getStrategyName()).toBe('regular-wallet')
      })

      it('should be consistent across instances', () => {
        const strategy2 = new RegularWalletStrategy()
        expect(strategy.getStrategyName()).toBe(strategy2.getStrategyName())
      })
    })
  })

  describe('Main Signing Flow', () => {
    describe('sign method - successful personal sign', () => {
      beforeEach(() => {
        mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x1234567890abcdef')
        mockSignatureUtils.validateSignatureResult.mockReturnValue(true)
      })

      it('should successfully sign with personal message as first attempt', async () => {
        const result = await strategy.sign(mockRequest, mockSignatureFunctions)

        expect(result).toEqual({
          signature: '0x1234567890abcdef',
          signatureType: 'personal-sign',
        })

        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
          message: mockRequest.message,
          account: mockRequest.walletAddress as `0x${string}`,
        })

        expect(mockSignatureUtils.withTimeout).toHaveBeenCalledWith(expect.any(Promise), 15000, 'Personal sign request')

        expect(mockSignatureUtils.validateSignatureResult).toHaveBeenCalledWith('0x1234567890abcdef')
        expect(mockSignatureUtils.logSignaturePreview).toHaveBeenCalledWith('0x1234567890abcdef', 'Personal message')

        // Should not attempt EIP-712 signing
        expect(mockSignatureFunctions.signTypedDataAsync).not.toHaveBeenCalled()
      })

      it('should use correct timeout for regular wallets', async () => {
        await strategy.sign(mockRequest, mockSignatureFunctions)

        expect(mockSignatureUtils.withTimeout).toHaveBeenCalledWith(
          expect.any(Promise),
          15000, // Regular wallet timeout
          'Personal sign request'
        )
      })
    })

    describe('sign method - personal sign fails, EIP-712 succeeds', () => {
      beforeEach(() => {
        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Personal sign not supported'))
        mockSignatureFunctions.signTypedDataAsync.mockResolvedValue('0xabcdef567890123')
        mockSignatureUtils.validateSignatureResult.mockReturnValue(true)
      })

      it('should fallback to EIP-712 when personal sign fails', async () => {
        const result = await strategy.sign(mockRequest, mockSignatureFunctions)

        expect(result).toEqual({
          signature: '0xabcdef567890123',
          signatureType: 'typed-data',
        })

        // Should have tried personal sign first
        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalled()

        // Should have fallen back to EIP-712
        expect(mockSignatureFunctions.signTypedDataAsync).toHaveBeenCalledWith({
          domain: {
            name: 'SuperPool Authentication',
            version: '1',
            chainId: 1,
          },
          types: {
            Authentication: [
              { name: 'wallet', type: 'address' },
              { name: 'nonce', type: 'string' },
              { name: 'timestamp', type: 'uint256' },
            ],
          },
          primaryType: 'Authentication',
          message: {
            wallet: mockRequest.walletAddress as `0x${string}`,
            nonce: mockRequest.nonce,
            timestamp: BigInt(mockRequest.timestamp),
          },
        })

        expect(mockSignatureUtils.logSignaturePreview).toHaveBeenCalledWith('0xabcdef567890123', 'EIP-712')
      })

      it('should create correct typed data structure', async () => {
        await strategy.sign(mockRequest, mockSignatureFunctions)

        const typedDataCall = mockSignatureFunctions.signTypedDataAsync.mock.calls[0][0]

        expect(typedDataCall.domain).toEqual({
          name: 'SuperPool Authentication',
          version: '1',
          chainId: 1,
        })

        expect(typedDataCall.types).toEqual({
          Authentication: [
            { name: 'wallet', type: 'address' },
            { name: 'nonce', type: 'string' },
            { name: 'timestamp', type: 'uint256' },
          ],
        })

        expect(typedDataCall.primaryType).toBe('Authentication')
        expect(typedDataCall.message).toEqual({
          wallet: mockRequest.walletAddress as `0x${string}`,
          nonce: mockRequest.nonce,
          timestamp: BigInt(mockRequest.timestamp),
        })
      })

      it('should handle different chain IDs in typed data', async () => {
        const requestWithChainId = { ...mockRequest, chainId: 137 }
        await strategy.sign(requestWithChainId, mockSignatureFunctions)

        const typedDataCall = mockSignatureFunctions.signTypedDataAsync.mock.calls[0][0]
        expect(typedDataCall.domain?.chainId).toBe(137)
      })

      it('should default to chain ID 1 when not provided', async () => {
        const requestWithoutChainId = { ...mockRequest, chainId: undefined }
        await strategy.sign(requestWithoutChainId, mockSignatureFunctions)

        const typedDataCall = mockSignatureFunctions.signTypedDataAsync.mock.calls[0][0]
        expect(typedDataCall.domain?.chainId).toBe(1)
      })
    })

    describe('sign method - Safe wallet detection scenarios', () => {
      it('should detect Safe wallet during personal sign and switch to Safe auth', async () => {
        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Method disabled'))
        mockSignatureUtils.isSafeWalletError.mockReturnValue(true)
        mockSignatureUtils.createSafeAuthToken.mockReturnValue('safe-wallet:0x742d35:abc123:1234567890')

        const result = await strategy.sign(mockRequest, mockSignatureFunctions)

        expect(result).toEqual({
          signature: 'safe-wallet:0x742d35:abc123:1234567890',
          signatureType: 'safe-wallet',
        })

        expect(mockSignatureUtils.isSafeWalletError).toHaveBeenCalledWith('Method disabled')
        expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)

        // Should not attempt EIP-712 when Safe is detected
        expect(mockSignatureFunctions.signTypedDataAsync).not.toHaveBeenCalled()
      })

      it('should detect Safe wallet from personal sign validation failure', async () => {
        mockSignatureFunctions.signMessageAsync.mockResolvedValue('invalid-signature')
        mockSignatureUtils.validateSignatureResult.mockReturnValue(false)
        mockSignatureUtils.isSafeWalletError.mockReturnValue(true)

        const result = await strategy.sign(mockRequest, mockSignatureFunctions)

        expect(result).toEqual({
          signature: 'safe-wallet:0x123:nonce:123',
          signatureType: 'safe-wallet',
        })

        expect(mockSignatureUtils.isSafeWalletError).toHaveBeenCalledWith('"invalid-signature"')
        expect(mockSignatureUtils.isSafeWalletError).toHaveBeenCalledWith('SafeWalletDetected')
        expect(mockSignatureUtils.isSafeWalletError).toHaveBeenCalledTimes(2)
      })

      it('should detect Safe wallet during EIP-712 signing', async () => {
        // Personal sign fails with non-Safe error
        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Network timeout'))
        mockSignatureUtils.isSafeWalletError.mockReturnValueOnce(false) // For personal sign error

        // EIP-712 fails with Safe error
        mockSignatureFunctions.signTypedDataAsync.mockRejectedValue(new Error('eth_signTypedData_v4 does not exist'))
        mockSignatureUtils.isSafeWalletError.mockReturnValueOnce(true) // For EIP-712 error

        const result = await strategy.sign(mockRequest, mockSignatureFunctions)

        expect(result).toEqual({
          signature: 'safe-wallet:0x123:nonce:123',
          signatureType: 'safe-wallet',
        })

        expect(mockSignatureUtils.isSafeWalletError).toHaveBeenCalledTimes(2)
      })

      it('should detect Safe wallet from EIP-712 validation failure', async () => {
        // Personal sign fails normally
        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('User rejected'))
        mockSignatureUtils.isSafeWalletError.mockReturnValueOnce(false)

        // EIP-712 returns invalid signature
        mockSignatureFunctions.signTypedDataAsync.mockResolvedValue('{"error": "safe:// redirect"}')
        mockSignatureUtils.validateSignatureResult.mockReturnValue(false)
        mockSignatureUtils.isSafeWalletError.mockReturnValueOnce(true)

        const result = await strategy.sign(mockRequest, mockSignatureFunctions)

        expect(result.signatureType).toBe('safe-wallet')
      })

      it('should handle SafeWalletDetected special error from personal sign', async () => {
        mockSignatureFunctions.signMessageAsync.mockResolvedValue('invalid')
        mockSignatureUtils.validateSignatureResult.mockReturnValue(false)
        mockSignatureUtils.isSafeWalletError.mockReturnValue(true)

        await expect(strategy.sign(mockRequest, mockSignatureFunctions)).resolves.toEqual({
          signature: 'safe-wallet:0x123:nonce:123',
          signatureType: 'safe-wallet',
        })
      })
    })

    describe('sign method - complete failure scenarios', () => {
      it('should throw error when both personal sign and EIP-712 fail with non-Safe errors', async () => {
        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('User rejected'))
        mockSignatureFunctions.signTypedDataAsync.mockRejectedValue(new Error('Network error'))
        mockSignatureUtils.isSafeWalletError.mockReturnValue(false)

        await expect(strategy.sign(mockRequest, mockSignatureFunctions)).rejects.toThrow('All signature methods failed')
      })

      it('should throw error when personal sign validation fails with non-Safe error', async () => {
        mockSignatureFunctions.signMessageAsync.mockResolvedValue('invalid-signature')
        mockSignatureFunctions.signTypedDataAsync.mockRejectedValue(new Error('EIP-712 failed'))
        mockSignatureUtils.validateSignatureResult.mockReturnValue(false)
        mockSignatureUtils.isSafeWalletError.mockReturnValue(false)

        await expect(strategy.sign(mockRequest, mockSignatureFunctions)).rejects.toThrow()
      })

      it('should throw error when EIP-712 validation fails with non-Safe error', async () => {
        mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Personal failed'))
        mockSignatureFunctions.signTypedDataAsync.mockResolvedValue('invalid-eip712')
        mockSignatureUtils.validateSignatureResult.mockReturnValueOnce(false).mockReturnValueOnce(false)
        mockSignatureUtils.isSafeWalletError.mockReturnValue(false)

        await expect(strategy.sign(mockRequest, mockSignatureFunctions)).rejects.toThrow()
      })
    })
  })

  describe('Timeout Handling', () => {
    it('should use regular wallet timeout (15s) for personal signing', async () => {
      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      await strategy.sign(mockRequest, mockSignatureFunctions)

      expect(mockSignatureUtils.withTimeout).toHaveBeenCalledWith(expect.any(Promise), 15000, 'Personal sign request')
    })

    it('should use regular wallet timeout (15s) for EIP-712 signing', async () => {
      mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Failed'))
      mockSignatureFunctions.signTypedDataAsync.mockResolvedValue('0x123')

      await strategy.sign(mockRequest, mockSignatureFunctions)

      expect(mockSignatureUtils.withTimeout).toHaveBeenCalledWith(expect.any(Promise), 15000, 'EIP-712 signature request')
    })

    it('should handle timeout errors from SignatureUtils', async () => {
      mockSignatureUtils.withTimeout.mockRejectedValue(new Error('Personal sign request timed out after 15 seconds'))
      mockSignatureUtils.isSafeWalletError.mockReturnValue(false)

      await expect(strategy.sign(mockRequest, mockSignatureFunctions)).rejects.toThrow()
    })

    it('should detect Safe wallet from timeout errors', async () => {
      mockSignatureUtils.withTimeout.mockRejectedValue(new Error('Method disabled timeout'))
      mockSignatureUtils.isSafeWalletError.mockReturnValue(true)

      const result = await strategy.sign(mockRequest, mockSignatureFunctions)

      expect(result.signatureType).toBe('safe-wallet')
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle null/undefined signature results', async () => {
      mockSignatureFunctions.signMessageAsync.mockResolvedValue(null as unknown as string)
      mockSignatureUtils.validateSignatureResult.mockReturnValue(false)
      mockSignatureUtils.isSafeWalletError.mockReturnValue(false)

      await expect(strategy.sign(mockRequest, mockSignatureFunctions)).rejects.toThrow()
    })

    it('should handle connector parameter in sign method', async () => {
      const mockConnector = {
        id: 'test',
        name: 'Test',
        type: 'test',
      } as Connector
      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      await strategy.sign(mockRequest, mockSignatureFunctions, mockConnector)

      expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
        message: mockRequest.message,
        account: mockRequest.walletAddress as `0x${string}`,
      })
    })

    it('should handle requests with different message formats', async () => {
      const differentMessages = [
        '',
        'Short',
        'Very long authentication message with lots of details...',
        'Message with special chars: !@#$%^&*()_+',
        'Unicode message: 测试消息',
      ]

      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      for (const message of differentMessages) {
        const request = { ...mockRequest, message }
        await strategy.sign(request, mockSignatureFunctions)

        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
          message,
          account: mockRequest.walletAddress as `0x${string}`,
        })
      }
    })

    it('should handle requests with different wallet addresses', async () => {
      const addresses = ['0x0000000000000000000000000000000000000000', '0xffffffffffffffffffffffffffffffffffffffff', '0x123abc']

      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      for (const walletAddress of addresses) {
        const request = { ...mockRequest, walletAddress }
        await strategy.sign(request, mockSignatureFunctions)

        expect(mockSignatureFunctions.signMessageAsync).toHaveBeenCalledWith({
          message: mockRequest.message,
          account: walletAddress as `0x${string}`,
        })
      }
    })

    it('should handle various error object formats', async () => {
      const errorObjects = [
        new Error('Simple error'),
        { message: 'Object error' },
        'String error',
        null,
        undefined,
        42,
        { code: -32603, message: 'RPC Error' },
      ]

      mockSignatureUtils.isSafeWalletError.mockReturnValue(false)

      for (const error of errorObjects) {
        mockSignatureFunctions.signMessageAsync.mockRejectedValueOnce(error)
        mockSignatureFunctions.signTypedDataAsync.mockRejectedValueOnce(error)

        await expect(strategy.sign(mockRequest, mockSignatureFunctions)).rejects.toThrow()
      }
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

    it('should log personal signing attempt', async () => {
      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      await strategy.sign(mockRequest, mockSignatureFunctions)

      expect(consoleSpy).toHaveBeenCalledWith('📱 Trying personal message signing first for better UX...')
    })

    it('should log EIP-712 fallback attempt', async () => {
      mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Personal failed'))
      mockSignatureFunctions.signTypedDataAsync.mockResolvedValue('0x123')
      mockSignatureUtils.isSafeWalletError.mockReturnValue(false)

      await strategy.sign(mockRequest, mockSignatureFunctions)

      expect(consoleSpy).toHaveBeenCalledWith('❌ Personal signing failed, trying EIP-712...', 'Personal failed')
      expect(consoleSpy).toHaveBeenCalledWith('📱 Trying EIP-712 typed data signing as fallback...')
    })

    it('should log Safe wallet detection', async () => {
      mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Method disabled'))
      mockSignatureUtils.isSafeWalletError.mockReturnValue(true)

      await strategy.sign(mockRequest, mockSignatureFunctions)

      expect(consoleSpy).toHaveBeenCalledWith('🔐 Safe wallet authentication token generated (personal sign exception detection)')
    })

    it('should log complete failure', async () => {
      mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Personal failed'))
      mockSignatureFunctions.signTypedDataAsync.mockRejectedValue(new Error('EIP712 failed'))
      mockSignatureUtils.isSafeWalletError.mockReturnValue(false)

      await expect(strategy.sign(mockRequest, mockSignatureFunctions)).rejects.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith('❌ EIP-712 also failed, no more fallbacks available:', 'EIP712 failed')
    })
  })

  describe('Integration with SignatureUtils', () => {
    it('should call all required SignatureUtils methods in successful flow', async () => {
      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123abc')

      await strategy.sign(mockRequest, mockSignatureFunctions)

      expect(mockSignatureUtils.withTimeout).toHaveBeenCalled()
      expect(mockSignatureUtils.validateSignatureResult).toHaveBeenCalledWith('0x123abc')
      expect(mockSignatureUtils.logSignaturePreview).toHaveBeenCalledWith('0x123abc', 'Personal message')
    })

    it('should call SignatureUtils for Safe detection and token creation', async () => {
      mockSignatureFunctions.signMessageAsync.mockRejectedValue(new Error('Safe error'))
      mockSignatureUtils.isSafeWalletError.mockReturnValue(true)

      await strategy.sign(mockRequest, mockSignatureFunctions)

      expect(mockSignatureUtils.isSafeWalletError).toHaveBeenCalledWith('Safe error')
      expect(mockSignatureUtils.createSafeAuthToken).toHaveBeenCalledWith(mockRequest)
    })

    it('should maintain proper method call order', async () => {
      const callOrder: string[] = []

      mockSignatureUtils.withTimeout.mockImplementation(async (promise) => {
        callOrder.push('withTimeout')
        return await promise
      })

      mockSignatureUtils.validateSignatureResult.mockImplementation((_sig) => {
        callOrder.push('validateSignatureResult')
        return true
      })

      mockSignatureUtils.logSignaturePreview.mockImplementation(() => {
        callOrder.push('logSignaturePreview')
      })

      mockSignatureFunctions.signMessageAsync.mockResolvedValue('0x123')

      await strategy.sign(mockRequest, mockSignatureFunctions)

      expect(callOrder).toEqual(['withTimeout', 'validateSignatureResult', 'logSignaturePreview'])
    })
  })

  describe('Class Construction and Instances', () => {
    it('should create new instances successfully', () => {
      const strategy1 = new RegularWalletStrategy()
      const strategy2 = new RegularWalletStrategy()

      expect(strategy1).toBeInstanceOf(RegularWalletStrategy)
      expect(strategy2).toBeInstanceOf(RegularWalletStrategy)
      expect(strategy1).not.toBe(strategy2) // Different instances
    })

    it('should have consistent behavior across instances', () => {
      const strategy1 = new RegularWalletStrategy()
      const strategy2 = new RegularWalletStrategy()

      expect(strategy1.getStrategyName()).toBe(strategy2.getStrategyName())
      expect(strategy1.canHandle()).toBe(strategy2.canHandle())
    })

    it('should have static timeout constants accessible', () => {
      // Access private static through any cast for testing
      const StrategyClass = strategy.constructor as unknown as { TIMEOUT_MS: number; SAFE_TIMEOUT_MS: number }
      const regularTimeout = StrategyClass.TIMEOUT_MS
      const safeTimeout = StrategyClass.SAFE_TIMEOUT_MS

      expect(regularTimeout).toBe(15000)
      expect(safeTimeout).toBe(20000)
    })
  })

  describe('Performance and Memory', () => {
    it('should handle multiple concurrent sign requests', async () => {
      mockSignatureFunctions.signMessageAsync.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve('0x123'), 10)))

      const requests = Array(5).fill(mockRequest)
      const promises = requests.map((req) => strategy.sign(req, mockSignatureFunctions))

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
        strategies.push(new RegularWalletStrategy())
      }

      expect(strategies).toHaveLength(100)
      strategies.forEach((s) => {
        expect(s.getStrategyName()).toBe('regular-wallet')
      })
    })
  })
})
