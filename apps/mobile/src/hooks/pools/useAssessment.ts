import type { AssessLoanRequest, AssessLoanResponse, AssessmentInfo } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { FIREBASE_FUNCTIONS } from '../../config/firebase'
import { logger } from '../../utils/logger'

/**
 * What the assistant made of the requests in a pool owner's queue.
 *
 * **Advisory, never load-bearing.** Nothing here gates a button, changes a
 * figure, or decides anything — the owner does. The panel this feeds is
 * labelled as an assistant's reading for the same reason.
 *
 * Not in `PoolStore`, like notes and for the same reason: what comes back
 * depends on who is asking — only a pool's owner may read one — so caching it
 * beside pools and loans, which are the same for everybody, would invite the
 * mix-up the backend is careful to avoid.
 */
export interface UseAssessmentsReturn {
  /** Keyed by the loan's document id. Absent while loading or unavailable. */
  assessments: Record<string, AssessmentInfo>
  /** Loan ids with a call in flight, so each card can show its own state. */
  pending: Record<string, boolean>
  /**
   * Why a loan has no assessment, when the backend said why.
   *
   * `not-configured` is the ordinary state of a checkout with no agent set up
   * and reads differently from `unreachable`, which is something being wrong.
   */
  unavailable: Record<string, NonNullable<AssessLoanResponse['unavailable']>>
  /** Read one again. The owner's explicit action — it costs a model call. */
  refresh: (loanDocId: string) => Promise<void>
}

/**
 * @param loanDocIds the undecided requests on screen, by document id
 */
export const useAssessments = (loanDocIds: string[]): UseAssessmentsReturn => {
  const { chainId } = useAccount()
  const [assessments, setAssessments] = useState<Record<string, AssessmentInfo>>({})
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [unavailable, setUnavailable] = useState<Record<string, NonNullable<AssessLoanResponse['unavailable']>>>({})

  /**
   * Loans already asked about in this mount.
   *
   * A ref rather than state, because it must not re-run the effect that writes
   * it. Without it a queue of six would ask again on every render — and the
   * first ask for a loan is the one that spends money.
   */
  const asked = useRef<Set<string>>(new Set())

  const load = useCallback(
    async (loanDocId: string, refresh: boolean): Promise<void> => {
      setPending((current) => ({ ...current, [loanDocId]: true }))

      try {
        const assess = httpsCallable<AssessLoanRequest, AssessLoanResponse>(FIREBASE_FUNCTIONS, 'assessLoan')
        const response = await assess({ chainId: chainId ?? DEFAULT_CHAIN_ID, loanId: loanDocId, ...(refresh ? { refresh } : {}) })

        if (response.data.assessment) {
          setAssessments((current) => ({ ...current, [loanDocId]: response.data.assessment! }))
        }

        setUnavailable((current) => {
          const next = { ...current }

          if (response.data.unavailable) next[loanDocId] = response.data.unavailable
          else delete next[loanDocId]

          return next
        })
      } catch (error) {
        // Silent, like `triggerIndexing`. An assessment is help the owner did
        // not ask for by name, and a red banner about missing help is worse
        // than the absence it describes — the queue decides fine without it.
        logger.warn('Could not read an assessment:', error)
      } finally {
        setPending((current) => {
          const next = { ...current }
          delete next[loanDocId]

          return next
        })
      }
    },
    [chainId]
  )

  /*
    One call per undecided request, the first time the queue shows it.

    The backend reads a stored assessment back rather than making a new one, so
    this is paid once per loan rather than once per open — which is what makes
    asking on open affordable at all. In parallel rather than in turn: each
    card shows its own state, and six requests read one after another would be
    a minute and a half of waiting.
  */
  const key = loanDocIds.join(',')

  useEffect(() => {
    const wanted = key ? key.split(',') : []
    const fresh = wanted.filter((loanDocId) => !asked.current.has(loanDocId))

    fresh.forEach((loanDocId) => asked.current.add(loanDocId))

    void Promise.all(fresh.map((loanDocId) => load(loanDocId, false)))
  }, [key, load])

  const refresh = useCallback(
    async (loanDocId: string): Promise<void> => {
      asked.current.add(loanDocId)

      await load(loanDocId, true)
    },
    [load]
  )

  return { assessments, pending, unavailable, refresh }
}
