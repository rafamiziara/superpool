import type { SignatureFunctions, SignatureRequest, SignatureResult } from '@superpool/types'
import type { Connector } from 'wagmi'
import type { SignatureConfig, SignatureStrategy } from './SignatureStrategy'

describe('SignatureStrategy Interface', () => {
  let mockRequest: SignatureRequest
  let mockFunctions: SignatureFunctions
  let mockConnector: Connector

  beforeEach(() => {
    mockRequest = {
      message: 'Test message for signing',
      nonce: 'test-nonce-123',
      timestamp: Date.now(),
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      chainId: 137,
    }

    mockFunctions = {
      signTypedDataAsync: jest.fn().mockResolvedValue('0xmockedTypedDataSignature'),
      signMessageAsync: jest.fn().mockResolvedValue('0xmockedMessageSignature'),
    }

    mockConnector = {
      id: 'mock-connector',
      name: 'Mock Connector',
      type: 'mock',
      uid: 'mock-123',
    } as Connector
  })

  describe('Interface Implementation Compliance', () => {
    describe('Complete Implementation', () => {
      class ValidSignatureStrategy implements SignatureStrategy {
        async sign(request: SignatureRequest, functions: SignatureFunctions, connector?: Connector): Promise<SignatureResult> {
          return {
            signature: '0xvalidSignature',
            signatureType: 'personal-sign',
          }
        }

        canHandle(connector?: Connector): boolean {
          return true
        }

        getStrategyName(): string {
          return 'ValidStrategy'
        }
      }

      it('should implement all required methods correctly', () => {
        const strategy = new ValidSignatureStrategy()

        expect(strategy).toHaveProperty('sign')
        expect(strategy).toHaveProperty('canHandle')
        expect(strategy).toHaveProperty('getStrategyName')
        expect(typeof strategy.sign).toBe('function')
        expect(typeof strategy.canHandle).toBe('function')
        expect(typeof strategy.getStrategyName).toBe('function')
      })

      it('should have sign method with correct signature', async () => {
        const strategy = new ValidSignatureStrategy()

        const result = await strategy.sign(mockRequest, mockFunctions, mockConnector)

        expect(result).toHaveProperty('signature')
        expect(result).toHaveProperty('signatureType')
        expect(typeof result.signature).toBe('string')
        expect(['typed-data', 'personal-sign', 'safe-wallet']).toContain(result.signatureType)
      })

      it('should have canHandle method with correct signature', () => {
        const strategy = new ValidSignatureStrategy()

        const result1 = strategy.canHandle(mockConnector)
        const result2 = strategy.canHandle(undefined)

        expect(typeof result1).toBe('boolean')
        expect(typeof result2).toBe('boolean')
      })

      it('should have getStrategyName method with correct signature', () => {
        const strategy = new ValidSignatureStrategy()

        const name = strategy.getStrategyName()

        expect(typeof name).toBe('string')
        expect(name.length).toBeGreaterThan(0)
      })
    })

    describe('Method Parameter Validation', () => {
      class ParameterValidationStrategy implements SignatureStrategy {
        async sign(request: SignatureRequest, functions: SignatureFunctions, connector?: Connector): Promise<SignatureResult> {
          // Validate request parameter
          expect(request).toHaveProperty('message')
          expect(request).toHaveProperty('nonce')
          expect(request).toHaveProperty('timestamp')
          expect(request).toHaveProperty('walletAddress')

          // Validate functions parameter
          expect(functions).toHaveProperty('signTypedDataAsync')
          expect(functions).toHaveProperty('signMessageAsync')
          expect(typeof functions.signTypedDataAsync).toBe('function')
          expect(typeof functions.signMessageAsync).toBe('function')

          // Validate optional connector parameter
          if (connector !== undefined) {
            expect(connector).toHaveProperty('id')
          }

          return {
            signature: '0xvalidatedSignature',
            signatureType: 'personal-sign',
          }
        }

        canHandle(connector?: Connector): boolean {
          if (connector !== undefined) {
            expect(connector).toHaveProperty('id')
            expect(typeof connector.id).toBe('string')
          }
          return true
        }

        getStrategyName(): string {
          return 'ParameterValidationStrategy'
        }
      }

      it('should receive correct parameters in sign method', async () => {
        const strategy = new ParameterValidationStrategy()

        await expect(strategy.sign(mockRequest, mockFunctions, mockConnector)).resolves.toBeDefined()
        await expect(strategy.sign(mockRequest, mockFunctions, undefined)).resolves.toBeDefined()
      })

      it('should receive correct parameters in canHandle method', () => {
        const strategy = new ParameterValidationStrategy()

        expect(() => strategy.canHandle(mockConnector)).not.toThrow()
        expect(() => strategy.canHandle(undefined)).not.toThrow()
      })
    })

    describe('Return Type Validation', () => {
      class ReturnTypeStrategy implements SignatureStrategy {
        async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          return {
            signature: '0xreturnTypeValidation',
            signatureType: 'typed-data',
          }
        }

        canHandle(_connector?: Connector): boolean {
          return false
        }

        getStrategyName(): string {
          return 'ReturnTypeStrategy'
        }
      }

      it('should return Promise<SignatureResult> from sign method', async () => {
        const strategy = new ReturnTypeStrategy()

        const result = await strategy.sign(mockRequest, mockFunctions, mockConnector)

        expect(result).toEqual({
          signature: '0xreturnTypeValidation',
          signatureType: 'typed-data',
        })
      })

      it('should return boolean from canHandle method', () => {
        const strategy = new ReturnTypeStrategy()

        const result = strategy.canHandle()

        expect(typeof result).toBe('boolean')
        expect(result).toBe(false)
      })

      it('should return string from getStrategyName method', () => {
        const strategy = new ReturnTypeStrategy()

        const result = strategy.getStrategyName()

        expect(typeof result).toBe('string')
        expect(result).toBe('ReturnTypeStrategy')
      })
    })
  })

  describe('SignatureResult Type Validation', () => {
    it('should accept all valid signature types', async () => {
      const validTypes = ['typed-data', 'personal-sign', 'safe-wallet'] as const

      for (const signatureType of validTypes) {
        class TypedStrategy implements SignatureStrategy {
          async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
            return {
              signature: `0x${signatureType}Signature`,
              signatureType,
            }
          }
          canHandle(_connector?: Connector) {
            return true
          }
          getStrategyName() {
            return `${signatureType}Strategy`
          }
        }

        const strategy = new TypedStrategy()
        const result = await strategy.sign(mockRequest, mockFunctions, mockConnector)

        expect(result.signatureType).toBe(signatureType)
        expect(['typed-data', 'personal-sign', 'safe-wallet']).toContain(result.signatureType)
      }
    })

    it('should require both signature and signatureType properties', async () => {
      class CompleteResultStrategy implements SignatureStrategy {
        async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          return {
            signature: '0xcompleteResult',
            signatureType: 'personal-sign',
          }
        }
        canHandle(_connector?: Connector) {
          return true
        }
        getStrategyName() {
          return 'CompleteResultStrategy'
        }
      }

      const strategy = new CompleteResultStrategy()
      const result = await strategy.sign(mockRequest, mockFunctions)

      expect(result).toHaveProperty('signature')
      expect(result).toHaveProperty('signatureType')
      expect(Object.keys(result)).toEqual(['signature', 'signatureType'])
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle strategy that throws errors', async () => {
      class ErrorThrowingStrategy implements SignatureStrategy {
        async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          throw new Error('Signing failed')
        }
        canHandle(_connector?: Connector) {
          return true
        }
        getStrategyName() {
          return 'ErrorThrowingStrategy'
        }
      }

      const strategy = new ErrorThrowingStrategy()

      await expect(strategy.sign(mockRequest, mockFunctions, mockConnector)).rejects.toThrow('Signing failed')
    })

    it('should handle strategy with async canHandle (even though interface is sync)', () => {
      // This tests that the interface allows for flexible implementations
      class AsyncCompatibleStrategy implements SignatureStrategy {
        async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          return { signature: '0xasyncCompatible', signatureType: 'personal-sign' }
        }

        canHandle(_connector?: Connector): boolean {
          // Could internally use async logic but return sync result
          return true
        }

        getStrategyName() {
          return 'AsyncCompatibleStrategy'
        }
      }

      const strategy = new AsyncCompatibleStrategy()

      expect(() => strategy.canHandle()).not.toThrow()
      expect(strategy.canHandle()).toBe(true)
    })

    it('should handle strategy with empty string name', () => {
      class EmptyNameStrategy implements SignatureStrategy {
        async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          return { signature: '0xemptyName', signatureType: 'personal-sign' }
        }
        canHandle(_connector?: Connector) {
          return true
        }
        getStrategyName() {
          return ''
        }
      }

      const strategy = new EmptyNameStrategy()

      expect(strategy.getStrategyName()).toBe('')
      expect(typeof strategy.getStrategyName()).toBe('string')
    })

    it('should handle connector with minimal properties', () => {
      const minimalConnector = { id: 'minimal' } as Connector

      class MinimalConnectorStrategy implements SignatureStrategy {
        async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          return { signature: '0xminimalConnector', signatureType: 'personal-sign' }
        }

        canHandle(connector?: Connector): boolean {
          if (connector) {
            expect(connector).toHaveProperty('id')
            expect(connector.id).toBe('minimal')
          }
          return true
        }

        getStrategyName() {
          return 'MinimalConnectorStrategy'
        }
      }

      const strategy = new MinimalConnectorStrategy()

      expect(() => strategy.canHandle(minimalConnector)).not.toThrow()
      expect(strategy.canHandle(minimalConnector)).toBe(true)
    })
  })

  describe('Multiple Strategy Implementation', () => {
    it('should support multiple strategies with different behaviors', async () => {
      class PersonalSignStrategy implements SignatureStrategy {
        async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          return { signature: '0xpersonal', signatureType: 'personal-sign' }
        }
        canHandle(connector?: Connector) {
          return connector?.type !== 'safe'
        }
        getStrategyName() {
          return 'PersonalSignStrategy'
        }
      }

      class SafeStrategy implements SignatureStrategy {
        async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          return { signature: '0xsafe', signatureType: 'safe-wallet' }
        }
        canHandle(connector?: Connector) {
          return connector?.type === 'safe'
        }
        getStrategyName() {
          return 'SafeStrategy'
        }
      }

      const personalStrategy = new PersonalSignStrategy()
      const safeStrategy = new SafeStrategy()
      const regularConnector = { ...mockConnector, type: 'injected' } as Connector
      const safeConnector = { ...mockConnector, type: 'safe' } as Connector

      expect(personalStrategy.canHandle(regularConnector)).toBe(true)
      expect(personalStrategy.canHandle(safeConnector)).toBe(false)
      expect(safeStrategy.canHandle(regularConnector)).toBe(false)
      expect(safeStrategy.canHandle(safeConnector)).toBe(true)

      const personalResult = await personalStrategy.sign(mockRequest, mockFunctions, regularConnector)
      const safeResult = await safeStrategy.sign(mockRequest, mockFunctions, safeConnector)

      expect(personalResult.signatureType).toBe('personal-sign')
      expect(safeResult.signatureType).toBe('safe-wallet')
    })

    it('should work with array of strategies', async () => {
      const strategies: SignatureStrategy[] = [
        {
          async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector) {
            return { signature: '0x1', signatureType: 'personal-sign' as const }
          },
          canHandle(_connector?: Connector) {
            return true
          },
          getStrategyName() {
            return 'Strategy1'
          },
        },
        {
          async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector) {
            return { signature: '0x2', signatureType: 'typed-data' as const }
          },
          canHandle(_connector?: Connector) {
            return false
          },
          getStrategyName() {
            return 'Strategy2'
          },
        },
      ]

      expect(strategies).toHaveLength(2)
      expect(strategies[0].canHandle()).toBe(true)
      expect(strategies[1].canHandle()).toBe(false)

      const result = await strategies[0].sign(mockRequest, mockFunctions, mockConnector)
      expect(result.signature).toBe('0x1')
    })
  })

  describe('Integration with Real Types', () => {
    it('should work with actual SignatureRequest types', async () => {
      const realRequest: SignatureRequest = {
        message: 'Please sign this message to authenticate with SuperPool',
        nonce: 'unique-nonce-12345',
        timestamp: 1641024000000,
        walletAddress: '0x742d35Cc6634C0532925a3b8D238a5D2DD8dC5b8',
        chainId: 137,
      }

      class RealTypeStrategy implements SignatureStrategy {
        async sign(request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          expect(request.message).toContain('authenticate')
          expect(request.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
          expect(request.chainId).toBe(137)

          return {
            signature: '0xrealTypeSignature',
            signatureType: 'personal-sign',
          }
        }

        canHandle(_connector?: Connector) {
          return true
        }
        getStrategyName() {
          return 'RealTypeStrategy'
        }
      }

      const strategy = new RealTypeStrategy()

      await expect(strategy.sign(realRequest, mockFunctions)).resolves.toBeDefined()
    })

    it('should work with actual Connector types', () => {
      const realConnector: Connector = {
        id: 'io.metamask',
        name: 'MetaMask',
        type: 'injected',
        uid: 'metamask-connector-id',
      } as Connector

      class RealConnectorStrategy implements SignatureStrategy {
        async sign(_request: SignatureRequest, _functions: SignatureFunctions, _connector?: Connector): Promise<SignatureResult> {
          return { signature: '0xrealConnector', signatureType: 'personal-sign' }
        }

        canHandle(connector?: Connector): boolean {
          if (connector) {
            expect(connector.id).toBe('io.metamask')
            expect(connector.name).toBe('MetaMask')
            expect(connector.type).toBe('injected')
          }
          return connector?.type === 'injected'
        }

        getStrategyName() {
          return 'RealConnectorStrategy'
        }
      }

      const strategy = new RealConnectorStrategy()

      expect(strategy.canHandle(realConnector)).toBe(true)
      expect(strategy.canHandle()).toBe(false)
    })
  })
})

