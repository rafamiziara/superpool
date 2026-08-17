import { Interface, JsonRpcProvider, Log } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { LendingPoolABI, LOAN_REPAYMENTS_COLLECTION } from '../constants'
import { resolvePoolId } from './contributionIndexer'

/**
 * One `LoanRepaymentMade` event, resolved to the pool it belongs to.
 *
 * Shaped like `ParsedContributionEvent` and `ParsedInterestClaimEvent` rather
 * than like `ParsedLoan`, and that is the whole reason this exists: a payment
 * is an event, immutable once made, while a loan is an entity whose record is
 * rewritten. Both are needed now that a loan can be paid in instalments —
 * `Loan.amountRepaid` says how far along the debt is and cannot say when any of
 * it arrived, because `repaidAt` dates only the payment that closed it.
 */
export interface ParsedLoanRepaymentEvent {
  /** Per-pool loan id. Not unique on its own — see `loanRepaymentDocId`. */
  loanId: number
  poolId: number
  poolAddress: string
  borrower: string
  /** What this payment credited, in wei, as a decimal string. Never the running total. */
  amount: string
  chainId: number
  transactionHash: string
  logIndex: number
  blockNumber: number
  repaidAt: Date
}

export interface IndexLoanRepaymentResult {
  id: string
  loanId: number
  poolId: number
  alreadyIndexed: boolean
  stored: boolean
}

const lendingPoolInterface = new Interface([...LendingPoolABI])

export const LOAN_REPAYMENT_MADE_TOPIC = lendingPoolInterface.getEvent('LoanRepaymentMade')!.topicHash

/** `getPoolId` returns 0 for an unknown address — pool ids start at 1. */
const UNKNOWN_POOL_ID = 0

/**
 * The document id for a payment towards a loan.
 *
 * Keyed on the log, like every other append-only feed, and deliberately **not**
 * on the loan: a loan now has many payments, so `${chainId}-${poolId}-${loanId}`
 * would collapse a borrower's instalments onto one document and lose all but
 * the last. That key belongs to the loan record, which is a different document
 * in a different collection.
 */
export function loanRepaymentDocId(chainId: number, transactionHash: string, logIndex: number): string {
  return `${chainId}-${transactionHash.toLowerCase()}-${logIndex}`
}

/**
 * Decode a `LoanRepaymentMade` log.
 *
 * All three parameters are `indexed`, as they are on every loan event here, so
 * the values live entirely in `log.topics` and `log.data` is empty. A decoder
 * that reads `data` returns zero for every payment — and a hand-written fixture
 * that puts the amount in `data` would agree with it. Encode fixtures through
 * the shipped ABI.
 */
