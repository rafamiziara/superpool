import { httpsCallable } from 'firebase/functions'
import { MessageGenerator } from './MessageGenerator'

// Mock Firebase functions
jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
}))
jest.mock('../../../firebase.config', () => ({
  FIREBASE_FUNCTIONS: 'mocked-functions',
}))

const mockHttpsCallable = httpsCallable as jest.MockedFunction<typeof httpsCallable>
const mockGenerateAuthMessageFnFn = jest.fn()

// Set up the mock before module import
mockHttpsCallable.mockReturnValue(mockGenerateAuthMessageFnFn)

describe('MessageGenerator', () => {
  let messageGenerator: MessageGenerator
  let consoleLogSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance
  const validWalletAddress = '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8'

  beforeEach(() => {
    jest.clearAllMocks()
    mockGenerateAuthMessageFnFn.mockClear()

    messageGenerator = new MessageGenerator()

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('Constructor and Firebase Integration', () => {
    it('should initialize correctly', () => {
      expect(messageGenerator).toBeInstanceOf(MessageGenerator)
      expect(messageGenerator).toBeDefined()
    })

    it('should create multiple instances correctly', () => {
      const generator1 = new MessageGenerator()
      const generator2 = new MessageGenerator()

      expect(generator1).toBeInstanceOf(MessageGenerator)
      expect(generator2).toBeInstanceOf(MessageGenerator)
      expect(generator1).not.toBe(generator2) // Different instances
    })
  })

  describe('generateAuthenticationMessage', () => {
    describe('Successful Message Generation', () => {
      it('should generate authentication message successfully with valid response', async () => {
        const mockResponse = {
          data: {
            message: 'Please sign this message to authenticate with SuperPool\n\nNonce: abc123\nTimestamp: 1641024000000',
            nonce: 'abc123',
            timestamp: 1641024000000,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result).toEqual({
          message: 'Please sign this message to authenticate with SuperPool\n\nNonce: abc123\nTimestamp: 1641024000000',
          nonce: 'abc123',
          timestamp: 1641024000000,
        })

        expect(mockGenerateAuthMessageFnFn).toHaveBeenCalledWith({ walletAddress: validWalletAddress })
        expect(consoleLogSpy).toHaveBeenCalledWith('📝 Generating authentication message for address:', validWalletAddress)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Authentication message generated:', 'Please sign this message to authenticate with Supe...')
      })

      it('should handle string timestamp conversion correctly', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: '1641024000000', // String timestamp
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result.timestamp).toBe(1641024000000)
        expect(typeof result.timestamp).toBe('number')
      })

      it('should handle numeric timestamp correctly', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: 1641024000000, // Numeric timestamp
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result.timestamp).toBe(1641024000000)
        expect(typeof result.timestamp).toBe('number')
      })

      it('should log timestamp debugging information', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: '1641024000000',
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(consoleLogSpy).toHaveBeenCalledWith('📊 Timestamp debug:', {
          rawTimestamp: '1641024000000',
          timestamp: 1641024000000,
          type: 'number',
        })
      })

      it('should handle long messages with proper truncation in logs', async () => {
        const longMessage = 'A'.repeat(100) + ' authenticate with SuperPool'
        const mockResponse = {
          data: {
            message: longMessage,
            nonce: 'test-nonce',
            timestamp: 1641024000000,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result.message).toBe(longMessage)
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Authentication message generated:', longMessage.substring(0, 50) + '...')
      })
    })

    describe('Edge Cases and Validation', () => {
      it('should handle undefined message gracefully', async () => {
        const mockResponse = {
          data: {
            message: undefined,
            nonce: 'test-nonce',
            timestamp: 1641024000000,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result.message).toBeUndefined()
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Authentication message generated:', 'undefined...')
      })

      it('should handle null message gracefully', async () => {
        const mockResponse = {
          data: {
            message: null,
            nonce: 'test-nonce',
            timestamp: 1641024000000,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result.message).toBeNull()
      })

      it('should handle empty string message', async () => {
        const mockResponse = {
          data: {
            message: '',
            nonce: 'test-nonce',
            timestamp: 1641024000000,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result.message).toBe('')
        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Authentication message generated:', '...')
      })

      it('should handle different wallet address formats', async () => {
        const addresses = [
          '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
          '0x1234567890123456789012345678901234567890',
          '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdef',
        ]

        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: 1641024000000,
          },
        }

        for (const address of addresses) {
          mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)
          
          const result = await messageGenerator.generateAuthenticationMessage(address)

          expect(result).toBeDefined()
          expect(mockGenerateAuthMessageFn).toHaveBeenCalledWith({ walletAddress: address })
        }
      })
    })

    describe('Timestamp Validation', () => {
      it('should throw error for invalid timestamp (NaN)', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: 'invalid-timestamp',
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Invalid timestamp received from authentication message')
      })

      it('should throw error for null timestamp', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: null,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Invalid timestamp received from authentication message')
      })

      it('should throw error for undefined timestamp', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: undefined,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Invalid timestamp received from authentication message')
      })

      it('should handle zero timestamp', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: 0,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result.timestamp).toBe(0)
      })

      it('should handle negative timestamp', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: -1,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result.timestamp).toBe(-1)
      })

      it('should handle very large timestamp', async () => {
        const largeTimestamp = 9999999999999
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: largeTimestamp,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(result.timestamp).toBe(largeTimestamp)
      })
    })

    describe('Firebase Function Integration', () => {
      it('should handle Firebase function errors', async () => {
        const firebaseError = new Error('Firebase function failed')
        mockGenerateAuthMessageFn.mockRejectedValue(firebaseError)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Firebase function failed')

        expect(mockGenerateAuthMessageFnFn).toHaveBeenCalledWith({ walletAddress: validWalletAddress })
      })

      it('should handle network timeouts', async () => {
        const timeoutError = new Error('Request timeout')
        mockGenerateAuthMessageFn.mockRejectedValue(timeoutError)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Request timeout')
      })

      it('should handle malformed response data', async () => {
        const mockResponse = {
          data: 'invalid-data-format',
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        // This should throw when trying to destructure the response
        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow()
      })

      it('should handle missing data property in response', async () => {
        const mockResponse = {} // Missing data property
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow()
      })

      it('should handle partial response data', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            // Missing nonce and timestamp
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Invalid timestamp received from authentication message')
      })
    })

    describe('Logging Behavior', () => {
      it('should log generation start with wallet address', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: 1641024000000,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(consoleLogSpy).toHaveBeenCalledWith('📝 Generating authentication message for address:', validWalletAddress)
      })

      it('should log successful generation with message preview', async () => {
        const testMessage = 'Test authentication message'
        const mockResponse = {
          data: {
            message: testMessage,
            nonce: 'test-nonce',
            timestamp: 1641024000000,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(consoleLogSpy).toHaveBeenCalledWith('✅ Authentication message generated:', testMessage.substring(0, 50) + '...')
      })

      it('should log timestamp debug information', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: 1641024000000,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await messageGenerator.generateAuthenticationMessage(validWalletAddress)

        expect(consoleLogSpy).toHaveBeenCalledWith('📊 Timestamp debug:', {
          rawTimestamp: 1641024000000,
          timestamp: 1641024000000,
          type: 'number',
        })
      })
    })
  })

  describe('validateAndParseTimestamp (Private Method Testing via Public Interface)', () => {
    describe('Valid Timestamps', () => {
      it('should handle numeric timestamps', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: 1641024000000,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)
        expect(result.timestamp).toBe(1641024000000)
      })

      it('should parse string timestamps', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: '1641024000000',
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)
        expect(result.timestamp).toBe(1641024000000)
      })

      it('should handle string numeric values with leading zeros', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: '0001641024000000',
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)
        expect(result.timestamp).toBe(1641024000000)
      })
    })

    describe('Invalid Timestamps', () => {
      it('should reject non-numeric string timestamps', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: 'not-a-number',
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Invalid timestamp received from authentication message')
      })

      it('should reject boolean timestamps', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: true,
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Invalid timestamp received from authentication message')
      })

      it('should reject array timestamps', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: [1641024000000],
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Invalid timestamp received from authentication message')
      })

      it('should reject object timestamps', async () => {
        const mockResponse = {
          data: {
            message: 'Test message',
            nonce: 'test-nonce',
            timestamp: { value: 1641024000000 },
          },
        }
        mockGenerateAuthMessageFnFn.mockResolvedValue(mockResponse)

        await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
          .rejects.toThrow('Invalid timestamp received from authentication message')
      })
    })
  })

  describe('Error Handling and Robustness', () => {
    it('should handle Firebase function throwing synchronous errors', async () => {
      const syncError = new Error('Synchronous Firebase error')
      mockGenerateAuthMessageFn.mockImplementation(() => {
        throw syncError
      })

      await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
        .rejects.toThrow('Synchronous Firebase error')
    })

    it('should handle Firebase function returning undefined', async () => {
      mockGenerateAuthMessageFn.mockResolvedValue(undefined)

      await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
        .rejects.toThrow()
    })

    it('should handle Firebase function returning null', async () => {
      mockGenerateAuthMessageFn.mockResolvedValue(null)

      await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
        .rejects.toThrow()
    })

    it('should handle wallet address parameter edge cases', async () => {
      const mockResponse = {
        data: {
          message: 'Test message',
          nonce: 'test-nonce',
          timestamp: 1641024000000,
        },
      }
      mockGenerateAuthMessageFn.mockResolvedValue(mockResponse)

      // Empty string wallet address
      await messageGenerator.generateAuthenticationMessage('')
      expect(mockGenerateAuthMessageFn).toHaveBeenCalledWith({ walletAddress: '' })

      // Wallet address with special characters (though invalid, should still pass to Firebase)
      await messageGenerator.generateAuthenticationMessage('0x!@#$%^&*()')
      expect(mockGenerateAuthMessageFn).toHaveBeenCalledWith({ walletAddress: '0x!@#$%^&*()' })
    })
  })

  describe('Performance and Memory', () => {
    it('should handle multiple concurrent message generation requests', async () => {
      const mockResponse = {
        data: {
          message: 'Test message',
          nonce: 'test-nonce',
          timestamp: 1641024000000,
        },
      }
      mockGenerateAuthMessageFn.mockResolvedValue(mockResponse)

      const addresses = Array.from({ length: 10 }, (_, i) => `0x${i.toString().padStart(40, '0')}`)
      
      const promises = addresses.map(address => 
        messageGenerator.generateAuthenticationMessage(address)
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(10)
      results.forEach(result => {
        expect(result).toEqual({
          message: 'Test message',
          nonce: 'test-nonce',
          timestamp: 1641024000000,
        })
      })
      expect(mockGenerateAuthMessageFn).toHaveBeenCalledTimes(10)
    })

    it('should handle rapid successive calls', async () => {
      const mockResponse = {
        data: {
          message: 'Test message',
          nonce: 'test-nonce',
          timestamp: 1641024000000,
        },
      }
      mockGenerateAuthMessageFn.mockResolvedValue(mockResponse)

      const results = []
      for (let i = 0; i < 5; i++) {
        results.push(await messageGenerator.generateAuthenticationMessage(validWalletAddress))
      }

      expect(results).toHaveLength(5)
      expect(mockGenerateAuthMessageFn).toHaveBeenCalledTimes(5)
    })

    it('should not leak memory with large messages', async () => {
      const largeMessage = 'A'.repeat(10000) // 10KB message
      const mockResponse = {
        data: {
          message: largeMessage,
          nonce: 'large-nonce',
          timestamp: 1641024000000,
        },
      }
      mockGenerateAuthMessageFn.mockResolvedValue(mockResponse)

      const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

      expect(result.message).toBe(largeMessage)
      expect(result.message.length).toBe(10000)
    })
  })

  describe('Type Safety and Interface Compliance', () => {
    it('should return GeneratedAuthMessage type with correct properties', async () => {
      const mockResponse = {
        data: {
          message: 'Test message',
          nonce: 'test-nonce',
          timestamp: 1641024000000,
        },
      }
      mockGenerateAuthMessageFn.mockResolvedValue(mockResponse)

      const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('nonce')
      expect(result).toHaveProperty('timestamp')
      expect(typeof result.message).toBe('string')
      expect(typeof result.nonce).toBe('string')
      expect(typeof result.timestamp).toBe('number')
    })

    it('should maintain AuthMessage interface compatibility', async () => {
      const mockResponse = {
        data: {
          message: 'Compatible message',
          nonce: 'compatible-nonce',
          timestamp: 1641024000000,
        },
      }
      mockGenerateAuthMessageFn.mockResolvedValue(mockResponse)

      const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

      // Should be compatible with AuthMessage from @superpool/types
      expect(result).toMatchObject({
        message: expect.any(String),
        nonce: expect.any(String),
        timestamp: expect.any(Number),
      })
    })
  })

  describe('Integration Scenarios', () => {
    it('should work with realistic Firebase response format', async () => {
      const realisticResponse = {
        data: {
          message: 'Welcome to SuperPool!\n\nPlease sign this message to verify your wallet ownership.\n\nThis request will not trigger a blockchain transaction or cost any gas fees.\n\nWallet address: 0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8\nNonce: sp_auth_1641024000000_abc123\nTimestamp: 1641024000000',
          nonce: 'sp_auth_1641024000000_abc123',
          timestamp: 1641024000000,
        },
      }
      mockGenerateAuthMessageFn.mockResolvedValue(realisticResponse)

      const result = await messageGenerator.generateAuthenticationMessage(validWalletAddress)

      expect(result).toEqual(realisticResponse.data)
      expect(result.message).toContain('SuperPool')
      expect(result.message).toContain(validWalletAddress)
      expect(result.nonce).toMatch(/sp_auth_\d+_\w+/)
    })

    it('should handle Firebase function with custom token requirements', async () => {
      // Simulate Firebase function that requires authentication
      const authError = new Error('PERMISSION_DENIED: Missing or insufficient permissions')
      mockGenerateAuthMessageFn.mockRejectedValue(authError)

      await expect(messageGenerator.generateAuthenticationMessage(validWalletAddress))
        .rejects.toThrow('PERMISSION_DENIED: Missing or insufficient permissions')
    })
  })
})