import { AssessLoanRequest, AssessLoanResponse } from '@superpool/types'
import { Contract } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, LendingPoolABI } from '../../constants'
import { firestore } from '../../services'
import { assessLoanWithAgent } from '../../services/agentClient'
import {
  assessmentFor,
  claimAssessment,
  gatherFacts,
  isStale,
  ownershipOf,
  releaseAssessment,
  saveAssessment,
  toWholeUnits,
} from '../../services/assessments'
import { getProvider } from '../../utils/blockchain'

export const assessLoanHandler = async (request: CallableRequest<AssessLoanRequest>): Promise<AssessLoanResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to ask for an assessment')
  }

  const loanDocId = request.data?.loanId

  if (!loanDocId) {
    throw new HttpsError('invalid-argument', 'A loan id is required')
  }

  const caller = request.auth.uid.toLowerCase()

  // Entitlement first, before a chain read or a model call. The order matters
  // when the expensive half costs money, and this is the check that keeps a
  // machine's reading of somebody's record away from everyone but the one
  // person deciding on it.
  const ownership = await ownershipOf(loanDocId, firestore)

  if (!ownership) {
    throw new HttpsError('not-found', 'There is no indexed loan to assess')
  }

  if (ownership.poolOwner !== caller) {
    throw new HttpsError('permission-denied', 'Only the pool’s owner can ask for an assessment')
  }

  // A pool whose token the backend could not read shows no figures anywhere
  // else either, and guessing an exponent here would be the only place in the
  // project that did. Refused before the chain call and the model call, since
  // neither is worth making for figures that cannot be printed.
  if (!ownership.denomination) {
    return { unavailable: 'unsupported-denomination', cached: false }
  }

  try {
    const provider = getProvider(request.data?.chainId || ownership.chainId || DEFAULT_CHAIN_ID)
    const pool = new Contract(ownership.poolAddress, [...LendingPoolABI], provider)

    // What the pool can actually lend right now, from the chain. `approveLoan`
    // checks it at approval rather than at request time, so this is the figure
    // the decision turns on — and the one that makes a stored reading stale.
    const liquidityWei = (await pool.totalFunds()) as bigint
    const liquidityNow = toWholeUnits(liquidityWei, ownership.denomination.decimals)

    const stored = await assessmentFor(loanDocId, firestore)

    if (stored && !request.data?.refresh && !isStale(stored, liquidityNow)) {
      // Read back rather than recomputed. An LLM judgement is not
      // reproducible, and a decision surface that says something different
      // each time it is opened is worse than useless.
      return { assessment: stored, cached: true }
    }

    const latest = await provider.getBlock('latest')

    if (!latest) throw new Error(`No latest block for chain ${ownership.chainId}; cannot judge the borrower’s record`)

    const gathered = await gatherFacts(loanDocId, liquidityWei, latest.timestamp, firestore)

    if (!gathered || 'unsupported' in gathered) {
      throw new HttpsError('not-found', 'There is no indexed loan to assess')
    }

    /*
      Claimed before the model is asked, and released below if it never
      answered — the same shape `notifyOnce` uses.

      Claimed *here* rather than at the top of the handler, because everything
      above this line is free: a stored reading, an unpriceable pool and an
      unentitled caller all cost nothing, and none of them should cost anybody
      a day's allowance. This is the first line past which money is spent.
    */
    const claim = await claimAssessment(caller, firestore)

    if (!claim.granted) {
      logger.info('Assessment refused: the wallet has spent its day', { loanDocId, cap: claim.cap })

      return { ...(stored ? { assessment: stored } : {}), unavailable: 'quota-reached', cached: Boolean(stored) }
    }

    const result = await assessLoanWithAgent(gathered.facts)

    // The agent is an optional dependency, and its absence is not a failure:
    // this queue worked before any of it existed and has to keep working while
    // it is down. Returning the stale reading rather than nothing, when there
    // is one, is the better of the two silences.
    if (result.status !== 'ok') {
      logger.info('No assessment available', { loanDocId, status: result.status })

      // Nothing was read, so nothing was spent.
      await releaseAssessment(caller, firestore)

      return { ...(stored ? { assessment: stored } : {}), unavailable: result.status, cached: Boolean(stored) }
    }

    const assessment = await saveAssessment(
      {
        loanDocId,
        chainId: gathered.chainId,
        poolId: gathered.poolId,
        loanId: gathered.loanId,
        reading: result.assessment,
        inputs: {
          amount: gathered.facts.request.amount,
          liquidity: gathered.facts.pool.liquidity,
          symbol: gathered.facts.pool.symbol,
          // Whether one was stated, never the text. The purpose is a note and
          // lives in `notes`; copying it here would give it a second home that
          // nothing keeps in step.
          hadPurpose: Boolean(gathered.facts.request.purpose),
          borrower: gathered.facts.borrower,
        },
      },
      firestore
    )

    return { assessment, cached: false }
  } catch (error) {
    if (error instanceof HttpsError) throw error

    logger.error('Error assessing a loan', {
      loanDocId,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to assess this request. Please try again.')
  }
}

/**
 * Cloud Function to have the assistant read one loan request.
 *
 * **Advisory, and never load-bearing.** Nothing in the protocol, the indexer or
 * an eligibility check reads what this produces; the pool's owner decides, and
 * this exists to do the reading they have no time for when six requests are
 * waiting.
 *
 * Computed on demand rather than when a request is indexed: most requests at
 * most pools are decided in seconds by an owner who needs no help, and paying
 * for a reading of every request in the system to serve the minority who do is
 * the wrong default. Stored once, so the same screen says the same thing
 * twice; recomputed only when the owner asks or when the pool's liquidity has
 * moved far enough that the reading describes a pool that no longer exists.
 *
 * **Capped per wallet per day.** This is the one callable that spends money on
 * somebody else's behalf, and a queue asks for a reading per undecided
 * request. The ceiling bounds the accident — a loop, a stuck refresh, a screen
 * left open — rather than rationing ordinary use, and only readings actually
 * made are counted against it.
 *
 * @param {CallableRequest<AssessLoanRequest>} request the loan, and whether to read it again
 * @returns {Promise<AssessLoanResponse>} the assessment, or why there is none
 * @throws {HttpsError} If unauthenticated, not the pool's owner, or the loan is unknown
 */
export const assessLoan = onCall<AssessLoanRequest>(
  {
    memory: '256MiB',
    // Longer than the other callables: this one waits on a model. The client
    // gives up first — see `ASSESSMENT_TIMEOUT_MS` in `agentClient` — so this
    // is the outer bound rather than the one that fires.
    timeoutSeconds: 120,
    cors: true,
  },
  assessLoanHandler
)
