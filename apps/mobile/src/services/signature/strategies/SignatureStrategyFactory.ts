import type { Connector } from 'wagmi'
import type { SignatureStrategy } from './SignatureStrategy'
import { SafeWalletStrategy } from './SafeWalletStrategy'
import { RegularWalletStrategy } from './RegularWalletStrategy'

/**
 * Factory for creating appropriate signature strategies
 * Centralizes strategy selection logic and provides strategy management
 */
export class SignatureStrategyFactory {
  private static readonly strategies: SignatureStrategy[] = [
    new SafeWalletStrategy(),
    new RegularWalletStrategy(),
  ]

  /**
   * Gets the appropriate signature strategy for the given connector
   */
  static getStrategy(connector?: Connector): SignatureStrategy {
    // Find the first strategy that can handle this connector
    for (const strategy of this.strategies) {
      if (strategy.canHandle(connector)) {
        console.log(`🔍 Selected signature strategy: ${strategy.getStrategyName()}`, {
          connectorId: connector?.id,
          connectorName: connector?.name,
        })
        return strategy
      }
    }

    // Fallback to regular wallet strategy (should never happen due to RegularWalletStrategy.canHandle logic)
    console.warn('⚠️ No specific strategy found, falling back to regular wallet strategy')
    return new RegularWalletStrategy()
  }

  /**
   * Gets all available strategy names (for debugging/logging)
   */
  static getAvailableStrategies(): string[] {
    return this.strategies.map(strategy => strategy.getStrategyName())
  }

  /**
   * Validates if a connector is supported by any strategy
   */
  static isConnectorSupported(connector?: Connector): boolean {
    return this.strategies.some(strategy => strategy.canHandle(connector))
  }
}