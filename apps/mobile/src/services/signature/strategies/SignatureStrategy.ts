import type { SignatureRequest, SignatureResult, SignatureFunctions } from '@superpool/types'
import type { Connector } from 'wagmi'

/**
 * Base interface for signature strategies
 * Defines the contract for different wallet signing approaches
 */
export interface SignatureStrategy {
  /**
   * Executes the signature request using the specific strategy
   */
  sign(request: SignatureRequest, functions: SignatureFunctions, connector?: Connector): Promise<SignatureResult>

  /**
   * Validates if this strategy can handle the given wallet/connector
   */
  canHandle(connector?: Connector): boolean

  /**
   * Gets the strategy name for logging purposes
   */
  getStrategyName(): string
}

/**
 * Configuration for signature execution
 */
export interface SignatureConfig {
  timeoutMs: number
  retryCount?: number
  strategy: string
}
