import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError } from 'viem'

/**
 * Turns a wallet, RPC or contract failure into something worth showing a user.
 *
 * Viem nests the cause that matters inside a `BaseError`, so `walk` is used
 * rather than an `instanceof` on the thrown value — a rejected signature arrives
 * wrapped in several layers and would otherwise read as a generic failure.
 *
 * `contractErrors` maps a contract's custom error names to copy. It is passed in
 * rather than merged into one table because the same name means different things
 * in different contracts: `EnforcedPause` on the factory means pool creation is
 * paused, and on a pool it means that pool has stopped taking deposits.
 */
export function describeTransactionError(error: unknown, contractErrors: Record<string, string>, fallback: string): string {
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError)) return 'Transaction cancelled'
    if (error.walk((cause) => cause instanceof InsufficientFundsError)) return 'Insufficient balance for gas'

    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const errorName = reverted.data?.errorName
      if (errorName && contractErrors[errorName]) return contractErrors[errorName]
      if (reverted.reason) return reverted.reason
    }

    return error.shortMessage
  }

  if (error instanceof Error) {
    // Connectors that predate Viem's error types still signal rejection by message.
    if (error.message.includes('User rejected')) return 'Transaction cancelled'

    return error.message
  }

  return fallback
}
