import { AssessmentInfo, AssessmentInputs } from '@superpool/types'
import { formatUnits } from 'ethers'
import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { ASSESSMENTS_COLLECTION, LOANS_COLLECTION, nativeSymbolFor, POOLS_COLLECTION } from '../constants'
import type { AgentAssessmentFacts } from './agentClient'
import { borrowerHistoriesFor } from './borrowerHistory'
import { noteFor } from './notes'

/**
 * Loan assessments: gathering the facts, asking the agent, keeping the answer.
 *
 * Everything the agent is told is assembled here, by the backend that already
 * knows who is asking and what they may see — the agent reads no Firestore and
 * no chain. See `.dev/old/AI_ASSESSMENT_PLAN.md` §3 and §4.
 *
 * **An assessment is never load-bearing.** Nothing in the protocol, the
 * indexer or an eligibility check reads one. This module writes and reads a
 * document; nothing else in the backend imports it.
 */

/** Earlier readings kept beside the current one. Enough to see a change, not a log. */
const MAX_HISTORY = 3

/**
 * How far liquidity may move before a stored assessment is worth redoing.
 *
 * `approveLoan` checks liquidity at approval rather than at request time, so a
 * reading taken when the pool held 500 and read a week later, when it holds 5,
 * describes a pool that no longer exists. A fraction rather than an amount,
 * because pools differ by orders of magnitude.
 */
export const STALE_LIQUIDITY_DRIFT = 0.25

/** The stored shape. `createdAt` is a Timestamp here and ISO on the wire. */
interface StoredAssessment {
  chainId: number
  poolId: number
  loanId: number
  risk: AssessmentInfo['risk']
  summary: string
  observations: string[]
  questions: string[]
  limitations: string[]
  inputs: AssessmentInputs
  createdAt: Timestamp
  history?: { risk: AssessmentInfo['risk']; summary: string; createdAt: Timestamp }[]
}

export interface GatheredFacts {
  facts: AgentAssessmentFacts
  /** The pool's owner — who may ask for this, and who may read it. */
  poolOwner: string
  chainId: number
  poolId: number
  loanId: number
}

/** Who owns the pool a loan belongs to, where to read its liquidity, and in what unit. */
export interface LoanOwnership {
  poolOwner: string
  poolAddress: string
  chainId: number
  poolId: number
  loanId: number
  /**
   * What the pool lends, or `undefined` when the backend could not read its
   * token.
   *
   * Resolved here because this read has the pool document in hand anyway, and
   * because an unpriceable pool should be refused **before** a chain call or a
   * model call — neither is worth making for figures that cannot be printed.
   */
  denomination: Denomination | undefined
}

export interface Denomination {
  symbol: string
  decimals: number
}

/**
 * Who may ask about this loan, resolved before anything else happens.
 *
 * Its own read rather than a by-product of `gatherFacts`, so entitlement is
 * decided before a chain call is made or a model is asked — the order matters
 * when the expensive half costs money.
 */
export async function ownershipOf(loanDocId: string, firestore: Firestore): Promise<LoanOwnership | null> {
  const loanDoc = await firestore.collection(LOANS_COLLECTION).doc(loanDocId).get()

  if (!loanDoc.exists) return null

  const loan = loanDoc.data()!
  const chainId = loan.chainId as number
  const poolId = loan.poolId as number
  const poolDoc = await firestore.collection(POOLS_COLLECTION).doc(`${chainId}-${poolId}`).get()
  const pool = poolDoc.data()
  const poolOwner = (pool?.poolOwner as string | undefined)?.toLowerCase()
  const poolAddress = pool?.poolAddress as string | undefined

  if (!poolOwner || !poolAddress) return null

  return {
    poolOwner,
    poolAddress,
    chainId,
    poolId,
    loanId: loan.loanId as number,
    denomination: denominationOf({ chainId, ...pool }),
  }
}

/**
 * Whether the pool the loan belongs to can be priced at all.
 *
 * The three-way denomination rule, applied here exactly as the app applies it:
 * the zero address is native, a token with decimals is a token pool, and a
 * token **without** decimals is one the backend could not read. That last case
 * refuses rather than defaulting to 18 — which would describe 5 USDC to the
 * model as five million million, inside a sentence somebody lends money on.
 */
export function denominationOf(pool: {
  chainId: number
  loanToken?: string
  tokenSymbol?: string
  tokenDecimals?: number
}): Denomination | undefined {
  const isNative = !pool.loanToken || /^0x0{40}$/i.test(pool.loanToken)

  if (isNative) return { symbol: nativeSymbolFor(pool.chainId), decimals: 18 }

  if (pool.tokenDecimals === undefined) return undefined

  return { symbol: pool.tokenSymbol || 'tokens', decimals: pool.tokenDecimals }
}

/**
 * Whole units, as a number, for a model to reason about.
 *
 * Never wei. A model comparing `5000000000000000000` against
 * `200000000000000000000` is doing arithmetic it has no reason to get right,
 * and the answer is a sentence somebody lends on. Precision loss does not
 * matter here and would matter everywhere else — nothing reads this figure to
 * move money.
 */
export function toWholeUnits(amount: string | bigint, decimals: number): number {
  return Number(formatUnits(BigInt(amount), decimals))
}

/**
 * Everything the agent needs about one loan, or why it cannot be assessed.
 *
 * Reads the indexed loan, its pool, the purpose the borrower stated, how many
 * requests are queued and the borrower's whole record. Liquidity comes from
 * the caller, because it is the one figure that must be read from the chain
 * and this module deliberately holds no provider.
 */
