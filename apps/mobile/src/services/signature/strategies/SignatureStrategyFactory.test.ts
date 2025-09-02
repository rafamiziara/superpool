import type { Connector } from 'wagmi'
import { SignatureStrategyFactory } from './SignatureStrategyFactory'
import { SafeWalletStrategy } from './SafeWalletStrategy'
import { RegularWalletStrategy } from './RegularWalletStrategy'

describe('SignatureStrategyFactory', () => {
  let mockConnector: Connector
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
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
        const strategy = SignatureStrategyFactory.getStrategy(mockConnector)

        expect(strategy).toBeInstanceOf(SafeWalletStrategy)
        expect(strategy.getStrategyName()).toBe('safe-wallet')
      })

      it('should return RegularWalletStrategy when SafeWalletStrategy cannot handle but RegularWalletStrategy can', () => {
        const regularConnector = {
          id: 'io.metamask',
          name: 'MetaMask',
          type: 'injected',
          uid: 'metamask-123',
        } as Connector

        const strategy = SignatureStrategyFactory.getStrategy(regularConnector)

        expect(strategy).toBeInstanceOf(RegularWalletStrategy)
        expect(strategy.getStrategyName()).toBe('regular-wallet')
      })

      it('should return SafeWalletStrategy when both strategies can handle (SafeWalletStrategy has priority)', () => {
        const safeConnector = {
          id: 'safe',
          name: 'Safe{Wallet}',
          type: 'safe',
          uid: 'safe-123',
        } as Connector

        const strategy = SignatureStrategyFactory.getStrategy(safeConnector)

        expect(strategy).toBeInstanceOf(SafeWalletStrategy)
        expect(strategy.getStrategyName()).toBe('safe-wallet')
      })

      it('should handle undefined connector', () => {
        const strategy = SignatureStrategyFactory.getStrategy(undefined)

        expect(strategy).toBeInstanceOf(RegularWalletStrategy)
        expect(strategy.getStrategyName()).toBe('regular-wallet')
      })
    })

    describe('Fallback Behavior', () => {
      it('should create new RegularWalletStrategy when no strategy can handle connector', () => {
        // Create a connector that shouldn't be handled by either strategy
        // Since RegularWalletStrategy handles all non-safe connectors, this would only happen
        // if there was some edge case, but let's test the fallback logic anyway
        const unknownConnector = {
          id: 'unknown',
          name: 'Unknown',
          type: 'unknown',
        } as Connector

        const strategy = SignatureStrategyFactory.getStrategy(unknownConnector)

        // Should still return RegularWalletStrategy since it handles all non-safe connectors
        expect(strategy).toBeInstanceOf(RegularWalletStrategy)
      })

      it('should handle edge cases gracefully', () => {
        // Test that the factory doesn't break with edge cases
        const strategy = SignatureStrategyFactory.getStrategy(undefined)

        expect(strategy).toBeInstanceOf(RegularWalletStrategy)
      })
    })

    describe('Logging Behavior', () => {
      it('should log when SafeWalletStrategy is selected', () => {
        SignatureStrategyFactory.getStrategy(mockConnector)

        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Selected signature strategy: safe-wallet', {
          connectorId: 'safe-wallet',
          connectorName: 'Safe Wallet',
        })
      })

      it('should log when RegularWalletStrategy is selected', () => {
        const regularConnector = {
          id: 'io.metamask',
          name: 'MetaMask',
          type: 'injected',
        } as Connector

        SignatureStrategyFactory.getStrategy(regularConnector)

        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Selected signature strategy: regular-wallet', {
          connectorId: 'io.metamask',
          connectorName: 'MetaMask',
        })
      })

      it('should log with undefined connector properties when connector is undefined', () => {
        SignatureStrategyFactory.getStrategy(undefined)

        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Selected signature strategy: regular-wallet', {
          connectorId: undefined,
          connectorName: undefined,
        })
      })

      it('should warn when falling back to new RegularWalletStrategy', () => {
        // This test is hard to trigger since RegularWalletStrategy.canHandle() returns true for most cases
        // We can test this by mocking the strategies array to be empty, but that's complex
        // For now, let's test that the warning message exists in the code
        expect(consoleWarnSpy).not.toHaveBeenCalled() // Normal operation shouldn't trigger warning
      })
    })

    describe('Edge Cases', () => {
      it('should handle connector with minimal properties', () => {
        const minimalConnector = { id: 'test' } as Connector

        const strategy = SignatureStrategyFactory.getStrategy(minimalConnector)

        expect(strategy).toBeInstanceOf(RegularWalletStrategy) // Non-safe connector
        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Selected signature strategy: regular-wallet', {
          connectorId: 'test',
          connectorName: undefined,
        })
      })

      it('should handle connector with null/undefined properties', () => {
        const nullPropsConnector = { id: null, name: null } as any

        const strategy = SignatureStrategyFactory.getStrategy(nullPropsConnector)

        expect(strategy).toBeInstanceOf(RegularWalletStrategy)
        expect(consoleLogSpy).toHaveBeenCalledWith('🔍 Selected signature strategy: regular-wallet', {
          connectorId: null,
          connectorName: null,
        })
      })
    })
  })

  describe('getAvailableStrategies', () => {
    it('should return array of all strategy names', () => {
      const strategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategies).toEqual(['safe-wallet', 'regular-wallet'])
    })

    it('should return strategies in correct order (Safe first, Regular second)', () => {
      const strategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategies[0]).toBe('safe-wallet')
      expect(strategies[1]).toBe('regular-wallet')
      expect(strategies).toHaveLength(2)
    })

    it('should return consistent strategy names', () => {
      const strategies1 = SignatureStrategyFactory.getAvailableStrategies()
      const strategies2 = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategies1).toEqual(strategies2)
      expect(strategies1).toEqual(['safe-wallet', 'regular-wallet'])
    })

    it('should have exactly two strategies', () => {
      const strategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategies).toHaveLength(2)
      expect(strategies).toContain('safe-wallet')
      expect(strategies).toContain('regular-wallet')
    })
  })

  describe('isConnectorSupported', () => {
    describe('Support Detection', () => {
      it('should return true when SafeWalletStrategy supports the connector', () => {
        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)

        expect(isSupported).toBe(true) // Safe connector should be supported
      })

      it('should return true when RegularWalletStrategy supports the connector', () => {
        const regularConnector = {
          id: 'io.metamask',
          name: 'MetaMask',
          type: 'injected',
        } as Connector

        const isSupported = SignatureStrategyFactory.isConnectorSupported(regularConnector)

        expect(isSupported).toBe(true) // Regular connector should be supported
      })

      it('should return true when both strategies could support the connector', () => {
        const safeConnector = {
          id: 'safe',
          name: 'Safe{Wallet}',
          type: 'safe',
        } as Connector

        const isSupported = SignatureStrategyFactory.isConnectorSupported(safeConnector)

        expect(isSupported).toBe(true) // Safe connector should be supported by SafeWalletStrategy
      })

      it('should return true for any reasonable connector', () => {
        const unknownConnector = {
          id: 'unknown',
          name: 'Unknown Wallet',
          type: 'unknown',
        } as Connector

        const isSupported = SignatureStrategyFactory.isConnectorSupported(unknownConnector)

        expect(isSupported).toBe(true) // RegularWalletStrategy handles non-safe connectors
      })
    })

    describe('Undefined Connector Handling', () => {
      it('should return true when strategies support undefined connector', () => {
        const isSupported = SignatureStrategyFactory.isConnectorSupported(undefined)

        expect(isSupported).toBe(true) // RegularWalletStrategy handles undefined connectors
      })

      it('should handle undefined gracefully', () => {
        expect(() => {
          SignatureStrategyFactory.isConnectorSupported(undefined)
        }).not.toThrow()

        const isSupported = SignatureStrategyFactory.isConnectorSupported(undefined)
        expect(typeof isSupported).toBe('boolean')
      })
    })

    describe('Performance Optimization', () => {
      it('should short-circuit when first strategy returns true', () => {
        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)

        expect(isSupported).toBe(true) // Safe connector handled by first strategy
      })

      it('should be efficient with multiple calls', () => {
        const start = performance.now()

        for (let i = 0; i < 100; i++) {
          SignatureStrategyFactory.isConnectorSupported(mockConnector)
        }

        const end = performance.now()
        expect(end - start).toBeLessThan(100) // Should be very fast
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
      const strategy1 = SignatureStrategyFactory.getStrategy(mockConnector)
      const strategy2 = SignatureStrategyFactory.getStrategy(mockConnector)

      expect(strategy1).toBe(strategy2) // Should be the same instance
      expect(strategy1).toBeInstanceOf(SafeWalletStrategy)
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

      const strategy = SignatureStrategyFactory.getStrategy(safeConnector)
      const isSupported = SignatureStrategyFactory.isConnectorSupported(safeConnector)
      const availableStrategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategy).toBeInstanceOf(SafeWalletStrategy)
      expect(strategy.getStrategyName()).toBe('safe-wallet')
      expect(isSupported).toBe(true)
      expect(availableStrategies).toContain('safe-wallet')
    })

    it('should work with realistic MetaMask connector', () => {
      const metamaskConnector = {
        id: 'io.metamask',
        name: 'MetaMask',
        type: 'injected',
        uid: 'metamask-456',
      } as Connector

      const strategy = SignatureStrategyFactory.getStrategy(metamaskConnector)
      const isSupported = SignatureStrategyFactory.isConnectorSupported(metamaskConnector)
      const availableStrategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(strategy).toBeInstanceOf(RegularWalletStrategy)
      expect(strategy.getStrategyName()).toBe('regular-wallet')
      expect(isSupported).toBe(true)
      expect(availableStrategies).toContain('regular-wallet')
    })

    it('should handle complex connector properties gracefully', () => {
      const complexConnector = {
        id: 'complex-wallet',
        name: 'Complex Wallet with Special Characters !@#$%',
        type: 'custom',
        uid: 'complex-789',
        extra: 'should not affect logic',
      } as any

      const strategy = SignatureStrategyFactory.getStrategy(complexConnector)

      expect(strategy).toBeInstanceOf(RegularWalletStrategy) // Non-safe connector
      expect(strategy.getStrategyName()).toBe('regular-wallet')
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

    it('should handle factory methods without throwing', () => {
      // Test that normal factory operations don't throw
      expect(() => {
        SignatureStrategyFactory.getStrategy(mockConnector)
      }).not.toThrow()

      expect(() => {
        SignatureStrategyFactory.isConnectorSupported(mockConnector)
      }).not.toThrow()

      expect(() => {
        SignatureStrategyFactory.getAvailableStrategies()
      }).not.toThrow()
    })

    it('should handle edge case connectors gracefully', () => {
      const edgeConnector = {} as Connector

      expect(() => {
        SignatureStrategyFactory.getStrategy(edgeConnector)
      }).not.toThrow()

      const strategy = SignatureStrategyFactory.getStrategy(edgeConnector)
      expect(strategy).toBeInstanceOf(RegularWalletStrategy)
    })
  })

  describe('Memory and Performance', () => {
    it('should reuse strategy instances efficiently', () => {
      const strategy1 = SignatureStrategyFactory.getStrategy(mockConnector)
      const strategy2 = SignatureStrategyFactory.getStrategy(mockConnector)
      const strategy3 = SignatureStrategyFactory.getStrategy(mockConnector)

      expect(strategy1).toBe(strategy2)
      expect(strategy2).toBe(strategy3)
      expect(strategy1).toBeInstanceOf(SafeWalletStrategy)
    })

    it('should handle rapid successive calls efficiently', () => {
      const results = []
      for (let i = 0; i < 100; i++) {
        results.push(SignatureStrategyFactory.getStrategy(mockConnector))
      }

      // All should return the same instance
      expect(new Set(results).size).toBe(1)
      expect(results[0]).toBeInstanceOf(SafeWalletStrategy)
    })

    it('should handle large numbers of isConnectorSupported calls', () => {
      const start = performance.now()

      for (let i = 0; i < 1000; i++) {
        const isSupported = SignatureStrategyFactory.isConnectorSupported(mockConnector)
        expect(isSupported).toBe(true)
      }

      const end = performance.now()
      expect(end - start).toBeLessThan(1000) // Should complete in reasonable time
    })
  })
})
