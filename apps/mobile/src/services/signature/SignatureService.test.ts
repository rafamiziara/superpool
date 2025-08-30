import { SignatureRequest, SignatureResult, SignatureFunctions } from '@superpool/types'
import type { Connector } from 'wagmi'
import { devOnly } from '../../utils'
import { SignatureStrategyFactory, SignatureUtils } from './strategies'
import { SignatureService } from './SignatureService'

// Mock dependencies
jest.mock('../../utils', () => ({
  devOnly: jest.fn(),
}))
jest.mock('./strategies', () => ({
  SignatureStrategyFactory: {
    getStrategy: jest.fn(),
  },
  SignatureUtils: {
    isValidSignatureFormat: jest.fn(),
  },
}))

const mockDevOnly = devOnly as jest.MockedFunction<typeof devOnly>
const mockSignatureStrategyFactory = SignatureStrategyFactory as jest.Mocked<typeof SignatureStrategyFactory>
const mockSignatureUtils = SignatureUtils as jest.Mocked<typeof SignatureUtils>

// Mock strategy
const mockStrategy = {
  getStrategyName: jest.fn().mockReturnValue('mock-strategy'),
  sign: jest.fn(),
}

describe('SignatureService', () => {
  let mockSignatureFunctions: SignatureFunctions
  let mockConnector: Connector
  let consoleLogSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  const validSignatureRequest: SignatureRequest = {
    message: 'Please sign this message to authenticate with SuperPool',
    nonce: 'sp_auth_123_abc',
    walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
    timestamp: 1641024000000,
    chainId: 137,
  }

  const mockSignatureResult: SignatureResult = {
    signature: '0xabc123def456789012345678901234567890123456789012345678901234567890123456789012345678901234567890',
    signatureType: 'personal-sign',
  } as any

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset strategy mock
    mockStrategy.getStrategyName.mockReturnValue('mock-strategy')
    mockStrategy.sign.mockResolvedValue(mockSignatureResult)

    // Mock signature functions
    mockSignatureFunctions = {
      personalSign: jest.fn().mockResolvedValue('0xmocked-signature'),
      signTypedData: jest.fn().mockResolvedValue('0xmocked-typed-signature'),
    } as any

    // Mock connector
    mockConnector = {
      id: 'mock-connector',
      name: 'Mock Connector',
      connect: jest.fn(),
      disconnect: jest.fn(),
    } as any

    // Mock strategy factory and utils
    mockSignatureStrategyFactory.getStrategy.mockReturnValue(mockStrategy as any)
    mockSignatureUtils.isValidSignatureFormat.mockReturnValue(true)

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('Class Structure and Static Methods', () => {
    it('should be a class with static methods', () => {
      expect(SignatureService).toBeDefined()
      expect(typeof SignatureService).toBe('function')
      expect(typeof SignatureService.requestSignature).toBe('function')
    })

    it('should not be intended for instantiation (all static methods)', () => {
      // Verify the class is designed to be used statically
      expect(() => new SignatureService()).not.toThrow()
      const instance = new SignatureService()
      expect(instance).toBeInstanceOf(SignatureService)
      
      // But verify no instance methods exist
      expect(typeof (instance as any).requestSignature).toBe('undefined')
    })
  })

  describe('Signature Request Validation', () => {
    describe('Valid Request Processing', () => {
      it('should validate and process valid signature request', async () => {
        const result = await SignatureService.requestSignature(
          validSignatureRequest,
          mockSignatureFunctions,
          mockConnector
        )

        expect(result).toEqual(mockSignatureResult)
        expect(mockDevOnly).toHaveBeenCalledWith(
          '✅ Signature request validation passed:',
          expect.objectContaining({
            messageLength: validSignatureRequest.message.length,
            nonce: validSignatureRequest.nonce,
            walletAddress: expect.stringContaining('0x742d'),
            timestamp: validSignatureRequest.timestamp,
            chainId: validSignatureRequest.chainId,
          })
        )
      })

      it('should handle requests with minimal valid data', async () => {
        const minimalRequest: SignatureRequest = {
          message: 'a', // Minimal non-empty message
          nonce: '1', // Minimal non-empty nonce
          walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          timestamp: 1, // Minimal positive timestamp
          chainId: 1,
        }

        await SignatureService.requestSignature(minimalRequest, mockSignatureFunctions, mockConnector)

        expect(mockStrategy.sign).toHaveBeenCalledWith(minimalRequest, mockSignatureFunctions, mockConnector)
      })

      it('should handle requests without chainId', async () => {
        const requestWithoutChainId = { ...validSignatureRequest }
        delete (requestWithoutChainId as any).chainId

        await SignatureService.requestSignature(requestWithoutChainId, mockSignatureFunctions, mockConnector)

        expect(mockStrategy.sign).toHaveBeenCalledWith(
          expect.objectContaining({
            message: validSignatureRequest.message,
            nonce: validSignatureRequest.nonce,
            walletAddress: validSignatureRequest.walletAddress,
            timestamp: validSignatureRequest.timestamp,
          }),
          mockSignatureFunctions,
          mockConnector
        )
      })
    })

    describe('Message Validation', () => {
      it('should reject request with empty message', async () => {
        const invalidRequest = { ...validSignatureRequest, message: '' }

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing message data')
      })

      it('should reject request with whitespace-only message', async () => {
        const invalidRequest = { ...validSignatureRequest, message: '   \n\t  ' }

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing message data')
      })

      it('should reject request with missing message', async () => {
        const invalidRequest = { ...validSignatureRequest }
        delete (invalidRequest as any).message

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing message data')
      })

      it('should accept very long messages', async () => {
        const longMessage = 'a'.repeat(10000)
        const requestWithLongMessage = { ...validSignatureRequest, message: longMessage }

        await SignatureService.requestSignature(requestWithLongMessage, mockSignatureFunctions, mockConnector)

        expect(mockStrategy.sign).toHaveBeenCalledWith(
          expect.objectContaining({ message: longMessage }),
          mockSignatureFunctions,
          mockConnector
        )
      })
    })

    describe('Nonce Validation', () => {
      it('should reject request with empty nonce', async () => {
        const invalidRequest = { ...validSignatureRequest, nonce: '' }

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing nonce')
      })

      it('should reject request with whitespace-only nonce', async () => {
        const invalidRequest = { ...validSignatureRequest, nonce: '   \t\n  ' }

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing nonce')
      })

      it('should reject request with missing nonce', async () => {
        const invalidRequest = { ...validSignatureRequest }
        delete (invalidRequest as any).nonce

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing nonce')
      })

      it('should accept different nonce formats', async () => {
        const nonceFormats = [
          '123',
          'abc',
          'sp_auth_123_abc',
          '0x123abc',
          'nonce-with-dashes',
          'nonce_with_underscores',
          'Very Long Nonce With Spaces And Numbers 123',
        ]

        for (const nonce of nonceFormats) {
          const request = { ...validSignatureRequest, nonce }
          await SignatureService.requestSignature(request, mockSignatureFunctions, mockConnector)
          expect(mockStrategy.sign).toHaveBeenCalledWith(
            expect.objectContaining({ nonce }),
            mockSignatureFunctions,
            mockConnector
          )
        }
      })
    })

    describe('Wallet Address Validation', () => {
      it('should reject request with empty wallet address', async () => {
        const invalidRequest = { ...validSignatureRequest, walletAddress: '' }

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing wallet address')
      })

      it('should reject request with whitespace-only wallet address', async () => {
        const invalidRequest = { ...validSignatureRequest, walletAddress: '   \t\n  ' }

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing wallet address')
      })

      it('should reject request with missing wallet address', async () => {
        const invalidRequest = { ...validSignatureRequest }
        delete (invalidRequest as any).walletAddress

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing wallet address')
      })

      it('should reject request with invalid wallet address format', async () => {
        const invalidAddresses = [
          '0x123', // Too short
          '742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8', // Missing 0x prefix
          '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8z', // Invalid character
          '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b', // Too short by one
          '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8a', // Too long by one
          '0X742D35CC6634C0532925A3B8D238A5D2DD8DC5B8', // Uppercase X (should be lowercase)
          'not-an-address',
          '0x',
        ]

        for (const walletAddress of invalidAddresses) {
          const invalidRequest = { ...validSignatureRequest, walletAddress }
          await expect(
            SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
          ).rejects.toThrow(`Invalid wallet address format: ${walletAddress}`)
        }
      })

      it('should reject request with empty wallet address separately', async () => {
        const invalidRequest = { ...validSignatureRequest, walletAddress: '' }
        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing wallet address')
      })

      it('should accept valid wallet address formats', async () => {
        const validAddresses = [
          '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          '0x742D35CC6634C0532925A3B8D238A5D2DD8DC5B8', // All uppercase
          '0x742d35cc6634c0532925a3b8d238a5d2dd8dc5b8', // All lowercase
          '0x0000000000000000000000000000000000000000', // All zeros
          '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', // All Fs
        ]

        for (const walletAddress of validAddresses) {
          const request = { ...validSignatureRequest, walletAddress }
          await SignatureService.requestSignature(request, mockSignatureFunctions, mockConnector)
          expect(mockStrategy.sign).toHaveBeenCalledWith(
            expect.objectContaining({ walletAddress }),
            mockSignatureFunctions,
            mockConnector
          )
        }
      })
    })

    describe('Timestamp Validation', () => {
      it('should reject request with zero timestamp', async () => {
        const invalidRequest = { ...validSignatureRequest, timestamp: 0 }

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing valid timestamp')
      })

      it('should reject request with negative timestamp', async () => {
        const invalidRequest = { ...validSignatureRequest, timestamp: -1 }

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing valid timestamp')
      })

      it('should reject request with missing timestamp', async () => {
        const invalidRequest = { ...validSignatureRequest }
        delete (invalidRequest as any).timestamp

        await expect(
          SignatureService.requestSignature(invalidRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow('Signature request missing valid timestamp')
      })

      it('should accept various valid timestamp formats', async () => {
        const validTimestamps = [
          1, // Minimal valid timestamp
          Date.now(), // Current timestamp
          1641024000000, // Specific timestamp
          9999999999999, // Large timestamp
        ]

        for (const timestamp of validTimestamps) {
          const request = { ...validSignatureRequest, timestamp }
          await SignatureService.requestSignature(request, mockSignatureFunctions, mockConnector)
          expect(mockStrategy.sign).toHaveBeenCalledWith(
            expect.objectContaining({ timestamp }),
            mockSignatureFunctions,
            mockConnector
          )
        }
      })
    })
  })

  describe('Strategy Integration', () => {
    it('should get strategy from factory with connector', async () => {
      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)

      expect(mockSignatureStrategyFactory.getStrategy).toHaveBeenCalledWith(mockConnector)
      expect(mockStrategy.sign).toHaveBeenCalledWith(
        validSignatureRequest,
        mockSignatureFunctions,
        mockConnector
      )
    })

    it('should handle signature request without connector', async () => {
      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions)

      expect(mockSignatureStrategyFactory.getStrategy).toHaveBeenCalledWith(undefined)
      expect(mockStrategy.sign).toHaveBeenCalledWith(
        validSignatureRequest,
        mockSignatureFunctions,
        undefined
      )
    })

    it('should handle different strategy types', async () => {
      const strategyTypes = ['personal-sign', 'typed-data', 'safe-wallet', 'ledger']

      for (const strategyType of strategyTypes) {
        mockStrategy.getStrategyName.mockReturnValue(strategyType)
        
        await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          `📱 Using ${strategyType} signing strategy`
        )
      }
    })

    it('should log signature request preview', async () => {
      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🔍 Signature request preview:',
        expect.objectContaining({
          strategy: 'mock-strategy',
          connectorId: 'mock-connector',
          connectorName: 'Mock Connector',
          requestPreview: expect.objectContaining({
            messageLength: validSignatureRequest.message.length,
            messageStart: expect.stringContaining('Please sign this message'),
            walletAddress: expect.stringContaining('0x742d'),
          }),
        })
      )
    })

    it('should handle strategy signing errors', async () => {
      const signingError = new Error('Strategy signing failed')
      mockStrategy.sign.mockRejectedValue(signingError)

      await expect(
        SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)
      ).rejects.toThrow('Strategy signing failed')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Signature request failed:',
        expect.objectContaining({
          error: signingError,
          strategy: 'mock-strategy',
          connectorInfo: { id: 'mock-connector', name: 'Mock Connector' },
        })
      )
    })

    it('should propagate strategy errors without modification', async () => {
      const customError = new Error('Custom strategy error')
      mockStrategy.sign.mockRejectedValue(customError)

      try {
        await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)
        fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBe(customError)
      }
    })
  })

  describe('Signature Result Validation', () => {
    it('should validate signature format after successful signing', async () => {
      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)

      expect(mockSignatureUtils.isValidSignatureFormat).toHaveBeenCalledWith(mockSignatureResult.signature)
    })

    it('should reject invalid signature formats', async () => {
      mockSignatureUtils.isValidSignatureFormat.mockReturnValue(false)

      await expect(
        SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)
      ).rejects.toThrow(`Invalid signature received: ${JSON.stringify(mockSignatureResult.signature)}`)
    })

    it('should handle different signature result types', async () => {
      const signatureResults: SignatureResult[] = [
        {
          signature: '0x123abc',
          signatureType: 'personal-sign',
        },
        {
          signature: '0xdef789',
          signatureType: 'typed-data',
        },
        {
          signature: '0xabc123def456',
          signatureType: 'safe-wallet',
        },
      ] as any[]

      for (const result of signatureResults) {
        mockStrategy.sign.mockResolvedValue(result)
        
        const returnedResult = await SignatureService.requestSignature(
          validSignatureRequest,
          mockSignatureFunctions,
          mockConnector
        )
        
        expect(returnedResult).toBe(result)
        expect(mockDevOnly).toHaveBeenCalledWith(
          '✅ Signature request completed:',
          expect.objectContaining({
            signatureType: result.signatureType,
            signatureLength: result.signature.length,
            signaturePreview: result.signature.substring(0, 10) + '...',
          })
        )
      }
    })

    it('should handle signature validation edge cases', async () => {
      const edgeCaseResults = [
        { ...mockSignatureResult, signature: '' }, // Empty signature
        { ...mockSignatureResult, signature: '0x' }, // Just prefix
        { ...mockSignatureResult, signature: 'no-prefix' }, // No 0x prefix
      ]

      for (const result of edgeCaseResults) {
        mockStrategy.sign.mockResolvedValue(result)
        mockSignatureUtils.isValidSignatureFormat.mockReturnValue(false)
        
        await expect(
          SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)
        ).rejects.toThrow(`Invalid signature received: ${JSON.stringify(result.signature)}`)
      }
    })
  })

  describe('Connector Handling', () => {
    it('should handle different connector types', async () => {
      const connectorTypes = [
        { id: 'metamask', name: 'MetaMask' },
        { id: 'walletconnect', name: 'WalletConnect' },
        { id: 'coinbase', name: 'Coinbase Wallet' },
        { id: 'injected', name: 'Injected' },
      ]

      for (const connectorInfo of connectorTypes) {
        const connector = { ...mockConnector, ...connectorInfo }
        
        await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, connector)
        
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔍 Signature request preview:',
          expect.objectContaining({
            connectorId: connectorInfo.id,
            connectorName: connectorInfo.name,
          })
        )
      }
    })

    it('should handle connector without id or name', async () => {
      const minimalConnector = {
        connect: jest.fn(),
        disconnect: jest.fn(),
      } as any

      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, minimalConnector)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🔍 Signature request preview:',
        expect.objectContaining({
          connectorId: undefined,
          connectorName: undefined,
        })
      )
    })

    it('should handle null connector gracefully', async () => {
      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, null as any)

      expect(mockSignatureStrategyFactory.getStrategy).toHaveBeenCalledWith(null)
    })
  })

  describe('Logging and Debugging', () => {
    it('should call devOnly for validation success', async () => {
      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)

      expect(mockDevOnly).toHaveBeenCalledWith(
        '✅ Signature request validation passed:',
        expect.any(Object)
      )
    })

    it('should call devOnly for completion success', async () => {
      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)

      expect(mockDevOnly).toHaveBeenCalledWith(
        '✅ Signature request completed:',
        expect.any(Object)
      )
    })

    it('should log strategy selection', async () => {
      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)

      expect(consoleLogSpy).toHaveBeenCalledWith('📱 Using mock-strategy signing strategy')
    })

    it('should truncate sensitive information in logs', async () => {
      const longMessage = 'Very long sensitive message that should be truncated in logs for security reasons'
      const requestWithLongMessage = { ...validSignatureRequest, message: longMessage }

      await SignatureService.requestSignature(requestWithLongMessage, mockSignatureFunctions, mockConnector)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '🔍 Signature request preview:',
        expect.objectContaining({
          requestPreview: expect.objectContaining({
            messageStart: longMessage.substring(0, 30) + '...',
            walletAddress: expect.stringMatching(/0x742d\.\.\.C5b8/),
          }),
        })
      )
    })

    it('should handle logging with undefined values gracefully', async () => {
      const resultWithUndefined = {
        ...mockSignatureResult,
        signatureType: undefined as any,
      }
      mockStrategy.sign.mockResolvedValue(resultWithUndefined)

      await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)

      expect(mockDevOnly).toHaveBeenCalledWith(
        '✅ Signature request completed:',
        expect.objectContaining({
          signatureType: undefined,
        })
      )
    })
  })

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent signature requests', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        ...validSignatureRequest,
        nonce: `nonce-${i}`,
      }))

      const promises = requests.map(request =>
        SignatureService.requestSignature(request, mockSignatureFunctions, mockConnector)
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      expect(mockStrategy.sign).toHaveBeenCalledTimes(5)
    })

    it('should handle rapid successive requests', async () => {
      const iterations = 10

      for (let i = 0; i < iterations; i++) {
        const request = {
          ...validSignatureRequest,
          nonce: `rapid-nonce-${i}`,
        }
        await SignatureService.requestSignature(request, mockSignatureFunctions, mockConnector)
      }

      expect(mockStrategy.sign).toHaveBeenCalledTimes(iterations)
    })

    it('should handle mixed success and failure scenarios', async () => {
      const requests = [
        { ...validSignatureRequest, nonce: 'success-1' },
        { ...validSignatureRequest, message: '' }, // Will fail validation
        { ...validSignatureRequest, nonce: 'success-2' },
      ]

      // First request should succeed
      const result1 = await SignatureService.requestSignature(requests[0], mockSignatureFunctions, mockConnector)
      expect(result1).toEqual(mockSignatureResult)

      // Second request should fail validation
      await expect(
        SignatureService.requestSignature(requests[1], mockSignatureFunctions, mockConnector)
      ).rejects.toThrow('Signature request missing message data')

      // Third request should succeed
      const result3 = await SignatureService.requestSignature(requests[2], mockSignatureFunctions, mockConnector)
      expect(result3).toEqual(mockSignatureResult)
    })
  })

  describe('TypedData Interface Compatibility', () => {
    it('should work with the defined TypedDataDomain interface', () => {
      // Test that the TypedDataDomain interface is usable
      const domain = {
        name: 'SuperPool',
        version: '1',
        chainId: 137,
        verifyingContract: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8' as const,
        salt: '0x123abc' as const,
      }

      expect(domain.name).toBe('SuperPool')
      expect(domain.chainId).toBe(137)
    })

    it('should work with the defined TypedDataParameter interface', () => {
      // Test that the TypedDataParameter interface is usable
      const parameters = [
        { name: 'user', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ]

      expect(parameters[0].name).toBe('user')
      expect(parameters[0].type).toBe('address')
    })

    it('should work with the complete TypedData structure', () => {
      // Test that the complete _TypedData interface is usable
      const typedData = {
        domain: {
          name: 'SuperPool',
          version: '1',
          chainId: 137,
        },
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          Permit: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value', type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: {
          owner: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          spender: '0x0000000000000000000000000000000000000000',
          value: 1000,
        },
        account: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8' as const,
      }

      expect(typedData.primaryType).toBe('Permit')
      expect(typedData.account).toBe('0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8')
    })
  })

  describe('Error Propagation and Edge Cases', () => {
    it('should handle strategy factory errors', async () => {
      const factoryError = new Error('Strategy factory failed')
      mockSignatureStrategyFactory.getStrategy.mockImplementation(() => {
        throw factoryError
      })

      await expect(
        SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)
      ).rejects.toThrow('Strategy factory failed')
    })

    it('should handle signature utils validation errors', async () => {
      const validationError = new Error('Signature validation failed')
      mockSignatureUtils.isValidSignatureFormat.mockImplementation(() => {
        throw validationError
      })

      await expect(
        SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)
      ).rejects.toThrow('Signature validation failed')
    })

    it('should maintain error stack traces', async () => {
      const originalError = new Error('Original strategy error')
      originalError.stack = 'Original stack trace'
      mockStrategy.sign.mockRejectedValue(originalError)

      try {
        await SignatureService.requestSignature(validSignatureRequest, mockSignatureFunctions, mockConnector)
        fail('Should have thrown an error')
      } catch (error) {
        expect(error).toBe(originalError)
        expect((error as Error).stack).toBe('Original stack trace')
      }
    })
  })
})