import { LoanDecisionOutcome } from '@superpool/types'
import { Interface, JsonRpcProvider, Log, Provider } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { LendingPoolABI, LOAN_DECISIONS_COLLECTION } from '../constants'
import { resolvePoolId } from './contributionIndexer'

/**
 * One decision a pool owner made about a loan, resolved to the pool it belongs
 * to.
 *
 * The contribution shape rather than `ParsedLoan`, and that split is the whole
 * reason this exists: the loan document is rewritten by every event and holds
 * only the state left behind, so a decision's date, its author, and — for a
 * `LoanRejected` — which of two opposite things happened all live here alone.
 */
export interface ParsedLoanDecision {
  /** Per-pool loan id. Not unique on its own — see `loanDecisionDocId`. */
  loanId: number
  poolId: number
  poolAddress: string
  /** The loan's borrower, lowercased on write. */
  borrower: string
  /** What the event carried, in wei as a decimal string. A snapshot, never a running figure. */
  amount: string
  outcome: LoanDecisionOutcome
  /** The transaction's sender, lowercased. See `outcomeOf`. */
  decidedBy: string
  chainId: number
  transactionHash: string
  logIndex: number
  blockNumber: number
  decidedAt: Date
}

export interface IndexLoanDecisionResult {
  id: string
  loanId: number
  poolId: number
  outcome: LoanDecisionOutcome
  alreadyIndexed: boolean
  stored: boolean
}

const lendingPoolInterface = new Interface([...LendingPoolABI])

export const LOAN_APPROVED_TOPIC = lendingPoolInterface.getEvent('LoanApproved')!.topicHash
export const LOAN_REJECTED_TOPIC = lendingPoolInterface.getEvent('LoanRejected')!.topicHash
export const LOAN_DEFAULTED_TOPIC = lendingPoolInterface.getEvent('LoanDefaulted')!.topicHash

/**
 * How to read each decision log.
 *
 * `LoanDefaulted` names its third parameter `outstanding` rather than `amount`
 * — it is what was still owed at that block, not what was lent — so the field
 * cannot be assumed from the position. Decoding by the wrong name yields
 * `undefined` and stores a decision worth zero.
 */
const DECISION_EVENTS: Record<string, { name: string; amountField: string; outcome: LoanDecisionOutcome }> = {
  [LOAN_APPROVED_TOPIC]: { name: 'LoanApproved', amountField: 'amount', outcome: 'approved' },
  [LOAN_REJECTED_TOPIC]: { name: 'LoanRejected', amountField: 'amount', outcome: 'rejected' },
  [LOAN_DEFAULTED_TOPIC]: { name: 'LoanDefaulted', amountField: 'outstanding', outcome: 'defaulted' },
}

/**
 * The three events that record a judgement somebody made.
 *
 * `LoanRequested`, `LoanCreated`, `LoanRepaid` and `LoanRepaymentMade` are
 * deliberately absent: they are things that happened, not decisions anyone can
 * be asked about. A pool that lends on demand produces no decisions at all,
 * which is the correct answer for it rather than a gap.
 */
export const LOAN_DECISION_TOPICS = [LOAN_APPROVED_TOPIC, LOAN_REJECTED_TOPIC, LOAN_DEFAULTED_TOPIC] as const

/** `getPoolId` returns 0 for an unknown address — pool ids start at 1. */
const UNKNOWN_POOL_ID = 0

/**
 * The document id for a decision.
 *
 * Keyed on the log, like every other append-only feed, and deliberately **not**
 * on the loan: one loan can be approved and later declared in default, so
 * `${chainId}-${poolId}-${loanId}` would let the declaration overwrite the
 * approval and lose the earlier half of the story. That key belongs to the loan
 * record, which is a different document in a different collection.
 */
export function loanDecisionDocId(chainId: number, transactionHash: string, logIndex: number): string {
  return `${chainId}-${transactionHash.toLowerCase()}-${logIndex}`
}