describe('SignatureConfig Interface', () => {
  describe('Required Properties', () => {
    it('should accept valid configuration with all required properties', () => {
      const config: SignatureConfig = {
        timeoutMs: 15000,
        strategy: 'RegularWalletStrategy',
      }

      expect(config.timeoutMs).toBe(15000)
      expect(config.strategy).toBe('RegularWalletStrategy')
      expect(config.retryCount).toBeUndefined()
    })

    it('should accept valid configuration with optional properties', () => {
      const config: SignatureConfig = {
        timeoutMs: 20000,
        retryCount: 3,
        strategy: 'SafeWalletStrategy',
      }

      expect(config.timeoutMs).toBe(20000)
      expect(config.retryCount).toBe(3)
      expect(config.strategy).toBe('SafeWalletStrategy')
    })

    it('should work with different timeout values', () => {
      const configs: SignatureConfig[] = [
        { timeoutMs: 5000, strategy: 'FastStrategy' },
        { timeoutMs: 30000, strategy: 'SlowStrategy' },
        { timeoutMs: 0, strategy: 'InstantStrategy' },
      ]

      configs.forEach((config, index) => {
        expect(typeof config.timeoutMs).toBe('number')
        expect(typeof config.strategy).toBe('string')
        expect(config.timeoutMs).toBe([5000, 30000, 0][index])
      })
    })
  })

  describe('Optional Properties', () => {
    it('should work without retryCount', () => {
      const config: SignatureConfig = {
        timeoutMs: 10000,
        strategy: 'NoRetryStrategy',
      }

      expect(config.retryCount).toBeUndefined()
      expect('retryCount' in config).toBe(false)
    })

    it('should accept different retry count values', () => {
      const configsWithRetry: SignatureConfig[] = [
        { timeoutMs: 5000, retryCount: 0, strategy: 'NoRetryStrategy' },
        { timeoutMs: 10000, retryCount: 1, strategy: 'SingleRetryStrategy' },
        { timeoutMs: 15000, retryCount: 5, strategy: 'MultiRetryStrategy' },
      ]

      configsWithRetry.forEach((config) => {
        expect(typeof config.retryCount).toBe('number')
        expect(config.retryCount).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('Strategy Names', () => {
    it('should accept different strategy names', () => {
      const strategies = ['RegularWalletStrategy', 'SafeWalletStrategy', 'CustomStrategy', 'TestStrategy123', '']

      strategies.forEach((strategyName) => {
        const config: SignatureConfig = {
          timeoutMs: 15000,
          strategy: strategyName,
        }

        expect(config.strategy).toBe(strategyName)
        expect(typeof config.strategy).toBe('string')
      })
    })

    it('should work with strategy names containing special characters', () => {
      const specialNames = ['Strategy-With-Dashes', 'Strategy_With_Underscores', 'Strategy With Spaces', 'Strategy@#$%Special']

      specialNames.forEach((name) => {
        const config: SignatureConfig = {
          timeoutMs: 10000,
          strategy: name,
        }

        expect(config.strategy).toBe(name)
      })
    })
  })

  describe('Configuration Arrays and Objects', () => {
    it('should work in arrays', () => {
      const configs: SignatureConfig[] = [
        { timeoutMs: 5000, strategy: 'FastStrategy' },
        { timeoutMs: 10000, retryCount: 2, strategy: 'ReliableStrategy' },
        { timeoutMs: 20000, retryCount: 0, strategy: 'SlowStrategy' },
      ]

      expect(configs).toHaveLength(3)
      configs.forEach((config) => {
        expect(typeof config.timeoutMs).toBe('number')
        expect(typeof config.strategy).toBe('string')
      })
    })

    it('should work as object values', () => {
      const configMap: Record<string, SignatureConfig> = {
        regular: { timeoutMs: 15000, strategy: 'RegularWalletStrategy' },
        safe: { timeoutMs: 20000, retryCount: 1, strategy: 'SafeWalletStrategy' },
        custom: { timeoutMs: 10000, retryCount: 3, strategy: 'CustomStrategy' },
      }

      Object.values(configMap).forEach((config) => {
        expect(config).toHaveProperty('timeoutMs')
        expect(config).toHaveProperty('strategy')
        expect(typeof config.timeoutMs).toBe('number')
        expect(typeof config.strategy).toBe('string')
      })
    })

    it('should work in nested structures', () => {
      interface StrategySettings {
        default: SignatureConfig
        fallback?: SignatureConfig
      }

      const settings: StrategySettings = {
        default: {
          timeoutMs: 15000,
          retryCount: 2,
          strategy: 'RegularWalletStrategy',
        },
        fallback: {
          timeoutMs: 30000,
          strategy: 'FallbackStrategy',
        },
      }

      expect(settings.default.timeoutMs).toBe(15000)
      expect(settings.default.retryCount).toBe(2)
      expect(settings.fallback?.timeoutMs).toBe(30000)
      expect(settings.fallback?.retryCount).toBeUndefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle extreme timeout values', () => {
      const extremeConfigs: SignatureConfig[] = [
        { timeoutMs: Number.MAX_SAFE_INTEGER, strategy: 'MaxTimeout' },
        { timeoutMs: 1, strategy: 'MinTimeout' },
        { timeoutMs: -1, strategy: 'NegativeTimeout' }, // TypeScript allows this
      ]

      extremeConfigs.forEach((config) => {
        expect(typeof config.timeoutMs).toBe('number')
        expect(config.strategy).toBeTruthy()
      })
    })

    it('should handle extreme retry values', () => {
      const extremeRetryConfigs: SignatureConfig[] = [
        { timeoutMs: 10000, retryCount: Number.MAX_SAFE_INTEGER, strategy: 'MaxRetry' },
        { timeoutMs: 10000, retryCount: -1, strategy: 'NegativeRetry' },
      ]

      extremeRetryConfigs.forEach((config) => {
        expect(typeof config.retryCount).toBe('number')
        expect(config.strategy).toBeTruthy()
      })
    })

    it('should work with configuration spreading', () => {
      const baseConfig: SignatureConfig = {
        timeoutMs: 10000,
        strategy: 'BaseStrategy',
      }

      const extendedConfig: SignatureConfig = {
        ...baseConfig,
        retryCount: 3,
        strategy: 'ExtendedStrategy',
      }

      expect(extendedConfig.timeoutMs).toBe(10000) // From base
      expect(extendedConfig.retryCount).toBe(3) // Added
      expect(extendedConfig.strategy).toBe('ExtendedStrategy') // Overridden
    })

    it('should work with partial updates', () => {
      const originalConfig: SignatureConfig = {
        timeoutMs: 15000,
        retryCount: 2,
        strategy: 'OriginalStrategy',
      }

      const partialUpdate: Partial<SignatureConfig> = {
        timeoutMs: 20000,
      }

      const updatedConfig: SignatureConfig = {
        ...originalConfig,
        ...partialUpdate,
      }

      expect(updatedConfig.timeoutMs).toBe(20000) // Updated
      expect(updatedConfig.retryCount).toBe(2) // Preserved
      expect(updatedConfig.strategy).toBe('OriginalStrategy') // Preserved
    })
  })

  describe('Type Safety Validation', () => {
    it('should maintain type safety with utility types', () => {
      type RequiredKeys = keyof Required<SignatureConfig>
      type OptionalKeys = 'retryCount'

      const requiredKeys: RequiredKeys[] = ['timeoutMs', 'retryCount', 'strategy']
      const optionalKey: OptionalKeys = 'retryCount'

      expect(requiredKeys).toContain('timeoutMs')
      expect(requiredKeys).toContain('strategy')
      expect(optionalKey).toBe('retryCount')
    })

    it('should work with Pick and Omit utility types', () => {
      type TimeoutOnly = Pick<SignatureConfig, 'timeoutMs'>
      type WithoutRetry = Omit<SignatureConfig, 'retryCount'>

      const timeoutConfig: TimeoutOnly = { timeoutMs: 5000 }
      const noRetryConfig: WithoutRetry = { timeoutMs: 10000, strategy: 'NoRetryStrategy' }

      expect(timeoutConfig.timeoutMs).toBe(5000)
      expect(noRetryConfig.strategy).toBe('NoRetryStrategy')
      expect('retryCount' in noRetryConfig).toBe(false)
    })
  })
})
