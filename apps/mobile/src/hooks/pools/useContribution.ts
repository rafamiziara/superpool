import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { SampleLendingPoolABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { describeTransactionError } from './transactionErrors'

/**
 * Head-room added to the estimated gas. `depositFunds` writes a fixed amount of
 * storage, so this is less load-bearing than it is for pool creation — but the
 * estimate is still taken a block or more before the wallet broadcasts.
 */
const GAS_BUFFER_PERCENT = 20n

export interface ContributionParams {
  poolId: number
  poolAddress: `0x${string}`
  /** Denormalised onto the pending record so a card can name the pool at startup. */
  poolName: string
  /** Wei. */
  amount: bigint
}

export interface UseContributionReturn {
  /** Resolves to the transaction hash once the wallet has broadcast it. */
  contribute: (params: ContributionParams) => Promise<`0x${string}`>
  /** True while the wallet is signing and broadcasting. */
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

/** `SampleLendingPool`'s custom errors, in the wording a contributor should see. */
const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  InvalidAmount: 'Enter an amount greater than zero',
  EnforcedPause: 'This pool is not accepting contributions at the moment',
}

/** `describeTransactionError` bound to the deposit path's wording. */
export function describeContributionError(error: unknown): string {
  return describeTransactionError(error, CONTRACT_ERROR_MESSAGES, 'Failed to contribute')
}

/**
 * Mirrors `depositFunds`'s own check so an invalid amount is rejected before the
 * user is asked to sign, instead of costing them a reverted transaction.
 * Returns the message to show, or `null` when the params are valid.
 */
export function validateContributionParams(params: ContributionParams): string | null {
  if (params.amount <= 0n) return 'Enter an amount greater than zero'

  return null
}

/**
 * Contributes liquidity to a pool: the user sends `depositFunds` from their own
 * wallet with the amount as `msg.value`, and the transaction is recorded for
 * monitoring.
 *
 * Unlike pool creation there is no backend preparation step. `depositFunds` is
 * open to anyone — the factory's creator whitelist governs who may *create* a
 * pool, not who may fund one — so there is nothing to authorise and no gas for
 * the backend to pay.
 *
 * Validation failures throw without setting `error`, leaving field-level
 * messages to the form; everything after that sets `error` and rethrows.
 */
export const useContribution = (): UseContributionReturn => {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setIsSubmitting(false)
    setError(null)
  }, [])

  const contribute = useCallback(
    async (params: ContributionParams): Promise<`0x${string}`> => {
      const validationError = validateContributionParams(params)
      if (validationError) throw new Error(validationError)

      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail('Connect a wallet before contributing')

      setError(null)
      setIsSubmitting(true)

      try {
        // Estimating first turns a doomed transaction into a message rather than
        // a signature prompt the user pays for. The `value` is part of the
        // estimate, so a wallet that cannot cover deposit *plus* fee is caught
        // here rather than at signing. Skipped when no client is configured for
        // the chain, leaving the estimate to the wallet.
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: params.poolAddress,
            abi: SampleLendingPoolABI,
            functionName: 'depositFunds',
            value: params.amount,
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: SampleLendingPoolABI,
          functionName: 'depositFunds',
          value: params.amount,
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        // Recorded before returning so a kill straight after signing still leaves
        // the transaction recoverable at next launch.
        await pendingTransactionsStore.addPendingTransaction({
          txHash,
          chainId: activeChainId,
          type: 'CONTRIBUTE',
          status: 'submitted',
          timestamp: Date.now(),
          params: {
            poolId: params.poolId,
            poolAddress: params.poolAddress,
            poolName: params.poolName,
            amount: params.amount.toString(),
          },
        })

        setIsSubmitting(false)

        return txHash
      } catch (submitError) {
        return fail(describeContributionError(submitError))
      }
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  return { contribute, isSubmitting, error, reset }
}
