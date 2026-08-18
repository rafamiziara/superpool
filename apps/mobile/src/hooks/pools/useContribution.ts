import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { LendingPoolABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { type Denomination, isNative } from '../../utils/denomination'
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
  /**
   * What the pool is denominated in. Recorded on the pending transaction so its
   * card can show the amount in the right unit at startup, before any pool has
   * been fetched — the same reason `poolName` is denormalised.
   */
  denomination: Denomination
}

export interface UseContributionReturn {
  /** Resolves to the transaction hash once the wallet has broadcast it. */
  contribute: (params: ContributionParams) => Promise<`0x${string}`>
  /** True while the wallet is signing and broadcasting. */
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

/** `LendingPool`'s custom errors, in the wording a contributor should see. */
const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  InvalidAmount: 'Enter an amount greater than zero',
  EnforcedPause: 'This pool is not accepting contributions at the moment',
  NativePoolOnly: 'This pool takes the network’s own coin, not a token',
  TokenPoolOnly: 'This pool takes a token, not the network’s own coin',
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
 * Contributes liquidity to a pool, by whichever of the two entry points the
 * pool's denomination calls for, and records the transaction for monitoring.
 *
 * **Two functions, not one payable one.** A native pool takes `depositFunds`
 * with the amount as `msg.value`; a token pool takes `depositTokens(amount)`
 * and pulls it, which is why the screen has to get an approval in first. Each
 * reverts against the wrong kind of pool rather than guessing.
 *
 * They are separate *names* rather than overloads because ethers refuses to
 * resolve a bare name with two ABI entries — see ERC20_PLAN §3.1. Do not tidy
 * them back together.
 *
 * Unlike pool creation there is no backend preparation step. Depositing is open
 * to anyone — the factory's creator whitelist governs who may *create* a pool,
 * not who may fund one — so there is nothing to authorise and no gas for the
 * backend to pay.
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

      /** Head-room on an estimate, or nothing when there is no client to ask. */
      const withBuffer = (estimate: bigint) => estimate + (estimate * GAS_BUFFER_PERCENT) / 100n

      try {
        // Estimating first turns a doomed transaction into a message rather than
        // a signature prompt the user pays for. For a native deposit the `value`
        // is part of the estimate, so a wallet that cannot cover deposit *plus*
        // fee is caught here; for a token deposit it also catches a missing
        // allowance, which is the failure an abandoned approval leads to.
        // Skipped when no client is configured, leaving the estimate to the
        // wallet.
        //
        // The two branches are spelled out rather than sharing a spread call:
        // `value` and `args` are mutually exclusive in Viem's types, and a union
        // of the two is not something it will accept.
        let txHash: `0x${string}`

        if (isNative(params.denomination)) {
          const gas = publicClient
            ? withBuffer(
                await publicClient.estimateContractGas({
                  address: params.poolAddress,
                  abi: LendingPoolABI,
                  functionName: 'depositFunds',
                  value: params.amount,
                  account: address,
                })
              )
            : undefined

          txHash = await writeContractAsync({
            address: params.poolAddress,
            abi: LendingPoolABI,
            functionName: 'depositFunds',
            value: params.amount,
            chainId: activeChainId,
            ...(gas === undefined ? {} : { gas }),
          })
        } else {
          const gas = publicClient
            ? withBuffer(
                await publicClient.estimateContractGas({
                  address: params.poolAddress,
                  abi: LendingPoolABI,
                  functionName: 'depositTokens',
                  args: [params.amount],
                  account: address,
                })
              )
            : undefined

          txHash = await writeContractAsync({
            address: params.poolAddress,
            abi: LendingPoolABI,
            functionName: 'depositTokens',
            args: [params.amount],
            chainId: activeChainId,
            ...(gas === undefined ? {} : { gas }),
          })
        }

        // Recorded before returning so a kill straight after signing still leaves
        // the transaction recoverable at next launch.
        await pendingTransactionsStore.addPendingTransaction({
          txHash,
          chainId: activeChainId,
          type: 'CONTRIBUTE',
          status: 'submitted',
          timestamp: Date.now(),
          denomination: params.denomination,
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
