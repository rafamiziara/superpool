import type { IndexContributionRequest, IndexContributionResponse, IndexPoolRequest, IndexPoolResponse } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useState } from 'react'
import { useAccount } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { FIREBASE_FUNCTIONS } from '../../config/firebase'
import { pendingTransactionsStore, type PendingTransactionType } from '../../stores/PendingTransactionsStore'
import { poolStore } from '../../stores/PoolStore'
import { logger } from '../../utils/logger'

export interface UsePoolIndexingReturn {
  /** Asks the backend to index a confirmed transaction. Never rejects. */
  triggerIndexing: (txHash: `0x${string}`, type: PendingTransactionType, chainId?: number) => Promise<void>
  /** Indexes everything confirmed but not yet stored, including recovered transactions. */
  indexConfirmed: () => Promise<void>
  isIndexing: boolean
}

/** The callable that indexes each transaction type. */
const CALLABLE_NAME: Record<PendingTransactionType, string> = {
  CREATE_POOL: 'indexPool',
  CONTRIBUTE: 'indexContribution',
}

/**
 * Hands confirmed transactions to the backend for indexing.
 *
 * Every failure here is silent by design. Indexing is an optimisation: it makes
 * the result appear immediately instead of within five minutes, when the
 * scheduled `syncPoolEvents` picks it up from the chain regardless. The pool or
 * deposit exists either way, so an error message would report a problem the user
 * does not have and cannot act on.
 *
 * The backend is idempotent for both types, so re-indexing something already
 * stored is a no-op — which is what makes retrying safe.
 */
export const usePoolIndexing = (): UsePoolIndexingReturn => {
  const { chainId } = useAccount()
  const [isIndexing, setIsIndexing] = useState(false)

  const triggerIndexing = useCallback(
    async (txHash: `0x${string}`, type: PendingTransactionType, requestedChainId?: number): Promise<void> => {
      setIsIndexing(true)

      try {
        const index = httpsCallable<IndexPoolRequest | IndexContributionRequest, IndexPoolResponse | IndexContributionResponse>(
          FIREBASE_FUNCTIONS,
          CALLABLE_NAME[type]
        )
        const response = await index({ txHash, chainId: requestedChainId ?? chainId ?? DEFAULT_CHAIN_ID })

        logger.debug('🗂️ Indexed:', type, response.data)

        // Refresh before dropping the pending record, so the result never
        // disappears from the UI in the gap between the two. `refreshPools`
        // reloads contributions in the same pass, so both types are covered.
        await poolStore.refreshPools()
        await pendingTransactionsStore.removePendingTransaction(txHash)
      } catch (error) {
        // Deliberately not surfaced — see the note on this hook.
        logger.warn('Immediate indexing failed; the scheduled sync will pick it up:', error)
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
      await triggerIndexing(transaction.txHash, transaction.type, transaction.chainId)
    }
  }, [triggerIndexing])

  return { triggerIndexing, indexConfirmed, isIndexing }
}
