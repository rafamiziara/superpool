import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { LendingPoolABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { describeTransactionError } from './transactionErrors'

/**
 * Head-room added to the estimated gas. `claimInterest` settles one account and
 * makes one transfer, so like `withdraw` this is small — but the estimate is
 * still taken a block or more before the wallet broadcasts.
 */
const GAS_BUFFER_PERCENT = 20n

export interface ClaimInterestParams {
  poolId: number
  poolAddress: `0x${string}`
  /** Denormalised onto the pending record so a card can name the pool at startup. */
  poolName: string
}

export interface UseInterestReturn {
  /** Resolves to the transaction hash once the wallet has broadcast it. */
  claimInterest: (params: ClaimInterestParams) => Promise<`0x${string}`>
  /** True while the wallet is signing and broadcasting. */
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

/**
 * `LendingPool`'s custom errors, in the wording someone claiming should
 * see. `InsufficientLiquidity` is the one worth phrasing carefully: the interest
 * is not gone, the pool has simply lent out too much to pay it right now, and it
 * becomes claimable again as loans are repaid.
 */
const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  NothingToClaim: 'You have no interest to claim from this pool yet',
  InsufficientLiquidity: 'The pool has lent out too much to pay your interest right now — try again once a loan is repaid',
  EnforcedPause: 'This pool is not processing claims at the moment',
  TransferFailed: 'The transfer back to your wallet failed',
}

/** `describeTransactionError` bound to the claim path's wording. */
export function describeClaimInterestError(error: unknown): string {
  return describeTransactionError(error, CONTRACT_ERROR_MESSAGES, 'Failed to claim interest')
}

/**
 * Claims the interest a pool has credited to the connected wallet.
 *
 * There is no amount to pass and none to validate: `claimInterest` pays out
 * everything owed in one go, so the figure only exists once the receipt is
 * decoded. That is also why the pending record carries no amount — a card shows
 * the pool until the chain answers.
 *
 * Ungated on membership, matching the contract: interest earned while your money
 * was in the pool stays yours after you leave or are removed.
 *
 * Note the pool must be running the v3 implementation. Pools are beacon proxies
 * upgraded as a set, so this only matters against a chain whose beacon has not
 * been upgraded; the estimate below is what turns that into a message rather
 * than a signature prompt for a transaction that cannot succeed.
 */
export const useInterest = (): UseInterestReturn => {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setIsSubmitting(false)
    setError(null)
  }, [])

  const claimInterest = useCallback(
    async (params: ClaimInterestParams): Promise<`0x${string}`> => {
      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail('Connect a wallet before claiming')

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
            functionName: 'claimInterest',
            args: [],
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: LendingPoolABI,
          functionName: 'claimInterest',
          args: [],
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        // Recorded before returning so a kill straight after signing still leaves
        // the transaction recoverable at next launch.
        await pendingTransactionsStore.addPendingTransaction({
          txHash,
          chainId: activeChainId,
          type: 'CLAIM_INTEREST',
          status: 'submitted',
          timestamp: Date.now(),
          params: {
            poolId: params.poolId,
            poolAddress: params.poolAddress,
            poolName: params.poolName,
          },
        })

        setIsSubmitting(false)

        return txHash
      } catch (submitError) {
        return fail(describeClaimInterestError(submitError))
      }
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  return { claimInterest, isSubmitting, error, reset }
}
