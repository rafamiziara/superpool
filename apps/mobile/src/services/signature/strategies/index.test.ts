// Test all exports from the barrel index file
import * as StrategiesIndex from './index'
import {
  SignatureStrategy,
  SignatureConfig,
  SignatureUtils,
  SafeWalletStrategy,
  RegularWalletStrategy,
  SignatureStrategyFactory,
} from './index'

// Direct imports for comparison
import { SignatureStrategy as DirectSignatureStrategy, SignatureConfig as DirectSignatureConfig } from './SignatureStrategy'
import { SignatureUtils as DirectSignatureUtils } from './SignatureUtils'
import { SafeWalletStrategy as DirectSafeWalletStrategy } from './SafeWalletStrategy'
import { RegularWalletStrategy as DirectRegularWalletStrategy } from './RegularWalletStrategy'
import { SignatureStrategyFactory as DirectSignatureStrategyFactory } from './SignatureStrategyFactory'

describe('Strategies Index Exports', () => {
  describe('Export Availability', () => {
    it('should export all expected classes and interfaces', () => {
      // Check that all exports are defined
      expect(SignatureUtils).toBeDefined()
      expect(SafeWalletStrategy).toBeDefined()
      expect(RegularWalletStrategy).toBeDefined()
      expect(SignatureStrategyFactory).toBeDefined()

      // Interfaces can't be directly tested for existence at runtime,
      // but we can test their usage in type annotations
      const testConfig: SignatureConfig = {
        timeoutMs: 15000,
        strategy: 'TestStrategy',
      }
      expect(testConfig).toBeDefined()
    })

    it('should export all items in the StrategiesIndex namespace', () => {
      const exportKeys = Object.keys(StrategiesIndex)

      // Should contain all expected exports
      expect(exportKeys).toContain('SignatureUtils')
      expect(exportKeys).toContain('SafeWalletStrategy')
      expect(exportKeys).toContain('RegularWalletStrategy')
      expect(exportKeys).toContain('SignatureStrategyFactory')

      // Should have exactly the right number of exports
      expect(exportKeys).toHaveLength(4) // Classes only (interfaces aren't in runtime namespace)
    })

    it('should have all exports as constructor functions or classes', () => {
      expect(typeof SignatureUtils).toBe('function')
      expect(typeof SafeWalletStrategy).toBe('function')
      expect(typeof RegularWalletStrategy).toBe('function')
      expect(typeof SignatureStrategyFactory).toBe('function')
    })
  })

  describe('Class Export Functionality', () => {
    describe('SignatureUtils Export', () => {
      it('should export functional SignatureUtils class', () => {
        expect(SignatureUtils).toBe(DirectSignatureUtils)
        expect(typeof SignatureUtils.withTimeout).toBe('function')
        expect(typeof SignatureUtils.validateSignatureResult).toBe('function')
        expect(typeof SignatureUtils.isSafeWalletError).toBe('function')
      })

      it('should be usable as imported from index', async () => {
        const mockPromise = Promise.resolve('0x123')
        const result = await SignatureUtils.withTimeout(mockPromise, 5000, 'Test')
        expect(result).toBe('0x123')
      })
    })

    describe('SafeWalletStrategy Export', () => {
      it('should export functional SafeWalletStrategy class', () => {
        expect(SafeWalletStrategy).toBe(DirectSafeWalletStrategy)
        expect(typeof SafeWalletStrategy).toBe('function')

        const instance = new SafeWalletStrategy()
        expect(instance).toBeInstanceOf(SafeWalletStrategy)
        expect(typeof instance.sign).toBe('function')
        expect(typeof instance.canHandle).toBe('function')
        expect(typeof instance.getStrategyName).toBe('function')
      })

      it('should be instantiable from index export', () => {
        const strategy = new SafeWalletStrategy()
        expect(strategy.getStrategyName()).toBe('SafeWalletStrategy')
      })
    })

    describe('RegularWalletStrategy Export', () => {
      it('should export functional RegularWalletStrategy class', () => {
        expect(RegularWalletStrategy).toBe(DirectRegularWalletStrategy)
        expect(typeof RegularWalletStrategy).toBe('function')

        const instance = new RegularWalletStrategy()
        expect(instance).toBeInstanceOf(RegularWalletStrategy)
        expect(typeof instance.sign).toBe('function')
        expect(typeof instance.canHandle).toBe('function')
        expect(typeof instance.getStrategyName).toBe('function')
      })

      it('should be instantiable from index export', () => {
        const strategy = new RegularWalletStrategy()
        expect(strategy.getStrategyName()).toBe('RegularWalletStrategy')
      })
    })

    describe('SignatureStrategyFactory Export', () => {
      it('should export functional SignatureStrategyFactory class', () => {
        expect(SignatureStrategyFactory).toBe(DirectSignatureStrategyFactory)
        expect(typeof SignatureStrategyFactory.getStrategy).toBe('function')
        expect(typeof SignatureStrategyFactory.getAvailableStrategies).toBe('function')
        expect(typeof SignatureStrategyFactory.isConnectorSupported).toBe('function')
      })

      it('should be usable as imported from index', () => {
        const strategies = SignatureStrategyFactory.getAvailableStrategies()
        expect(Array.isArray(strategies)).toBe(true)
        expect(strategies.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Interface Export Functionality', () => {
    describe('SignatureStrategy Interface Export', () => {
      it('should be usable as a type annotation', () => {
        // This test verifies the interface is properly exported by using it
        class TestStrategy implements SignatureStrategy {
          async sign() {
            return { signature: '0xtest', signatureType: 'personal-sign' as const }
          }
          canHandle() {
            return true
          }
          getStrategyName() {
            return 'TestStrategy'
          }
        }

        const strategy: SignatureStrategy = new TestStrategy()
        expect(strategy.getStrategyName()).toBe('TestStrategy')
      })

      it('should work with arrays and generic types', () => {
        const strategies: SignatureStrategy[] = [new SafeWalletStrategy(), new RegularWalletStrategy()]

        strategies.forEach((strategy) => {
          expect(typeof strategy.getStrategyName).toBe('function')
          expect(typeof strategy.canHandle).toBe('function')
          expect(typeof strategy.sign).toBe('function')
        })
      })
    })

    describe('SignatureConfig Interface Export', () => {
      it('should be usable as a type annotation', () => {
        const config: SignatureConfig = {
          timeoutMs: 15000,
          retryCount: 3,
          strategy: 'TestStrategy',
        }

        expect(config.timeoutMs).toBe(15000)
        expect(config.retryCount).toBe(3)
        expect(config.strategy).toBe('TestStrategy')
      })

      it('should work with optional properties', () => {
        const minimalConfig: SignatureConfig = {
          timeoutMs: 10000,
          strategy: 'MinimalStrategy',
        }

        expect(minimalConfig.retryCount).toBeUndefined()
        expect(minimalConfig.timeoutMs).toBe(10000)
      })

      it('should work in function parameters', () => {
        function processConfig(config: SignatureConfig): string {
          return `${config.strategy}: ${config.timeoutMs}ms`
        }

        const result = processConfig({
          timeoutMs: 20000,
          strategy: 'ProcessedStrategy',
        })

        expect(result).toBe('ProcessedStrategy: 20000ms')
      })
    })
  })

  describe('Re-export Integrity', () => {
    it('should export identical references to original modules', () => {
      // Classes should be the exact same reference
      expect(SignatureUtils).toBe(DirectSignatureUtils)
      expect(SafeWalletStrategy).toBe(DirectSafeWalletStrategy)
      expect(RegularWalletStrategy).toBe(DirectRegularWalletStrategy)
      expect(SignatureStrategyFactory).toBe(DirectSignatureStrategyFactory)
    })

    it('should maintain prototype chains', () => {
      const safeStrategy = new SafeWalletStrategy()
      const regularStrategy = new RegularWalletStrategy()

      expect(safeStrategy).toBeInstanceOf(SafeWalletStrategy)
      expect(safeStrategy).toBeInstanceOf(DirectSafeWalletStrategy)
      expect(regularStrategy).toBeInstanceOf(RegularWalletStrategy)
      expect(regularStrategy).toBeInstanceOf(DirectRegularWalletStrategy)
    })

    it('should maintain static method references', () => {
      // Static methods should be the same reference
      expect(SignatureUtils.withTimeout).toBe(DirectSignatureUtils.withTimeout)
      expect(SignatureUtils.validateSignatureResult).toBe(DirectSignatureUtils.validateSignatureResult)
      expect(SignatureStrategyFactory.getStrategy).toBe(DirectSignatureStrategyFactory.getStrategy)
    })
  })

  describe('Import Syntax Variations', () => {
    it('should work with named imports', async () => {
      // Already tested above, but let's be explicit
      const { SignatureUtils: NamedSignatureUtils } = await import('./index')
      expect(NamedSignatureUtils).toBe(SignatureUtils)
      expect(NamedSignatureUtils).toBe(DirectSignatureUtils)
    })

    it('should work with namespace import', async () => {
      const Strategies = await import('./index')

      expect(Strategies.SignatureUtils).toBe(SignatureUtils)
      expect(Strategies.SafeWalletStrategy).toBe(SafeWalletStrategy)
      expect(Strategies.RegularWalletStrategy).toBe(RegularWalletStrategy)
      expect(Strategies.SignatureStrategyFactory).toBe(SignatureStrategyFactory)
    })

    it('should work with destructured imports', () => {
      const {
        SignatureUtils: Utils,
        SafeWalletStrategy: SafeStrategy,
        RegularWalletStrategy: RegularStrategy,
        SignatureStrategyFactory: Factory,
      } = StrategiesIndex

      expect(Utils).toBe(SignatureUtils)
      expect(SafeStrategy).toBe(SafeWalletStrategy)
      expect(RegularStrategy).toBe(RegularWalletStrategy)
      expect(Factory).toBe(SignatureStrategyFactory)
    })
  })

  describe('Cross-Module Integration', () => {
    it('should allow classes to work together through index exports', () => {
      // Use factory to get strategy instances
      const strategy = SignatureStrategyFactory.getStrategy()

      expect(strategy).toBeInstanceOf(RegularWalletStrategy)
      expect(strategy.getStrategyName()).toBe('RegularWalletStrategy')
    })

    it('should allow mixed usage of direct and index imports', () => {
      // Create instance using index export
      const indexStrategy = new SafeWalletStrategy()
      // Create instance using direct import
      const directStrategy = new DirectSafeWalletStrategy()

      // Both should have same behavior
      expect(indexStrategy.getStrategyName()).toBe(directStrategy.getStrategyName())
      expect(indexStrategy.canHandle()).toBe(directStrategy.canHandle())
    })

    it('should work with factory using other exported classes', () => {
      const availableStrategies = SignatureStrategyFactory.getAvailableStrategies()

      // Should contain names from both strategy classes
      expect(availableStrategies).toContain('SafeWalletStrategy')
      expect(availableStrategies).toContain('RegularWalletStrategy')
      expect(availableStrategies).toHaveLength(2)
    })
  })

  describe('Type System Integration', () => {
    it('should allow interface implementation using exported types', () => {
      class CustomStrategy implements SignatureStrategy {
        async sign() {
          return {
            signature: '0xcustom',
            signatureType: 'personal-sign' as const,
          }
        }
        canHandle() {
          return true
        }
        getStrategyName() {
          return 'CustomStrategy'
        }
      }

      const strategy: SignatureStrategy = new CustomStrategy()
      expect(strategy.getStrategyName()).toBe('CustomStrategy')
    })

    it('should work with generic constraints', () => {
      function createConfig<T extends string>(strategy: T): SignatureConfig {
        return {
          timeoutMs: 15000,
          strategy,
        }
      }

      const config = createConfig('GenericStrategy')
      expect(config.strategy).toBe('GenericStrategy')
      expect(config.timeoutMs).toBe(15000)
    })

    it('should work with union types', () => {
      type StrategyClass = typeof SafeWalletStrategy | typeof RegularWalletStrategy

      function createStrategy(StrategyClass: StrategyClass): SignatureStrategy {
        return new StrategyClass()
      }

      const safeStrategy = createStrategy(SafeWalletStrategy)
      const regularStrategy = createStrategy(RegularWalletStrategy)

      expect(safeStrategy.getStrategyName()).toBe('SafeWalletStrategy')
      expect(regularStrategy.getStrategyName()).toBe('RegularWalletStrategy')
    })
  })

  describe('Module Boundaries and Isolation', () => {
    it('should not expose internal implementation details', () => {
      const exportedKeys = Object.keys(StrategiesIndex)

      // Should only export public classes, not internal helpers
      expect(exportedKeys).not.toContain('_internal')
      expect(exportedKeys).not.toContain('private')
      expect(exportedKeys).not.toContain('helper')

      // Should only contain the expected public exports
      const expectedExports = ['SignatureUtils', 'SafeWalletStrategy', 'RegularWalletStrategy', 'SignatureStrategyFactory']

      expectedExports.forEach((exportName) => {
        expect(exportedKeys).toContain(exportName)
      })
    })

    it('should maintain module encapsulation', () => {
      // Each class should be independent and not expose others' internals
      const utils = new SignatureUtils()
      const safeStrategy = new SafeWalletStrategy()
      const regularStrategy = new RegularWalletStrategy()

      // Should not have cross-dependencies in their public APIs
      expect(Object.getOwnPropertyNames(utils)).not.toContain('SafeWalletStrategy')
      expect(Object.getOwnPropertyNames(safeStrategy)).not.toContain('SignatureUtils')
      expect(Object.getOwnPropertyNames(regularStrategy)).not.toContain('SignatureStrategyFactory')
    })
  })

  describe('Runtime Behavior Consistency', () => {
    it('should behave identically whether imported directly or from index', async () => {
      // Test SignatureUtils behavior
      const indexPromise = Promise.resolve('0xtestIndex')
      const directPromise = Promise.resolve('0xtestDirect')

      const indexResult = await SignatureUtils.withTimeout(indexPromise, 5000, 'Index Test')
      const directResult = await DirectSignatureUtils.withTimeout(directPromise, 5000, 'Direct Test')

      expect(indexResult).toBe('0xtestIndex')
      expect(directResult).toBe('0xtestDirect')
    })

    it('should maintain consistent factory behavior', () => {
      const indexStrategies = SignatureStrategyFactory.getAvailableStrategies()
      const directStrategies = DirectSignatureStrategyFactory.getAvailableStrategies()

      expect(indexStrategies).toEqual(directStrategies)
      expect(indexStrategies).toHaveLength(directStrategies.length)
    })

    it('should create equivalent instances', () => {
      const indexSafe = new SafeWalletStrategy()
      const directSafe = new DirectSafeWalletStrategy()
      const indexRegular = new RegularWalletStrategy()
      const directRegular = new DirectRegularWalletStrategy()

      // Should have identical method results
      expect(indexSafe.getStrategyName()).toBe(directSafe.getStrategyName())
      expect(indexRegular.getStrategyName()).toBe(directRegular.getStrategyName())
      expect(indexSafe.canHandle()).toBe(directSafe.canHandle())
      expect(indexRegular.canHandle()).toBe(directRegular.canHandle())
    })
  })

  describe('Documentation and Maintainability', () => {
    it('should provide clear export structure', () => {
      // The index should act as a clear API surface
      const exports = Object.keys(StrategiesIndex).sort()

      // Should be in alphabetical order for predictability
      const expectedOrder = ['RegularWalletStrategy', 'SafeWalletStrategy', 'SignatureStrategyFactory', 'SignatureUtils']

      expect(exports).toEqual(expectedOrder)
    })

    it('should support tree-shaking friendly imports', () => {
      // Named imports should work for tree-shaking
      expect(() => {
        const { SignatureUtils: TreeShakeUtils } = StrategiesIndex
        return TreeShakeUtils.validateSignatureResult('0xtest')
      }).not.toThrow()
    })
  })

  describe('Error Handling and Edge Cases', () => {
    it('should handle circular dependency scenarios gracefully', () => {
      // Test that factory can use strategies that it exports
      const strategy = SignatureStrategyFactory.getStrategy()
      const factoryStrategies = SignatureStrategyFactory.getAvailableStrategies()

      expect(factoryStrategies).toContain(strategy.getStrategyName())
    })

    it('should handle dynamic imports correctly', async () => {
      const dynamicImport = await import('./index')

      expect(dynamicImport.SignatureUtils).toBe(SignatureUtils)
      expect(dynamicImport.SafeWalletStrategy).toBe(SafeWalletStrategy)
      expect(dynamicImport.RegularWalletStrategy).toBe(RegularWalletStrategy)
      expect(dynamicImport.SignatureStrategyFactory).toBe(SignatureStrategyFactory)
    })

    it('should maintain consistency across multiple import contexts', async () => {
      // Simulate different contexts importing the same module
      const context1 = await import('./index')
      const context2 = await import('./index')

      expect(context1.SignatureUtils).toBe(context2.SignatureUtils)
      expect(context1.SafeWalletStrategy).toBe(context2.SafeWalletStrategy)
      expect(context1.RegularWalletStrategy).toBe(context2.RegularWalletStrategy)
      expect(context1.SignatureStrategyFactory).toBe(context2.SignatureStrategyFactory)
    })
  })
})
