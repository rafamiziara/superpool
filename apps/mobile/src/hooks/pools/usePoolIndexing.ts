import type { IndexPoolRequest, IndexPoolResponse } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useState } from 'react'
import { useAccount } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { FIREBASE_FUNCTIONS } from '../../config/firebase'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { poolStore } from '../../stores/PoolStore'

export interface UsePoolIndexingReturn {
  /** Asks the backend to index a confirmed transaction. Never rejects. */
  triggerIndexing: (txHash: `0x${string}`, chainId?: number) => Promise<void>
  /** Indexes everything confirmed but not yet stored, including recovered transactions. */
  indexConfirmed: () => Promise<void>
  isIndexing: boolean
}

/**
 * Hands confirmed pool-creation transactions to the backend for indexing.
 *
 * Every failure here is silent by design. Indexing is an optimisation: it makes
 * the pool appear immediately instead of within five minutes, when the scheduled
 * `syncPoolEvents` picks it up from the chain regardless. The pool exists either
 * way, so an error message would report a problem the user does not have and
 * cannot act on.
 *
 * The backend is idempotent, so re-indexing an already-stored pool is a no-op —
 * which is what makes retrying safe.
 */
export const usePoolIndexing = (): UsePoolIndexingReturn => {
  const { chainId } = useAccount()
  const [isIndexing, setIsIndexing] = useState(false)

  const triggerIndexing = useCallback(
    async (txHash: `0x${string}`, requestedChainId?: number): Promise<void> => {
      setIsIndexing(true)

      try {
        const indexPool = httpsCallable<IndexPoolRequest, IndexPoolResponse>(FIREBASE_FUNCTIONS, 'indexPool')
        const response = await indexPool({ txHash, chainId: requestedChainId ?? chainId ?? DEFAULT_CHAIN_ID })

        console.log('🗂️ Pool indexed:', response.data)

        // Refresh before dropping the pending record, so the pool never
        // disappears from the UI in the gap between the two.
        //
        // PoolStore still reads from mocks (task 11): this is the seam, and it
        // starts doing real work once fetchPools is wired to `listPools`.
        await poolStore.loadPools()
        await pendingTransactionsStore.removePendingTransaction(txHash)
      } catch (error) {
        // Deliberately not surfaced — see the note on this hook.
        console.warn('Immediate pool indexing failed; the scheduled sync will pick it up:', error)
      } finally {
        setIsIndexing(false)
      }
    },
    [chainId]
  )

  /**
   * Drains the confirmed-but-unindexed set. Startup recovery produces these
   * without anything else to act on them, so without this a transaction
   * confirmed while the app was closed would wait for the scheduled sync.
   */
  const indexConfirmed = useCallback(async (): Promise<void> => {
    // Snapshotted because triggerIndexing mutates the list it comes from.
    const confirmed = [...pendingTransactionsStore.confirmedUnindexed]

    for (const transaction of confirmed) {
      await triggerIndexing(transaction.txHash, transaction.chainId)
    }
  }, [triggerIndexing])

  return { triggerIndexing, indexConfirmed, isIndexing }
}