export function parseLoanRepaymentLog(log: Log, chainId: number, blockTimestamp: number): Omit<ParsedLoanRepaymentEvent, 'poolId'> {
  try {
    const decoded = lendingPoolInterface.decodeEventLog('LoanRepaymentMade', log.data, log.topics)

    return {
      loanId: Number(decoded.loanId as bigint),
      poolAddress: log.address,
      // Lowercased on write so `listLoanRepayments` can filter by a wallet
      // address without caring how the caller cased it.
      borrower: (decoded.borrower as string).toLowerCase(),
      amount: (decoded.amount as bigint).toString(),
      chainId,
      transactionHash: log.transactionHash,
      // ethers v6 renamed v5's `logIndex` to `index`; the old name yields
      // `undefined` and collapses every log onto one document id.
      logIndex: log.index,
      blockNumber: log.blockNumber,
      repaidAt: new Date(blockTimestamp * 1000),
    }
  } catch (error) {
    throw new Error(`Failed to decode LoanRepaymentMade log: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Firestore's gRPC status for a `create()` against a document that exists. */
const ALREADY_EXISTS = 6

export async function indexLoanRepaymentEvent(
  repayment: ParsedLoanRepaymentEvent,
  firestore: Firestore
): Promise<IndexLoanRepaymentResult> {
  const docId = loanRepaymentDocId(repayment.chainId, repayment.transactionHash, repayment.logIndex)
  const docRef = firestore.collection(LOAN_REPAYMENTS_COLLECTION).doc(docId)

  // `create()` rather than read-then-`set()`: the indexing paths race, and
  // rejection on an existing document is what makes the guarantee atomic. It is
  // also what a payment wants and a loan cannot have — nothing about a payment
  // is ever revised, so the first write is the only one.
  try {
    await docRef.create({
      loanId: repayment.loanId,
      poolId: repayment.poolId,
      poolAddress: repayment.poolAddress,
      borrower: repayment.borrower,
      amount: repayment.amount,
      chainId: repayment.chainId,
      transactionHash: repayment.transactionHash,
      logIndex: repayment.logIndex,
      blockNumber: repayment.blockNumber,
      repaidAt: repayment.repaidAt,
    })
  } catch (error) {
    const alreadyExists = typeof error === 'object' && error !== null && 'code' in error && error.code === ALREADY_EXISTS

    if (!alreadyExists) throw error

    logger.info('Loan repayment already indexed, skipping', { docId, loanId: repayment.loanId, poolId: repayment.poolId })

    return { id: docId, loanId: repayment.loanId, poolId: repayment.poolId, alreadyIndexed: true, stored: false }
  }

  logger.info('Loan repayment indexed successfully', {
    docId,
    loanId: repayment.loanId,
    poolId: repayment.poolId,
    amount: repayment.amount,
  })

  return { id: docId, loanId: repayment.loanId, poolId: repayment.poolId, alreadyIndexed: false, stored: true }
}

export interface IndexLoanRepaymentsByTxHashResult {
  repayments: ParsedLoanRepaymentEvent[]
  results: IndexLoanRepaymentResult[]
}

/**
 * Index every `LoanRepaymentMade` event in a transaction.
 *
 * Returns an empty result rather than throwing when the transaction carries
 * none — unlike the other `…ByTxHash` helpers, which are each the whole job of
 * a callable. This one runs beside loan indexing on every loan transaction, and
 * most of them are not repayments.
 */
export async function indexLoanRepaymentsByTxHash(
  txHash: string,
  chainId: number,
  factoryAddress: string,
  provider: JsonRpcProvider,
  firestore: Firestore
): Promise<IndexLoanRepaymentsByTxHashResult> {
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!receipt) {
    throw new HttpsError('not-found', `Transaction receipt not found for hash: ${txHash}`)
  }

  if (receipt.status !== 1) {
    throw new HttpsError('failed-precondition', `Transaction was reverted or failed: ${txHash}`)
  }

  const matchingLogs = receipt.logs.filter((log) => log.topics[0] === LOAN_REPAYMENT_MADE_TOPIC)

  if (matchingLogs.length === 0) {
    return { repayments: [], results: [] }
  }

  const block = await provider.getBlock(receipt.blockNumber)

  if (!block) {
    throw new HttpsError('internal', `Failed to fetch block ${receipt.blockNumber}`)
  }

  const repayments: ParsedLoanRepaymentEvent[] = []
  const results: IndexLoanRepaymentResult[] = []

  for (const log of matchingLogs) {
    const parsed = parseLoanRepaymentLog(log, chainId, block.timestamp)
    const poolId = await resolvePoolId(parsed.poolAddress, factoryAddress, provider)

    // Only payments to pools this factory deployed are ours. Anyone can emit an
    // identically-shaped event from their own contract, and indexing one would
    // put a stranger's payment in a user's history.
    if (poolId === UNKNOWN_POOL_ID) continue

    const repayment: ParsedLoanRepaymentEvent = { ...parsed, poolId }

    repayments.push(repayment)
    results.push(await indexLoanRepaymentEvent(repayment, firestore))
  }

  return { repayments, results }
}