export async function gatherFacts(
  loanDocId: string,
  liquidityWei: bigint,
  nowSeconds: number,
  firestore: Firestore
): Promise<GatheredFacts | { unsupported: true } | null> {
  const loanDoc = await firestore.collection(LOANS_COLLECTION).doc(loanDocId).get()

  if (!loanDoc.exists) {
    logger.warn('No indexed loan to assess', { loanDocId })

    return null
  }

  const loan = loanDoc.data()!
  const chainId = loan.chainId as number
  const poolId = loan.poolId as number

  const poolDoc = await firestore.collection(POOLS_COLLECTION).doc(`${chainId}-${poolId}`).get()

  if (!poolDoc.exists) {
    logger.warn('No indexed pool for the loan being assessed', { loanDocId })

    return null
  }

  const pool = poolDoc.data()!
  const denomination = denominationOf({ chainId, ...pool })

  // A pool whose token the backend could not read shows no figures anywhere
  // else either. Guessing one here would be the only place in the project that
  // did.
  if (!denomination) return { unsupported: true }

  const [purpose, histories, pending] = await Promise.all([
    noteFor(loanDocId, 'loan_purpose', firestore),
    borrowerHistoriesFor([loan.borrower as string], chainId, nowSeconds, firestore),
    firestore
      .collection(LOANS_COLLECTION)
      .where('chainId', '==', chainId)
      .where('poolId', '==', poolId)
      .where('status', '==', 'requested')
      .count()
      .get(),
  ])

  const amount = toWholeUnits(loan.amount as string, denomination.decimals)
  const interestRatePercent = (loan.interestRate as number) / 100

  return {
    poolOwner: (pool.poolOwner as string).toLowerCase(),
    chainId,
    poolId,
    loanId: loan.loanId as number,
    facts: {
      request: {
        amount,
        termDays: Math.round((loan.duration as number) / 86_400),
        interestRatePercent,
        // The term's price, the same figure the app quotes on the card. Not
        // what is owed now — that accrues per second, and a model reasoning
        // about a moving number would be describing a different loan by the
        // time anyone read it.
        repaymentTotal: Number((amount * (1 + interestRatePercent / 100)).toFixed(6)),
        ...(purpose ? { purpose: purpose.text } : {}),
      },
      pool: {
        name: (pool.name as string) || `pool #${poolId}`,
        symbol: denomination.symbol,
        liquidity: toWholeUnits(liquidityWei, denomination.decimals),
        maxLoanAmount: toWholeUnits(pool.maxLoanAmount as string, denomination.decimals),
        pendingRequests: pending.data().count,
      },
      borrower: histories[(loan.borrower as string).toLowerCase()],
    },
  }
}

/** The stored assessment for a loan, if anybody has asked for one. */
export async function assessmentFor(loanDocId: string, firestore: Firestore): Promise<AssessmentInfo | null> {
  const doc = await firestore.collection(ASSESSMENTS_COLLECTION).doc(loanDocId).get()

  if (!doc.exists) return null

  return toAssessment(doc.id, doc.data() as StoredAssessment)
}

/**
 * Whether a stored assessment still describes the pool it was made about.
 *
 * Liquidity is the figure that moves and the one the band most often turns on.
 * A changed purpose or a changed record would also matter, but both are
 * one-way and rare; this is the drift that happens quietly, every time somebody
 * else deposits or borrows.
 */
export function isStale(stored: AssessmentInfo, liquidityNow: number): boolean {
  const before = stored.inputs.liquidity

  if (before <= 0) return liquidityNow > 0

  return Math.abs(liquidityNow - before) / before > STALE_LIQUIDITY_DRIFT
}

export interface SaveAssessmentParams {
  loanDocId: string
  chainId: number
  poolId: number
  loanId: number
  reading: Pick<AssessmentInfo, 'risk' | 'summary' | 'observations' | 'questions' | 'limitations'>
  inputs: AssessmentInputs
}

/**
 * Store a reading, keeping the last few earlier ones.
 *
 * `set` rather than `create`, unlike a note: this is not something anybody
 * said, so there is nothing to protect from being rewritten. What is worth
 * keeping is that it *changed* — an owner who recomputes and sees a different
 * band should be able to tell that from misremembering.
 */
export async function saveAssessment(params: SaveAssessmentParams, firestore: Firestore): Promise<AssessmentInfo> {
  const docRef = firestore.collection(ASSESSMENTS_COLLECTION).doc(params.loanDocId)
  const existing = (await docRef.get()).data() as StoredAssessment | undefined

  const history = [
    ...(existing ? [{ risk: existing.risk, summary: existing.summary, createdAt: existing.createdAt }] : []),
    ...(existing?.history ?? []),
  ].slice(0, MAX_HISTORY)

  const record: StoredAssessment = {
    chainId: params.chainId,
    poolId: params.poolId,
    loanId: params.loanId,
    ...params.reading,
    inputs: params.inputs,
    createdAt: Timestamp.now(),
    ...(history.length > 0 ? { history } : {}),
  }

  await docRef.set(record)

  logger.info('Assessment stored', { loanDocId: params.loanDocId, risk: record.risk, replaced: Boolean(existing) })

  return toAssessment(params.loanDocId, record)
}

function toAssessment(id: string, record: StoredAssessment): AssessmentInfo {
  return {
    id,
    chainId: record.chainId,
    poolId: record.poolId,
    loanId: record.loanId,
    risk: record.risk,
    summary: record.summary,
    observations: record.observations ?? [],
    questions: record.questions ?? [],
    limitations: record.limitations ?? [],
    inputs: record.inputs,
    // ISO, not a Date: the callable encoder turns a Date into `{}`.
    createdAt: record.createdAt.toDate().toISOString(),
    ...(record.history?.length
      ? { history: record.history.map((entry) => ({ ...entry, createdAt: entry.createdAt.toDate().toISOString() })) }
      : {}),
  }
}
