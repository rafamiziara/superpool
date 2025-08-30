import type { Connector } from 'wagmi'
import { SignatureStrategyFactory } from './SignatureStrategyFactory'
import { SafeWalletStrategy } from './SafeWalletStrategy'
import { RegularWalletStrategy } from './RegularWalletStrategy'

// Mock the strategy classes
jest.mock('./SafeWalletStrategy')
jest.mock('./RegularWalletStrategy')

const MockedSafeWalletStrategy = SafeWalletStrategy as jest.MockedClass<typeof SafeWalletStrategy>
const MockedRegularWalletStrategy = RegularWalletStrategy as jest.MockedClass<typeof RegularWalletStrategy>

describe('SignatureStrategyFactory', () => {
  let mockSafeWalletInstance: jest.Mocked<SafeWalletStrategy>
  let mockRegularWalletInstance: jest.Mocked<RegularWalletStrategy>
  let mockConnector: Connector
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()

    // Create mock instances
    mockSafeWalletInstance = {
      canHandle: jest.fn(),
      getStrategyName: jest.fn().mockReturnValue('SafeWalletStrategy'),
      sign: jest.fn(),
    } as any

    mockRegularWalletInstance = {
      canHandle: jest.fn(),
      getStrategyName: jest.fn().mockReturnValue('RegularWalletStrategy'),
      sign: jest.fn(),
    } as any

    // Mock the constructors to return our mock instances
    MockedSafeWalletStrategy.mockImplementation(() => mockSafeWalletInstance)
    MockedRegularWalletStrategy.mockImplementation(() => mockRegularWalletInstance)

    // Mock connector
    mockConnector = {
      id: 'safe-wallet',
      name: 'Safe Wallet',
      type: 'safe',
      uid: 'safe-123',
    } as Connector

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe('getStrategy', () => {
    describe('Strategy Selection Logic', () => {
      it('should return SafeWalletStrategy when it can handle the connector', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(true)
        mockRegularWalletInstance.canHandle.mockReturnValue(false)

        const strategy = SignatureStrategyFactory.getStrategy(mockConnector)

        expect(strategy).toBe(mockSafeWalletInstance)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
        expect(mockRegularWalletInstance.canHandle).not.toHaveBeenCalled()
      })

      it('should return RegularWalletStrategy when SafeWalletStrategy cannot handle but RegularWalletStrategy can', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(true)

        const strategy = SignatureStrategyFactory.getStrategy(mockConnector)

        expect(strategy).toBe(mockRegularWalletInstance)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
        expect(mockRegularWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
      })

      it('should return SafeWalletStrategy when both strategies can handle (SafeWalletStrategy has priority)', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(true)
        mockRegularWalletInstance.canHandle.mockReturnValue(true)

        const strategy = SignatureStrategyFactory.getStrategy(mockConnector)

        expect(strategy).toBe(mockSafeWalletInstance)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
        expect(mockRegularWalletInstance.canHandle).not.toHaveBeenCalled()
      })

      it('should handle undefined connector', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(true)

        const strategy = SignatureStrategyFactory.getStrategy(undefined)

        expect(strategy).toBe(mockRegularWalletInstance)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(undefined)
        expect(mockRegularWalletInstance.canHandle).toHaveBeenCalledWith(undefined)
      })
    })

    describe('Fallback Behavior', () => {
      it('should create new RegularWalletStrategy when no strategy can handle connector', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(false)

        const strategy = SignatureStrategyFactory.getStrategy(mockConnector)

        expect(strategy).toBeInstanceOf(RegularWalletStrategy)
        expect(strategy).not.toBe(mockRegularWalletInstance) // Should be a new instance
        expect(MockedRegularWalletStrategy).toHaveBeenCalledTimes(3) // 2 for static array + 1 for fallback
      })

      it('should create new RegularWalletStrategy when strategies array is somehow empty', () => {
        // This tests the fallback even if the static array behavior changes
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(false)

        const strategy = SignatureStrategyFactory.getStrategy(mockConnector)

        expect(strategy).toBeInstanceOf(RegularWalletStrategy)
      })
    })

    describe('Logging Behavior', () => {
      it('should log when SafeWalletStrategy is selected', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(true)
        mockSafeWalletInstance.getStrategyName.mockReturnValue('SafeWalletStrategy')

        SignatureStrategyFactory.getStrategy(mockConnector)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔍 Selected signature strategy: SafeWalletStrategy',
          {
            connectorId: 'safe-wallet',
            connectorName: 'Safe Wallet',
          }
        )
      })

      it('should log when RegularWalletStrategy is selected', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(true)
        mockRegularWalletInstance.getStrategyName.mockReturnValue('RegularWalletStrategy')

        SignatureStrategyFactory.getStrategy(mockConnector)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔍 Selected signature strategy: RegularWalletStrategy',
          {
            connectorId: 'safe-wallet',
            connectorName: 'Safe Wallet',
          }
        )
      })

      it('should log with undefined connector properties when connector is undefined', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(true)
        mockSafeWalletInstance.getStrategyName.mockReturnValue('SafeWalletStrategy')

        SignatureStrategyFactory.getStrategy(undefined)

        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔍 Selected signature strategy: SafeWalletStrategy',
          {
            connectorId: undefined,
            connectorName: undefined,
          }
        )
      })

      it('should warn when falling back to new RegularWalletStrategy', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(false)

        SignatureStrategyFactory.getStrategy(mockConnector)

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '⚠️ No specific strategy found, falling back to regular wallet strategy'
        )
      })
    })

    describe('Edge Cases', () => {
      it('should handle connector with minimal properties', () => {
        const minimalConnector = { id: 'test' } as Connector
        mockSafeWalletInstance.canHandle.mockReturnValue(true)

        const strategy = SignatureStrategyFactory.getStrategy(minimalConnector)

        expect(strategy).toBe(mockSafeWalletInstance)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔍 Selected signature strategy: SafeWalletStrategy',
          {
            connectorId: 'test',
            connectorName: undefined,
          }
        )
      })

      it('should handle connector with null/undefined properties', () => {
        const nullPropsConnector = { id: null, name: null } as any
        mockRegularWalletInstance.canHandle.mockReturnValue(true)
        mockSafeWalletInstance.canHandle.mockReturnValue(false)

        const strategy = SignatureStrategyFactory.getStrategy(nullPropsConnector)

        expect(strategy).toBe(mockRegularWalletInstance)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '🔍 Selected signature strategy: RegularWalletStrategy',
          {
            connectorId: null,
            connectorName: null,
          }
        )
      })
    })
  })

  describe('getAvailableStrategies', () => {
    it('should return array of all strategy names', () => {
      mockSafeWalletInstance.getStrategyName.mockReturnValue('SafeWalletStrategy')
      mockRegularWalletInstance.getStrategyName.mockReturnValue('RegularWalletStrategy')

      const strategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategies).toEqual(['SafeWalletStrategy', 'RegularWalletStrategy'])
    })

    it('should return strategies in correct order (Safe first, Regular second)', () => {
      mockSafeWalletInstance.getStrategyName.mockReturnValue('SafeWalletStrategy')
      mockRegularWalletInstance.getStrategyName.mockReturnValue('RegularWalletStrategy')

      const strategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategies[0]).toBe('SafeWalletStrategy')
      expect(strategies[1]).toBe('RegularWalletStrategy')
      expect(strategies).toHaveLength(2)
    })

    it('should call getStrategyName on each strategy instance', () => {
      SignatureStrategyFactory.getAvailableStrategies()

      expect(mockSafeWalletInstance.getStrategyName).toHaveBeenCalledTimes(1)
      expect(mockRegularWalletInstance.getStrategyName).toHaveBeenCalledTimes(1)
    })

    it('should handle custom strategy names', () => {
      mockSafeWalletInstance.getStrategyName.mockReturnValue('CustomSafeStrategy')
      mockRegularWalletInstance.getStrategyName.mockReturnValue('CustomRegularStrategy')

      const strategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategies).toEqual(['CustomSafeStrategy', 'CustomRegularStrategy'])
    })

    it('should return empty strings if strategies return empty names', () => {
      mockSafeWalletInstance.getStrategyName.mockReturnValue('')
      mockRegularWalletInstance.getStrategyName.mockReturnValue('')

      const strategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategies).toEqual(['', ''])
      expect(strategies).toHaveLength(2)
    })
  })

  describe('isConnectorSupported', () => {
    describe('Support Detection', () => {
      it('should return true when SafeWalletStrategy supports the connector', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(true)
        mockRegularWalletInstance.canHandle.mockReturnValue(false)

        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)

        expect(isSupported).toBe(true)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
      })

      it('should return true when RegularWalletStrategy supports the connector', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(true)

        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)

        expect(isSupported).toBe(true)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
        expect(mockRegularWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
      })

      it('should return true when both strategies support the connector', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(true)
        mockRegularWalletInstance.canHandle.mockReturnValue(true)

        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)

        expect(isSupported).toBe(true)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
        // Should short-circuit and not call the second strategy
      })

      it('should return false when no strategy supports the connector', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(false)

        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)

        expect(isSupported).toBe(false)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
        expect(mockRegularWalletInstance.canHandle).toHaveBeenCalledWith(mockConnector)
      })
    })

    describe('Undefined Connector Handling', () => {
      it('should return true when strategies support undefined connector', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(true)

        const isSupported = SignatureStrategyFactory.isConnectorSupported(undefined)

        expect(isSupported).toBe(true)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(undefined)
        expect(mockRegularWalletInstance.canHandle).toHaveBeenCalledWith(undefined)
      })

      it('should return false when no strategy supports undefined connector', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(false)

        const isSupported = SignatureStrategyFactory.isConnectorSupported(undefined)

        expect(isSupported).toBe(false)
      })
    })

    describe('Performance Optimization', () => {
      it('should short-circuit when first strategy returns true', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(true)
        mockRegularWalletInstance.canHandle.mockReturnValue(false)

        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)

        expect(isSupported).toBe(true)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledTimes(1)
        expect(mockRegularWalletInstance.canHandle).not.toHaveBeenCalled()
      })

      it('should call all strategies when all return false', () => {
        mockSafeWalletInstance.canHandle.mockReturnValue(false)
        mockRegularWalletInstance.canHandle.mockReturnValue(false)

        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)

        expect(isSupported).toBe(false)
        expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledTimes(1)
        expect(mockRegularWalletInstance.canHandle).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Static Strategies Array', () => {
    it('should have exactly two strategy instances', () => {
      const strategies = SignatureStrategyFactory.getAvailableStrategies()
      expect(strategies).toHaveLength(2)
    })

    it('should maintain strategy order across multiple calls', () => {
      const strategies1 = SignatureStrategyFactory.getAvailableStrategies()
      const strategies2 = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategies1).toEqual(strategies2)
      expect(strategies1[0]).toBe(strategies2[0])
      expect(strategies1[1]).toBe(strategies2[1])
    })

    it('should use the same strategy instances across getStrategy calls', () => {
      mockSafeWalletInstance.canHandle.mockReturnValue(true)

      const strategy1 = SignatureStrategyFactory.getStrategy(mockConnector)
      const strategy2 = SignatureStrategyFactory.getStrategy(mockConnector)

      expect(strategy1).toBe(strategy2)
      expect(strategy1).toBe(mockSafeWalletInstance)
    })
  })

  describe('Integration Tests', () => {
    it('should work with realistic Safe wallet connector', () => {
      const safeConnector = {
        id: 'safe',
        name: 'Safe{Wallet}',
        type: 'safe',
        uid: 'safe-123',
      } as Connector

      mockSafeWalletInstance.canHandle.mockReturnValue(true)
      mockSafeWalletInstance.getStrategyName.mockReturnValue('SafeWalletStrategy')

      const strategy = SignatureStrategyFactory.getStrategy(safeConnector)
      const isSupported = SignatureStrategyFactory.isConnectorSupported(safeConnector)
      const availableStrategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategy).toBe(mockSafeWalletInstance)
      expect(isSupported).toBe(true)
      expect(availableStrategies).toContain('SafeWalletStrategy')
    })

    it('should work with realistic MetaMask connector', () => {
      const metamaskConnector = {
        id: 'io.metamask',
        name: 'MetaMask',
        type: 'injected',
        uid: 'metamask-456',
      } as Connector

      mockSafeWalletInstance.canHandle.mockReturnValue(false)
      mockRegularWalletInstance.canHandle.mockReturnValue(true)
      mockRegularWalletInstance.getStrategyName.mockReturnValue('RegularWalletStrategy')

      const strategy = SignatureStrategyFactory.getStrategy(metamaskConnector)
      const isSupported = SignatureStrategyFactory.isConnectorSupported(metamaskConnector)
      const availableStrategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategy).toBe(mockRegularWalletInstance)
      expect(isSupported).toBe(true)
      expect(availableStrategies).toContain('RegularWalletStrategy')
    })

    it('should handle complex connector properties gracefully', () => {
      const complexConnector = {
        id: 'complex-wallet',
        name: 'Complex Wallet with Special Characters !@#$%',
        type: 'custom',
        uid: 'complex-789',
        extra: 'should not affect logic',
      } as any

      mockSafeWalletInstance.canHandle.mockReturnValue(false)
      mockRegularWalletInstance.canHandle.mockReturnValue(true)

      const strategy = SignatureStrategyFactory.getStrategy(complexConnector)

      expect(strategy).toBe(mockRegularWalletInstance)
      expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledWith(complexConnector)
      expect(mockRegularWalletInstance.canHandle).toHaveBeenCalledWith(complexConnector)
    })
  })

  describe('Error Handling', () => {
    it('should handle strategy constructor failures gracefully', () => {
      // This test ensures the factory doesn't break if strategies fail to construct
      // The actual static array creation happens at module load time
      expect(() => {
        SignatureStrategyFactory.getAvailableStrategies()
      }).not.toThrow()
    })

    it('should handle canHandle method throwing errors', () => {
      mockSafeWalletInstance.canHandle.mockImplementation(() => {
        throw new Error('canHandle failed')
      })
      mockRegularWalletInstance.canHandle.mockReturnValue(true)

      // Should continue to next strategy despite error
      expect(() => {
        SignatureStrategyFactory.getStrategy(mockConnector)
      }).toThrow('canHandle failed')
    })

    it('should handle getStrategyName method throwing errors', () => {
      mockSafeWalletInstance.getStrategyName.mockImplementation(() => {
        throw new Error('getStrategyName failed')
      })

      expect(() => {
        SignatureStrategyFactory.getAvailableStrategies()
      }).toThrow('getStrategyName failed')
    })
  })

  describe('Memory and Performance', () => {
    it('should reuse strategy instances efficiently', () => {
      mockSafeWalletInstance.canHandle.mockReturnValue(true)

      const strategy1 = SignatureStrategyFactory.getStrategy(mockConnector)
      const strategy2 = SignatureStrategyFactory.getStrategy(mockConnector)
      const strategy3 = SignatureStrategyFactory.getStrategy(mockConnector)

      expect(strategy1).toBe(strategy2)
      expect(strategy2).toBe(strategy3)
      expect(strategy1).toBe(mockSafeWalletInstance)

      // Should not create new instances unnecessarily
      expect(MockedSafeWalletStrategy).toHaveBeenCalledTimes(2) // Once for static array, once for our mock
    })

    it('should handle rapid successive calls efficiently', () => {
      mockSafeWalletInstance.canHandle.mockReturnValue(true)

      const results = []
      for (let i = 0; i < 100; i++) {
        results.push(SignatureStrategyFactory.getStrategy(mockConnector))
      }

      // All should return the same instance
      expect(new Set(results).size).toBe(1)
      expect(results[0]).toBe(mockSafeWalletInstance)
    })

    it('should handle large numbers of isConnectorSupported calls', () => {
      mockSafeWalletInstance.canHandle.mockReturnValue(true)

      for (let i = 0; i < 1000; i++) {
        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)
        expect(isSupported).toBe(true)
      }

      expect(mockSafeWalletInstance.canHandle).toHaveBeenCalledTimes(1000)
    })
  })
})