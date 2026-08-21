import { useEffect } from 'react'
import { usePublicClient } from 'wagmi'
import { pendingTransactionsStore } from '../stores/PendingTransactionsStore'
import { logger } from '../utils/logger'

/**
 * Restores pool-creation transactions left over from a previous run and resolves
 * any that the chain has since decided. Mounted once at the root.
 *
 * Without this, a transaction submitted just before the app was killed would sit
 * in storage as `submitted` forever — the monitoring hook only watches
 * transactions submitted in the current session.
 *
 * Re-runs whenever the client changes, since the wallet can switch networks and
 * `checkPendingTransactions` only resolves transactions on the client's chain.
 */
export function PendingTransactionsInitializer() {
  const publicClient = usePublicClient()

  useEffect(() => {
    let cancelled = false

    const recover = async () => {
      await pendingTransactionsStore.loadFromStorage()
      if (cancelled || !publicClient) return

      await pendingTransactionsStore.checkPendingTransactions(publicClient)
    }

    // Startup recovery is best-effort: the store already swallows storage and
    // receipt failures, but an unexpected throw here must not take down the app.
    recover().catch((error) => logger.warn('Failed to recover pending transactions:', error))

    return () => {
      cancelled = true
    }
  }, [publicClient])

  return null
}
