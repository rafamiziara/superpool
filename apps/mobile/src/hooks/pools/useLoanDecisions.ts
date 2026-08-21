import type { ListLoanDecisionsRequest, ListLoanDecisionsResponse, LoanDecisionInfo } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { FIREBASE_FUNCTIONS } from '../../config/firebase'
import { logger } from '../../utils/logger'

/**
 * What a pool decided about its loans, newest first.
 *
 * A hook rather than a feed on `PoolStore`, unlike loans and contributions:
 * one screen asks for one pool's decisions, so putting it in the store would
 * add a request to every load for a list almost nobody opens. The store's
 * feeds are the ones the dashboard merges.
 *
 * Read-only by construction — nothing writes a decision from the app. They are
 * indexed from the chain, and the transaction that produced one was sent by
 * the screen that made the decision.
 */
export interface UseLoanDecisionsReturn {
  decisions: LoanDecisionInfo[]
  isLoading: boolean
  refresh: () => Promise<void>
}

/**
 * @param poolId the pool whose decisions to load, or `undefined` to load none
 */
export const useLoanDecisions = (poolId?: number): UseLoanDecisionsReturn => {
  const { chainId } = useAccount()
  const [decisions, setDecisions] = useState<LoanDecisionInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (poolId === undefined) return

    setIsLoading(true)

    try {
      const listLoanDecisions = httpsCallable<ListLoanDecisionsRequest, ListLoanDecisionsResponse>(FIREBASE_FUNCTIONS, 'listLoanDecisions')
      const response = await listLoanDecisions({ chainId: chainId ?? DEFAULT_CHAIN_ID, poolId })

      setDecisions(response.data.decisions ?? [])
    } catch (error) {
      // Silent, like the notes hook: a screen that could not load its history
      // still shows every figure that comes from the loans themselves, and a
      // history is the least urgent thing on it.
      logger.warn('Could not load loan decisions:', error)
      setDecisions([])
    } finally {
      setIsLoading(false)
    }
  }, [chainId, poolId])

  // Per chain by construction, like every other feed: a decision is keyed on a
  // log, and the log belongs to the chain it was emitted on.
  useEffect(() => {
    void refresh()
  }, [refresh])

  return { decisions, isLoading, refresh }
}
