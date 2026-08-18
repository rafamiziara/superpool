import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { ERC20ABI } from '../../constants/abis'
import { describeTransactionError } from './transactionErrors'

/** Head-room on the estimate, matching the other write hooks. */
const GAS_BUFFER_PERCENT = 20n

export interface ApprovalParams {
  /** The ERC-20 being approved. */
  token: `0x${string}`
  /** The pool that will pull the tokens. */
  spender: `0x${string}`
  /** How much it may pull, in the token's smallest unit. */
  amount: bigint
}

export interface UseTokenApprovalReturn {
  /**
   * What the spender may already pull, or `undefined` where it cannot be read —
   * no wallet, no client, or a read that failed. `undefined` is not zero: a
   * caller must not conclude an approval is needed from a failed read.
   */
  readAllowance: (params: Omit<ApprovalParams, 'amount'>) => Promise<bigint | undefined>
  /** Sends the approval and waits for it to confirm. Resolves to its hash. */
  approve: (params: ApprovalParams) => Promise<`0x${string}`>
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

const APPROVAL_ERROR_MESSAGES: Record<string, string> = {}

/** `describeTransactionError` bound to the approval step's wording. */
export function describeApprovalError(error: unknown): string {
  return describeTransactionError(error, APPROVAL_ERROR_MESSAGES, 'Could not approve the token')
}

/**
 * The first half of funding a token pool: telling the token that the pool may
 * take a given amount.
 *
 * **Not a pending transaction.** `PendingTransactionsStore` records one hash per
 * user action and recovers it at startup; an approval changes nothing the app
 * displays and has no record to recover into. It is a stage in the calling
 * screen's own state machine instead — which is also why this waits for the
 * receipt rather than returning at broadcast: the deposit that follows would
 * revert against an allowance that has not landed.
 *
 * **The allowance is read first, not approved blindly.** A flow abandoned
 * between the two transactions resumes at the deposit rather than asking for a
 * second approval, which is the whole reason `readAllowance` is here.
 *
 * **Never `type(uint256).max`.** It is the convenient thing and it means a bug
 * in the pool can drain the member's whole balance. The amount is approved, plus
 * whatever head-room the caller needs for a debt that is still growing — an
 * allowance larger than what is taken costs the approver nothing, where an
 * over-payment would cost them a refund transfer.
 */
export const useTokenApproval = (): UseTokenApprovalReturn => {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setIsSubmitting(false)
    setError(null)
  }, [])

  const readAllowance = useCallback(
    async ({ token, spender }: Omit<ApprovalParams, 'amount'>): Promise<bigint | undefined> => {
      if (!address || !publicClient) return undefined

      try {
        return await publicClient.readContract({
          address: token,
          abi: ERC20ABI,
          functionName: 'allowance',
          args: [address, spender],
        })
      } catch {
        // Swallowed on purpose: an unreadable allowance is not an error the user
        // can act on, and the caller treats it as "ask for an approval", which
        // is the safe way to be wrong.
        return undefined
      }
    },
    [address, publicClient]
  )

  const approve = useCallback(
    async (params: ApprovalParams): Promise<`0x${string}`> => {
      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail('Connect a wallet before approving')
      if (params.amount <= 0n) return fail('Enter an amount greater than zero')

      setError(null)
      setIsSubmitting(true)

      try {
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: params.token,
            abi: ERC20ABI,
            functionName: 'approve',
            args: [params.spender, params.amount],
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.token,
          abi: ERC20ABI,
          functionName: 'approve',
          args: [params.spender, params.amount],
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        // Waited on here rather than by the caller: the deposit that follows is
        // sent immediately after, and an allowance still in the mempool is an
        // allowance of zero as far as the pool is concerned.
        if (publicClient) await publicClient.waitForTransactionReceipt({ hash: txHash })

        setIsSubmitting(false)

        return txHash
      } catch (submitError) {
        return fail(describeApprovalError(submitError))
      }
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  return { readAllowance, approve, isSubmitting, error, reset }
}