/** Whether a log is one of the three this indexer records. */
export function isLoanDecisionLog(log: Log): boolean {
  return DECISION_EVENTS[log.topics[0]] !== undefined
}

/**
 * Which outcome a decision log records.
 *
 * The one case worth the function: `cancelLoanRequest` emits `LoanRejected` and
 * leaves the loan in exactly the state `rejectLoan` does, so the record cannot
 * tell a refusal from a withdrawal and the **sender** has to. Told apart here,
 * once, at the moment it happened — the same rule `notifyLoanDecided` follows,
 * and for the same reason: a borrower recorded as declined when they changed
 * their own mind is worse than no record at all.
 *
 * A borrower who is also the pool's owner reads as `cancelled`, which is the
 * charitable reading and matches what the borrower was told at the time.
 */
function outcomeOf(topic: string, borrower: string, sender: string): LoanDecisionOutcome {
  const outcome = DECISION_EVENTS[topic].outcome

  if (outcome !== 'rejected') return outcome

  return borrower.toLowerCase() === sender.toLowerCase() ? 'cancelled' : 'rejected'
}

/**
 * Decode a decision log.
 *
 * All three parameters of all three events are `indexed`, as they are on every
 * loan event here, so the values live entirely in `log.topics` and `log.data`
 * is empty. A decoder that reads `data` returns zero for every decision — and a
 * hand-written fixture that puts the amount in `data` would agree with it.
 * Encode fixtures through the shipped ABI.
 *
 * The sender is passed in rather than fetched: the callable path already holds
 * a receipt that carries it, and the sweep caches one lookup per transaction.
 */
