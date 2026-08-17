import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { LendingPoolABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { describeTransactionError } from './transactionErrors'

/**
 * Head-room added to the estimated gas. `withdraw` writes two storage slots and
 * makes one transfer, so like `depositFunds` this is small — but the estimate is
 * still taken a block or more before the wallet broadcasts.
 */
const GAS_BUFFER_PERCENT = 20n

export interface WithdrawalParams {
  poolId: number
  poolAddress: `0x${string}`
  /** Denormalised onto the pending record so a card can name the pool at startup. */
  poolName: string
  /** Wei. */
  amount: bigint
}

export interface UseWithdrawalReturn {
  /** Resolves to the transaction hash once the wallet has broadcast it. */
  withdraw: (params: WithdrawalParams) => Promise<`0x${string}`>
  /** True while the wallet is signing and broadcasting. */
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

/**
 * `LendingPool`'s custom errors, in the wording someone withdrawing
 * should see. The two "not enough" cases are genuinely different and must not
 * be collapsed: `InsufficientBalance` means you are asking for more than you
 * ever put in, `InsufficientLiquidity` means the pool has lent out too much to
 * pay you right now and the amount will be available again as loans are repaid.
 */
const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  InvalidAmount: 'Enter an amount greater than zero',
  InsufficientBalance: 'That is more than you have in this pool',
  InsufficientLiquidity: 'The pool has lent out too much to cover that right now — try a smaller amount',
  LoanOutstanding: 'Repay your loan from this pool before withdrawing',
  EnforcedPause: 'This pool is not processing withdrawals at the moment',
  TransferFailed: 'The transfer back to your wallet failed',
}

/** `describeTransactionError` bound to the withdrawal path's wording. */
export function describeWithdrawalError(error: unknown): string {
  return describeTransactionError(error, CONTRACT_ERROR_MESSAGES, 'Failed to withdraw')
}

/**
 * Mirrors the contract's own checks so an invalid amount is rejected before the
 * user is asked to sign, instead of costing them a reverted transaction.
 * Returns the message to show, or `null` when the params are valid.
 *
 * `withdrawable` is what the *chain* says is available — pass the value read
 * from `withdrawableAmount`, not one derived from indexed contributions, which
 * lags behind an earlier withdrawal.
 */
export function validateWithdrawalParams(params: WithdrawalParams, withdrawable?: bigint): string | null {
  if (params.amount <= 0n) return 'Enter an amount greater than zero'
  if (withdrawable !== undefined && params.amount > withdrawable) {
    return 'That is more than you can withdraw right now'
  }

  return null
}

/**
 * Withdraws liquidity from a pool: the user sends `withdraw` from their own
 * wallet, and the transaction is recorded for monitoring.
 *
 * Like a contribution there is no backend preparation step — the caller is
 * spending their own recorded balance, so there is nothing to authorise.
 *
 * Note the pool must be running the v2 implementation. Pools are minimal-proxy
 * clones, so one created before the implementation was updated has no
 * `withdraw` at all; the estimate below is what turns that into a message
 * rather than a signature prompt for a transaction that cannot succeed.
 *
 * Validation failures throw without setting `error`, leaving field-level
 * messages to the form; everything after that sets `error` and rethrows.
 */
export const useWithdrawal = (): UseWithdrawalReturn => {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setIsSubmitting(false)
    setError(null)
  }, [])

  const withdraw = useCallback(
    async (params: WithdrawalParams): Promise<`0x${string}`> => {
      const validationError = validateWithdrawalParams(params)
      if (validationError) throw new Error(validationError)

      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail('Connect a wallet before withdrawing')

      setError(null)
      setIsSubmitting(true)

      try {
        // Estimating first turns a doomed transaction into a message rather than
        // a signature prompt the user pays for. Skipped when no client is
        // configured for the chain, leaving the estimate to the wallet.
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: params.poolAddress,
            abi: LendingPoolABI,
            functionName: 'withdraw',
            args: [params.amount],
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: LendingPoolABI,
          functionName: 'withdraw',
          args: [params.amount],
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        // Recorded before returning so a kill straight after signing still leaves
        // the transaction recoverable at next launch.
        await pendingTransactionsStore.addPendingTransaction({
          txHash,
          chainId: activeChainId,
          type: 'WITHDRAW',
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
        return fail(describeWithdrawalError(submitError))
      }
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  return { withdraw, isSubmitting, error, reset }
}
