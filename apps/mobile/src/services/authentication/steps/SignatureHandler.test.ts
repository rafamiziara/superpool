import type { SignatureFunctions, SignatureRequest, SignatureResult } from '@superpool/types'
import type { Connector } from 'wagmi'
import { SignatureService } from '../../signature'
import { SignatureHandler, SignatureContext } from './SignatureHandler'
import type { GeneratedAuthMessage } from './MessageGenerator'

// Mock SignatureService
jest.mock('../../signature')

const mockSignatureService = SignatureService as jest.Mocked<typeof SignatureService>

describe('SignatureHandler', () => {
  let signatureHandler: SignatureHandler
  let mockSignatureFunctions: jest.Mocked<SignatureFunctions>
  let mockConnector: Connector
  let mockAuthMessage: GeneratedAuthMessage
  let mockContext: SignatureContext
  let consoleLogSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()

    signatureHandler = new SignatureHandler()

    // Mock signature functions
    mockSignatureFunctions = {
      signTypedDataAsync: jest.fn(),
      signMessageAsync: jest.fn(),
    }

    // Mock connector
    mockConnector = {
      id: 'test-connector',
      name: 'Test Connector',
      type: 'injected',
      uid: 'test-123',
    } as Connector

    // Mock auth message
    mockAuthMessage = {
      message: 'Please sign this message to authenticate with SuperPool\n\nNonce: test-nonce\nTimestamp: 1641024000000',
      nonce: 'test-nonce',
      timestamp: 1641024000000,
    }

    // Mock signature context
    mockContext = {
      walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
      chainId: 137,
      signatureFunctions: mockSignatureFunctions,
      connector: mockConnector,
    }

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  describe('Constructor and Initialization', () => {
    it('should create SignatureHandler instance successfully', () => {
      expect(signatureHandler).toBeInstanceOf(SignatureHandler)
    })

    it('should create multiple independent instances', () => {
      const handler1 = new SignatureHandler()
      const handler2 = new SignatureHandler()

      expect(handler1).toBeInstanceOf(SignatureHandler)
      expect(handler2).toBeInstanceOf(SignatureHandler)
      expect(handler1).not.toBe(handler2)
    })
  })

  describe('requestWalletSignature', () => {
    describe('Successful Signature Requests', () => {
      it('should successfully request wallet signature with complete context', async () => {
        const mockSignatureResult: SignatureResult = {
          signature: '0xabcdef123456789',
          signatureType: 'personal-sign',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        const result = await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

        expect(result).toEqual(mockSignatureResult)
        expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
          {
            message: mockAuthMessage.message,
            nonce: mockAuthMessage.nonce,
            timestamp: mockAuthMessage.timestamp,
            walletAddress: mockContext.walletAddress,
            chainId: mockContext.chainId,
          },
          mockContext.signatureFunctions,
          mockContext.connector
        )
      })

      it('should handle signature request without chainId', async () => {
        const contextWithoutChainId: SignatureContext = {
          ...mockContext,
          chainId: undefined,
        }

        const mockSignatureResult: SignatureResult = {
          signature: '0xdef456789abc',
          signatureType: 'typed-data',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        const result = await signatureHandler.requestWalletSignature(contextWithoutChainId, mockAuthMessage)

        expect(result).toEqual(mockSignatureResult)
        expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
          {
            message: mockAuthMessage.message,
            nonce: mockAuthMessage.nonce,
            timestamp: mockAuthMessage.timestamp,
            walletAddress: contextWithoutChainId.walletAddress,
            chainId: undefined,
          },
          contextWithoutChainId.signatureFunctions,
          contextWithoutChainId.connector
        )
      })

      it('should handle signature request without connector', async () => {
        const contextWithoutConnector: SignatureContext = {
          ...mockContext,
          connector: undefined,
        }

        const mockSignatureResult: SignatureResult = {
          signature: '0x789abcdef123',
          signatureType: 'safe-wallet',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        const result = await signatureHandler.requestWalletSignature(contextWithoutConnector, mockAuthMessage)

        expect(result).toEqual(mockSignatureResult)
        expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
          expect.any(Object),
          contextWithoutConnector.signatureFunctions,
          undefined
        )
      })

      it('should handle different signature types', async () => {
        const signatureTypes: Array<SignatureResult['signatureType']> = ['personal-sign', 'typed-data', 'safe-wallet']

        for (const signatureType of signatureTypes) {
          const mockSignatureResult: SignatureResult = {
            signature: `0x${signatureType}signature`,
            signatureType,
          }

          mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

          const result = await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

          expect(result.signatureType).toBe(signatureType)
        }
      })
    })

    describe('SignatureRequest Creation', () => {
      it('should create proper SignatureRequest object from context and auth message', async () => {
        const mockSignatureResult: SignatureResult = {
          signature: '0xtest',
          signatureType: 'personal-sign',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

        const expectedSignatureRequest: SignatureRequest = {
          message: mockAuthMessage.message,
          nonce: mockAuthMessage.nonce,
          timestamp: mockAuthMessage.timestamp,
          walletAddress: mockContext.walletAddress,
          chainId: mockContext.chainId,
        }

        expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
          expectedSignatureRequest,
          mockContext.signatureFunctions,
          mockContext.connector
        )
      })

      it('should handle different chain IDs correctly', async () => {
        const chainIds = [1, 137, 31337, 80001, undefined]

        const mockSignatureResult: SignatureResult = {
          signature: '0xchaintest',
          signatureType: 'personal-sign',
        }

        for (const chainId of chainIds) {
          mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

          const contextWithChainId = { ...mockContext, chainId }

          await signatureHandler.requestWalletSignature(contextWithChainId, mockAuthMessage)

          expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
            expect.objectContaining({ chainId }),
            expect.any(Object),
            expect.any(Object)
          )
        }
      })

      it('should preserve all auth message properties in signature request', async () => {
        const detailedAuthMessage: GeneratedAuthMessage = {
          message: 'Detailed authentication message with multiple lines\nand special characters: !@#$%^&*()',
          nonce: 'complex-nonce-abc123-xyz789',
          timestamp: 1641024000123,
        }

        const mockSignatureResult: SignatureResult = {
          signature: '0xdetailed',
          signatureType: 'typed-data',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        await signatureHandler.requestWalletSignature(mockContext, detailedAuthMessage)

        expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
          expect.objectContaining({
            message: detailedAuthMessage.message,
            nonce: detailedAuthMessage.nonce,
            timestamp: detailedAuthMessage.timestamp,
          }),
          expect.any(Object),
          expect.any(Object)
        )
      })
    })

    describe('Error Handling', () => {
      it('should propagate SignatureService errors', async () => {
        const signatureError = new Error('Signature request failed')
        mockSignatureService.requestSignature.mockRejectedValue(signatureError)

        await expect(signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)).rejects.toThrow('Signature request failed')
      })

      it('should handle user rejection errors', async () => {
        const userRejectionError = new Error('User rejected the request')
        mockSignatureService.requestSignature.mockRejectedValue(userRejectionError)

        await expect(signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)).rejects.toThrow('User rejected the request')
      })

      it('should handle timeout errors', async () => {
        const timeoutError = new Error('Request timeout')
        mockSignatureService.requestSignature.mockRejectedValue(timeoutError)

        await expect(signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)).rejects.toThrow('Request timeout')
      })

      it('should handle network errors', async () => {
        const networkError = new Error('Network connection failed')
        mockSignatureService.requestSignature.mockRejectedValue(networkError)

        await expect(signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)).rejects.toThrow('Network connection failed')
      })

      it('should handle malformed signature service response', async () => {
        mockSignatureService.requestSignature.mockResolvedValue(null as any)

        const result = await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

        expect(result).toBeNull()
      })
    })

    describe('Logging Behavior', () => {
      it('should log signature request initiation', async () => {
        const mockSignatureResult: SignatureResult = {
          signature: '0xlogging',
          signatureType: 'personal-sign',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

        expect(consoleLogSpy).toHaveBeenCalledWith('✍️ Requesting wallet signature...')
      })

      it('should log signature request details', async () => {
        const mockSignatureResult: SignatureResult = {
          signature: '0xdetails',
          signatureType: 'personal-sign',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

        expect(consoleLogSpy).toHaveBeenCalledWith('🔐 Signature request prepared:', {
          walletAddress: mockContext.walletAddress,
          chainId: mockContext.chainId,
          messagePreview: 'Please sign this message to authenticate with Supe...',
          connectorId: mockContext.connector?.id,
        })
      })

      it('should truncate long messages in logs', async () => {
        const longMessage = 'A'.repeat(100) + ' authentication message'
        const longAuthMessage: GeneratedAuthMessage = {
          ...mockAuthMessage,
          message: longMessage,
        }

        const mockSignatureResult: SignatureResult = {
          signature: '0xlongmessage',
          signatureType: 'personal-sign',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        await signatureHandler.requestWalletSignature(mockContext, longAuthMessage)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔐 Signature request prepared:',
          expect.objectContaining({
            messagePreview: longMessage.substring(0, 50) + '...',
          })
        )
      })

      it('should handle undefined message in logs', async () => {
        const authMessageWithUndefinedMessage: GeneratedAuthMessage = {
          ...mockAuthMessage,
          message: undefined as any,
        }

        const mockSignatureResult: SignatureResult = {
          signature: '0xundefined',
          signatureType: 'personal-sign',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        await signatureHandler.requestWalletSignature(mockContext, authMessageWithUndefinedMessage)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔐 Signature request prepared:',
          expect.objectContaining({
            messagePreview: 'undefined...',
          })
        )
      })

      it('should log connector information when present', async () => {
        const mockSignatureResult: SignatureResult = {
          signature: '0xconnector',
          signatureType: 'personal-sign',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔐 Signature request prepared:',
          expect.objectContaining({
            connectorId: 'test-connector',
          })
        )
      })

      it('should handle missing connector in logs', async () => {
        const contextWithoutConnector: SignatureContext = {
          ...mockContext,
          connector: undefined,
        }

        const mockSignatureResult: SignatureResult = {
          signature: '0xnoconnector',
          signatureType: 'personal-sign',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        await signatureHandler.requestWalletSignature(contextWithoutConnector, mockAuthMessage)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔐 Signature request prepared:',
          expect.objectContaining({
            connectorId: undefined,
          })
        )
      })
    })

    describe('SignatureContext Variations', () => {
      it('should handle different wallet address formats', async () => {
        const walletAddresses = [
          '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          '0x1234567890123456789012345678901234567890',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
          '0x0000000000000000000000000000000000000000',
        ]

        const mockSignatureResult: SignatureResult = {
          signature: '0xaddress',
          signatureType: 'personal-sign',
        }

        for (const walletAddress of walletAddresses) {
          mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

          const contextWithAddress = { ...mockContext, walletAddress }

          const result = await signatureHandler.requestWalletSignature(contextWithAddress, mockAuthMessage)

          expect(result).toEqual(mockSignatureResult)
          expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
            expect.objectContaining({ walletAddress }),
            expect.any(Object),
            expect.any(Object)
          )
        }
      })

      it('should handle different connector types', async () => {
        const connectorTypes = ['injected', 'walletConnect', 'safe', 'coinbaseWallet']

        const mockSignatureResult: SignatureResult = {
          signature: '0xconnectortype',
          signatureType: 'personal-sign',
        }

        for (const type of connectorTypes) {
          const connectorWithType = {
            ...mockConnector,
            type: type as any,
            id: `${type}-connector`,
          }

          const contextWithConnectorType = {
            ...mockContext,
            connector: connectorWithType,
          }

          mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

          const result = await signatureHandler.requestWalletSignature(contextWithConnectorType, mockAuthMessage)

          expect(result).toEqual(mockSignatureResult)
          expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), connectorWithType)
        }
      })

      it('should handle minimal SignatureContext', async () => {
        const minimalContext: SignatureContext = {
          walletAddress: '0x1234567890123456789012345678901234567890',
          signatureFunctions: mockSignatureFunctions,
        }

        const mockSignatureResult: SignatureResult = {
          signature: '0xminimal',
          signatureType: 'personal-sign',
        }

        mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

        const result = await signatureHandler.requestWalletSignature(minimalContext, mockAuthMessage)

        expect(result).toEqual(mockSignatureResult)
        expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
          expect.objectContaining({
            walletAddress: minimalContext.walletAddress,
            chainId: undefined,
          }),
          minimalContext.signatureFunctions,
          undefined
        )
      })
    })

    describe('GeneratedAuthMessage Variations', () => {
      it('should handle different auth message formats', async () => {
        const authMessages: GeneratedAuthMessage[] = [
          {
            message: 'Simple auth message',
            nonce: 'simple-nonce',
            timestamp: 1641024000000,
          },
          {
            message: 'Multi-line\nauthentication\nmessage',
            nonce: 'multiline-nonce',
            timestamp: 1641024001000,
          },
          {
            message: 'Message with special chars: !@#$%^&*()',
            nonce: 'special-chars-nonce',
            timestamp: 1641024002000,
          },
        ]

        const mockSignatureResult: SignatureResult = {
          signature: '0xformat',
          signatureType: 'typed-data',
        }

        for (const authMessage of authMessages) {
          mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

          const result = await signatureHandler.requestWalletSignature(mockContext, authMessage)

          expect(result).toEqual(mockSignatureResult)
          expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
            expect.objectContaining({
              message: authMessage.message,
              nonce: authMessage.nonce,
              timestamp: authMessage.timestamp,
            }),
            expect.any(Object),
            expect.any(Object)
          )
        }
      })

      it('should handle edge case timestamps', async () => {
        const timestamps = [0, -1, 9999999999999, 1641024000000]

        const mockSignatureResult: SignatureResult = {
          signature: '0xtimestamp',
          signatureType: 'personal-sign',
        }

        for (const timestamp of timestamps) {
          const authMessageWithTimestamp = { ...mockAuthMessage, timestamp }

          mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

          const result = await signatureHandler.requestWalletSignature(mockContext, authMessageWithTimestamp)

          expect(result).toEqual(mockSignatureResult)
          expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
            expect.objectContaining({ timestamp }),
            expect.any(Object),
            expect.any(Object)
          )
        }
      })
    })
  })

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent signature requests', async () => {
      const mockSignatureResult: SignatureResult = {
        signature: '0xconcurrent',
        signatureType: 'personal-sign',
      }

      mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

      const promises = Array.from({ length: 5 }, () => signatureHandler.requestWalletSignature(mockContext, mockAuthMessage))

      const results = await Promise.all(promises)

      expect(results).toHaveLength(5)
      results.forEach((result) => {
        expect(result).toEqual(mockSignatureResult)
      })
      expect(mockSignatureService.requestSignature).toHaveBeenCalledTimes(5)
    })

    it('should handle rapid successive requests', async () => {
      const mockSignatureResult: SignatureResult = {
        signature: '0xrapid',
        signatureType: 'personal-sign',
      }

      mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

      const results = []
      for (let i = 0; i < 3; i++) {
        results.push(await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage))
      }

      expect(results).toHaveLength(3)
      expect(mockSignatureService.requestSignature).toHaveBeenCalledTimes(3)
    })

    it('should not leak memory with large auth messages', async () => {
      const largeMessage = 'A'.repeat(10000) // 10KB message
      const largeAuthMessage: GeneratedAuthMessage = {
        ...mockAuthMessage,
        message: largeMessage,
      }

      const mockSignatureResult: SignatureResult = {
        signature: '0xlarge',
        signatureType: 'personal-sign',
      }

      mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

      const result = await signatureHandler.requestWalletSignature(mockContext, largeAuthMessage)

      expect(result).toEqual(mockSignatureResult)
      expect(mockSignatureService.requestSignature).toHaveBeenCalledWith(
        expect.objectContaining({ message: largeMessage }),
        expect.any(Object),
        expect.any(Object)
      )
    })
  })

  describe('Integration with SignatureService', () => {
    it('should pass through all SignatureService return values', async () => {
      const signatureResults: SignatureResult[] = [
        { signature: '0xresult1', signatureType: 'personal-sign' },
        { signature: '0xresult2', signatureType: 'typed-data' },
        { signature: '0xresult3', signatureType: 'safe-wallet' },
      ]

      for (const expectedResult of signatureResults) {
        mockSignatureService.requestSignature.mockResolvedValue(expectedResult)

        const result = await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

        expect(result).toEqual(expectedResult)
      }
    })

    it('should maintain proper call order and timing', async () => {
      const callOrder: string[] = []

      mockSignatureService.requestSignature.mockImplementation(async () => {
        callOrder.push('SignatureService.requestSignature')
        return { signature: '0xtiming', signatureType: 'personal-sign' }
      })

      const originalConsoleLog = console.log
      console.log = jest.fn((...args) => {
        if (typeof args[0] === 'string' && args[0].includes('Requesting wallet signature')) {
          callOrder.push('Log: Requesting signature')
        }
        if (typeof args[0] === 'string' && args[0].includes('Signature request prepared')) {
          callOrder.push('Log: Request prepared')
        }
      })

      await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

      expect(callOrder).toEqual(['Log: Requesting signature', 'Log: Request prepared', 'SignatureService.requestSignature'])

      console.log = originalConsoleLog
    })
  })

  describe('Type Safety and Interface Compliance', () => {
    it('should maintain SignatureContext interface compliance', () => {
      const validContext: SignatureContext = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        chainId: 137,
        signatureFunctions: mockSignatureFunctions,
        connector: mockConnector,
      }

      expect(validContext).toHaveProperty('walletAddress')
      expect(validContext).toHaveProperty('signatureFunctions')
      expect(typeof validContext.walletAddress).toBe('string')
      expect(typeof validContext.signatureFunctions).toBe('object')
    })

    it('should handle optional SignatureContext properties correctly', () => {
      const contextWithOptionals: SignatureContext = {
        walletAddress: '0x1234567890123456789012345678901234567890',
        signatureFunctions: mockSignatureFunctions,
        // chainId and connector are optional
      }

      expect(contextWithOptionals.chainId).toBeUndefined()
      expect(contextWithOptionals.connector).toBeUndefined()
    })

    it('should return proper SignatureResult type', async () => {
      const mockSignatureResult: SignatureResult = {
        signature: '0xtypesafety',
        signatureType: 'personal-sign',
      }

      mockSignatureService.requestSignature.mockResolvedValue(mockSignatureResult)

      const result = await signatureHandler.requestWalletSignature(mockContext, mockAuthMessage)

      expect(result).toHaveProperty('signature')
      expect(result).toHaveProperty('signatureType')
      expect(typeof result.signature).toBe('string')
      expect(['personal-sign', 'typed-data', 'safe-wallet']).toContain(result.signatureType)
    })
  })
})