export function parseLoanDecisionLog(
  log: Log,
  chainId: number,
  blockTimestamp: number,
  sender: string
): Omit<ParsedLoanDecision, 'poolId'> {
  const event = DECISION_EVENTS[log.topics[0]]

  if (!event) {
    throw new Error(`Not a loan decision log: topic ${log.topics[0]}`)
  }

  try {
    const decoded = lendingPoolInterface.decodeEventLog(event.name, log.data, log.topics)
    const borrower = (decoded.borrower as string).toLowerCase()

    return {
      loanId: Number(decoded.loanId as bigint),
      poolAddress: log.address,
      // Lowercased on write so `listLoanDecisions` can filter by a wallet
      // address without caring how the caller cased it.
      borrower,
      amount: (decoded[event.amountField] as bigint).toString(),
      outcome: outcomeOf(log.topics[0], borrower, sender),
      decidedBy: sender.toLowerCase(),
      chainId,
      transactionHash: log.transactionHash,
      // ethers v6 renamed v5's `logIndex` to `index`; the old name yields
      // `undefined` and collapses every log onto one document id.
      logIndex: log.index,
      blockNumber: log.blockNumber,
      decidedAt: new Date(blockTimestamp * 1000),
    }
  } catch (error) {
    throw new Error(`Failed to decode ${event.name} log: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Who sent the transaction a log came from.
 *
 * **Never guessed.** An unknown sender throws rather than defaulting to the
 * borrower or to the owner, because the guess would be written once and read
 * as history forever — and on a `LoanRejected` the two possible guesses are
 * opposite claims about a person. The log is skipped instead, and re-running
 * the sweep over the range writes it properly once the node answers.
 */
export async function readDecisionSender(transactionHash: string, provider: Provider): Promise<string> {
  const transaction = await provider.getTransaction(transactionHash)

  if (!transaction) {
    throw new Error(`Transaction not found for hash: ${transactionHash}`)
  }

  return transaction.from
}

/** Firestore's gRPC status for a `create()` against a document that exists. */
const ALREADY_EXISTS = 6

export async function indexLoanDecisionEvent(decision: ParsedLoanDecision, firestore: Firestore): Promise<IndexLoanDecisionResult> {
  const docId = loanDecisionDocId(decision.chainId, decision.transactionHash, decision.logIndex)
  const docRef = firestore.collection(LOAN_DECISIONS_COLLECTION).doc(docId)

  // `create()` rather than read-then-`set()`: the indexing paths race, and
  // rejection on an existing document is what makes the guarantee atomic. It is
  // also what an audit trail wants — a decision is never revised, so the first
  // write is the only one, and a re-scan of a range it already covered can
  // change nothing.
  try {
    await docRef.create({
      loanId: decision.loanId,
      poolId: decision.poolId,
      poolAddress: decision.poolAddress,
      borrower: decision.borrower,
      amount: decision.amount,
      outcome: decision.outcome,
      decidedBy: decision.decidedBy,
      chainId: decision.chainId,
      transactionHash: decision.transactionHash,
      logIndex: decision.logIndex,
      blockNumber: decision.blockNumber,
      decidedAt: decision.decidedAt,
    })
  } catch (error) {
    const alreadyExists = typeof error === 'object' && error !== null && 'code' in error && error.code === ALREADY_EXISTS

    if (!alreadyExists) throw error

    logger.info('Loan decision already indexed, skipping', { docId, loanId: decision.loanId, poolId: decision.poolId })

    return {
      id: docId,
      loanId: decision.loanId,
      poolId: decision.poolId,
      outcome: decision.outcome,
      alreadyIndexed: true,
      stored: false,
    }
  }

  logger.info('Loan decision indexed successfully', {
    docId,
    loanId: decision.loanId,
    poolId: decision.poolId,
    outcome: decision.outcome,
  })

  return {
    id: docId,
    loanId: decision.loanId,
    poolId: decision.poolId,
    outcome: decision.outcome,
    alreadyIndexed: false,
    stored: true,
  }
}

export interface IndexLoanDecisionsByTxHashResult {
  decisions: ParsedLoanDecision[]
  results: IndexLoanDecisionResult[]
}

/**
 * Index every decision recorded by a transaction.
 *
 * Returns an empty result rather than throwing when the transaction carries
 * none — like `indexLoanRepaymentsByTxHash` and unlike the `…ByTxHash` helpers
 * that are each the whole job of a callable. This runs beside loan indexing on
 * every loan transaction, and most of them decide nothing.
 *
 * The receipt carries `from`, so this path costs no extra lookup: the sender
 * that separates a refusal from a withdrawal is already in hand.
 */
export async function indexLoanDecisionsByTxHash(
  txHash: string,
  chainId: number,
  factoryAddress: string,
  provider: JsonRpcProvider,
  firestore: Firestore
): Promise<IndexLoanDecisionsByTxHashResult> {
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!receipt) {
    throw new HttpsError('not-found', `Transaction receipt not found for hash: ${txHash}`)
  }

  if (receipt.status !== 1) {
    throw new HttpsError('failed-precondition', `Transaction was reverted or failed: ${txHash}`)
  }

  const matchingLogs = receipt.logs.filter(isLoanDecisionLog)

  if (matchingLogs.length === 0) {
    return { decisions: [], results: [] }
  }

  const block = await provider.getBlock(receipt.blockNumber)

  if (!block) {
    throw new HttpsError('internal', `Failed to fetch block ${receipt.blockNumber}`)
  }

  const decisions: ParsedLoanDecision[] = []
  const results: IndexLoanDecisionResult[] = []

  for (const log of matchingLogs) {
    const parsed = parseLoanDecisionLog(log, chainId, block.timestamp, receipt.from)
    const poolId = await resolvePoolId(parsed.poolAddress, factoryAddress, provider)

    // Only decisions about pools this factory deployed are ours. Anyone can
    // emit an identically-shaped event from their own contract, and indexing
    // one would put a stranger's judgement in a pool's history.
    if (poolId === UNKNOWN_POOL_ID) continue

    const decision: ParsedLoanDecision = { ...parsed, poolId }

    decisions.push(decision)
    results.push(await indexLoanDecisionEvent(decision, firestore))
  }

  return { decisions, results }
}
