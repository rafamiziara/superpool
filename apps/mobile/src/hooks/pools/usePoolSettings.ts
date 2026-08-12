import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { SampleLendingPoolABI } from '../../constants/abis'
import { describeTransactionError } from './transactionErrors'

/**
 * Head-room added to the estimated gas. This writes a single packed bool, so the
 * estimate is as small and stable as it gets — but it is still taken a block or
 * more before the wallet broadcasts.
 */
const GAS_BUFFER_PERCENT = 20n

/** How long to watch the transaction before giving up on a verdict. */
const RECEIPT_TIMEOUT_MS = 120_000

export interface SetRequiresApprovalParams {
  poolAddress: `0x${string}`
  /** The value to write. The caller passes the target state, not a toggle. */
  requiresApproval: boolean
}

export interface SetRequiresMembershipParams {
  poolAddress: `0x${string}`
  /** The value to write. The caller passes the target state, not a toggle. */
  requiresMembership: boolean
}

export interface UsePoolSettingsReturn {
  /** Resolves once the change is confirmed on chain. */
  setRequiresApproval: (params: SetRequiresApprovalParams) => Promise<`0x${string}`>
  /** Opens or closes membership. Resolves once the change is confirmed on chain. */
  setRequiresMembership: (params: SetRequiresMembershipParams) => Promise<`0x${string}`>
  /** True from the signature prompt until the receipt lands. */
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

/**
 * The pool's own errors, in the wording an owner should see.
 *
 * `setRequiresApproval` has no `whenNotPaused`, so a paused pool can still have
 * its review policy changed and `EnforcedPause` is deliberately absent.
 */
const SETTINGS_ERROR_MESSAGES: Record<string, string> = {
  OwnableUnauthorizedAccount: 'Only the pool owner can change this',
}

export function describePoolSettingsError(error: unknown): string {
  return describeTransactionError(error, SETTINGS_ERROR_MESSAGES, 'Failed to update the pool')
}

/**
 * Owner-only pool settings, sent from the owner's own wallet.
 *
 * Deliberately outside the `PendingTransactionsStore` machinery that every other
 * write goes through, and the reason is worth stating: that machinery exists so
 * a transaction the backend has not seen yet still shows up, survives an app
 * kill and gets indexed afterwards. None of that applies here. Nothing indexes
 * `ApprovalRequirementChanged` — the pool document does not carry
 * `requiresApproval` at all — and every screen that cares reads the flag from
 * the chain on render. There is nothing to recover, because the chain is the
 * only record either way.
 *
 * So the hook waits for its own receipt rather than handing off to
 * `useTransactionMonitoring`, which is built to decode a result log and hand the
 * transaction to an indexer. Here there is no result to decode and no indexer to
 * hand it to.
 */
export const usePoolSettings = (): UsePoolSettingsReturn => {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setIsSubmitting(false)
    setError(null)
  }, [])

  /**
   * Both settings are one owner-only boolean write, so they share everything
   * below the function name — estimate, send, wait, and the reasoning about why
   * the receipt is waited on.
   */
  const setFlag = useCallback(
    async (
      poolAddress: `0x${string}`,
      functionName: 'setRequiresApproval' | 'setRequiresMembership',
      value: boolean
    ): Promise<`0x${string}`> => {
      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail('Connect a wallet before changing this')

      setError(null)
      setIsSubmitting(true)

      let txHash: `0x${string}`

      try {
        // The estimate is what turns "you are not the owner" into a message
        // rather than a signature prompt for a transaction that reverts.
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: poolAddress,
            abi: SampleLendingPoolABI,
            functionName,
            args: [value],
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        txHash = await writeContractAsync({
          address: poolAddress,
          abi: SampleLendingPoolABI,
          functionName,
          args: [value],
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })
      } catch (submitError) {
        return fail(describePoolSettingsError(submitError))
      }

      // Waited on rather than reported optimistically: the screens that route
      // borrowing read this flag from the chain, so telling the owner it is done
      // before the chain agrees would leave the app contradicting itself.
      try {
        if (publicClient) {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: RECEIPT_TIMEOUT_MS })

          if (receipt.status !== 'success') return fail('The network rejected the change')
        }
      } catch (waitError) {
        return fail(describePoolSettingsError(waitError))
      }

      setIsSubmitting(false)

      return txHash
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  const setRequiresApproval = useCallback(
    (params: SetRequiresApprovalParams): Promise<`0x${string}`> =>
      setFlag(params.poolAddress, 'setRequiresApproval', params.requiresApproval),
    [setFlag]
  )

  const setRequiresMembership = useCallback(
    (params: SetRequiresMembershipParams): Promise<`0x${string}`> =>
      setFlag(params.poolAddress, 'setRequiresMembership', params.requiresMembership),
    [setFlag]
  )

  return { setRequiresApproval, setRequiresMembership, isSubmitting, error, reset }
}
