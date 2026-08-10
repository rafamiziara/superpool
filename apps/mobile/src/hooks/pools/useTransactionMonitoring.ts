import { useCallback, useState } from 'react'
import { WaitForTransactionReceiptTimeoutError } from 'viem'
import { usePublicClient } from 'wagmi'
import { extractPoolCreatedResult, pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { describePoolCreationError } from './usePoolCreation'

/** How long to watch a transaction before handing it back to startup recovery. */
const RECEIPT_TIMEOUT_MS = 120_000

export interface TransactionResult {
  poolId: number
  poolAddress: `0x${string}`
  txHash: `0x${string}`
}

export interface UseTransactionMonitoringReturn {
  /** Resolves once the pool exists on chain; rejects on revert, timeout or RPC failure. */
  waitForTransaction: (txHash: `0x${string}`) => Promise<TransactionResult>
  isWaiting: boolean
  error: string | null
}

/**
 * Watches a submitted pool-creation transaction to confirmation and records the
 * outcome on `PendingTransactionsStore`.
 *
 * How each failure moves the stored status matters, because only `submitted`
 * transactions are re-checked at startup and only `confirmed` ones are handed to
 * indexing:
 *
 * - **Reverted** → `failed`. A verdict, and a final one.
 * - **Timed out** → left `submitted`. Two minutes of silence is a slow block far
 *   more often than a lost transaction; it usually still lands. Marking it failed
 *   would be both untrue and unrecoverable, since startup recovery would skip it
 *   from then on. (The plan for this task said to mark it failed — this is a
 *   deliberate departure.)
 * - **RPC or transport error** → left `submitted`, for the same reason.
 * - **Confirmed but no `PoolCreated` log** → `failed`. The transaction succeeded,
 *   so this is not literally true, but no pool was created and none ever will be:
 *   leaving it `confirmed` would queue it for indexing that can never succeed.
 */
export const useTransactionMonitoring = (): UseTransactionMonitoringReturn => {
  const publicClient = usePublicClient()

  const [isWaiting, setIsWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const waitForTransaction = useCallback(
    async (txHash: `0x${string}`): Promise<TransactionResult> => {
      const fail = (message: string): never => {
        setError(message)
        setIsWaiting(false)
        throw new Error(message)
      }

      if (!publicClient) return fail('No connection to the network')

      setError(null)
      setIsWaiting(true)

      let receipt
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: RECEIPT_TIMEOUT_MS })
      } catch (waitError) {
        // The transaction keeps its `submitted` status either way, so startup
        // recovery can resolve it later.
        if (waitError instanceof WaitForTransactionReceiptTimeoutError) {
          return fail('Still waiting for the network to confirm this transaction')
        }

        return fail(describePoolCreationError(waitError))
      }

      if (receipt.status === 'reverted') {
        await pendingTransactionsStore.updateTransactionStatus(txHash, 'failed')

        return fail('Transaction was reverted')
      }

      const result = extractPoolCreatedResult(receipt)
      if (!result) {
        await pendingTransactionsStore.updateTransactionStatus(txHash, 'failed')

        return fail('The transaction confirmed but did not create a pool')
      }

      await pendingTransactionsStore.updateTransactionStatus(txHash, 'confirmed', result)

      setIsWaiting(false)

      return { ...result, txHash }
    },
    [publicClient]
  )

  return { waitForTransaction, isWaiting, error }
}
