import { Contract, Interface, JsonRpcProvider, Log, Provider } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { LOANS_COLLECTION, SampleLendingPoolABI } from '../constants'
import { resolvePoolId } from './contributionIndexer'

/**
 * One loan, read from the chain rather than decoded from a log.
 *
 * Contributions and withdrawals are events: one log, one immutable record. A
 * loan is not — it is created by `LoanCreated` and later settled by
 * `LoanRepaid`, so the same entity is described by two logs at different
 * blocks. Replaying those in order would work only if they always arrive in
 * order, which a re-scan or a topic-split query cannot guarantee.
 *
 * So the logs are used only to learn *which* loan changed, and `getLoan` is
 * asked what that loan looks like now. Same reasoning as the pool active flag.
 */
export interface ParsedLoan {
  loanId: number
  poolId: number
  poolAddress: string
  borrower: string
  /** Wei, as a decimal string. */
  amount: string
  interestRate: number
  duration: number
  startedAt: Date
  isRepaid: boolean
  chainId: number
  transactionHash: string
  blockNumber: number
}

export interface IndexLoanResult {
  id: string
  loanId: number
  poolId: number
  /** True when the stored record already matched the chain. */
  alreadyIndexed: boolean
  /** True when this call wrote the document, whether creating or settling it. */
  stored: boolean
}

const lendingPoolInterface = new Interface([...SampleLendingPoolABI])

export const LOAN_CREATED_TOPIC = lendingPoolInterface.getEvent('LoanCreated')!.topicHash
export const LOAN_REPAID_TOPIC = lendingPoolInterface.getEvent('LoanRepaid')!.topicHash

/** `getPoolId` returns 0 for an unknown address — pool ids start at 1. */
const UNKNOWN_POOL_ID = 0

/**
 * The document id for a loan.
 *
 * Keyed on the loan, not the transaction, because unlike the other feeds a loan
 * is written twice — once when borrowed, once when repaid — and both must land
 * on the same document. `loanId` is per-pool (each clone counts from 1), so the
 * pool has to be part of the key or two pools' first loans would collide.
 */
export function loanDocId(chainId: number, poolId: number, loanId: number): string {
  return `${chainId}-${poolId}-${loanId}`
}

/**
 * The loan id carried by `LoanCreated` / `LoanRepaid`.
 *
 * Both declare `loanId` as the first indexed parameter, so it is topic 1 and
 * needs no ABI decode — which matters because all three of their parameters are
 * indexed, leaving `log.data` empty.
 */
export function parseLoanIdFromLog(log: Log): number {
  return Number(BigInt(log.topics[1]))
}

/**
 * Read a loan's current state from its pool.
 *
 * The pool address comes from `log.address` — the event is emitted by the pool
 * contract itself — so nothing needs configuring to know where to ask.
 */
export async function fetchLoan(
  loanId: number,
  poolAddress: string,
  provider: Provider
): Promise<Omit<ParsedLoan, 'poolId' | 'chainId' | 'transactionHash' | 'blockNumber'>> {
  const pool = new Contract(poolAddress, [...SampleLendingPoolABI], provider)
  const loan = await pool.getLoan(loanId)

  return {
    loanId,
    poolAddress,
    // Lowercased on write so `listLoans` can filter by wallet without caring
    // how the caller cased it.
    borrower: (loan.borrower as string).toLowerCase(),
    amount: (loan.amount as bigint).toString(),
    interestRate: Number(loan.interestRate),
    duration: Number(loan.duration),
    startedAt: new Date(Number(loan.startTime) * 1000),
    isRepaid: loan.isRepaid as boolean,
  }
}

/**
 * Write a loan's current state.
 *
 * `set` with merge rather than `create`: the second event for a loan is a
 * settlement of a document that already exists, so rejecting an existing
 * document — which is what makes the other indexers idempotent — would make a
 * repayment impossible to record.
 *
 * Idempotency instead comes from writing chain truth and reporting no work when
 * the stored record already says the same thing. That is what keeps a re-scan
 * of settled history free, and it is why `isRepaid` is compared rather than
 * assumed: a sweep sees the `LoanCreated` log on every pass, long after the
 * loan was repaid.
 */
export async function indexLoan(loan: ParsedLoan, firestore: Firestore): Promise<IndexLoanResult> {
  const docId = loanDocId(loan.chainId, loan.poolId, loan.loanId)
  const docRef = firestore.collection(LOANS_COLLECTION).doc(docId)
  const existing = await docRef.get()

  if (existing.exists && existing.data()!.isRepaid === loan.isRepaid) {
    logger.info('Loan already current, skipping', { docId, loanId: loan.loanId, poolId: loan.poolId })

    return { id: docId, loanId: loan.loanId, poolId: loan.poolId, alreadyIndexed: true, stored: false }
  }

  await docRef.set(
    {
      loanId: loan.loanId,
      poolId: loan.poolId,
      poolAddress: loan.poolAddress,
      borrower: loan.borrower,
      amount: loan.amount,
      interestRate: loan.interestRate,
      duration: loan.duration,
      startedAt: loan.startedAt,
      isRepaid: loan.isRepaid,
      chainId: loan.chainId,
      transactionHash: loan.transactionHash,
      blockNumber: loan.blockNumber,
    },
    // Merged so a settlement keeps the creating transaction's hash and block,
    // which is what the activity feed dates the loan by.
    { merge: true }
  )

  logger.info('Loan indexed successfully', { docId, loanId: loan.loanId, poolId: loan.poolId, isRepaid: loan.isRepaid })

  return { id: docId, loanId: loan.loanId, poolId: loan.poolId, alreadyIndexed: false, stored: true }
}

/**
 * Resolve one loan log all the way to a stored record.
 *
 * Shared by the callable and the sweep so both agree on what a loan is. Returns
 * null when the emitting contract is not a pool this factory deployed — anyone
 * can emit an identically-shaped event, and indexing one would put a stranger's
 * debt in a user's list.
 */
export async function indexLoanFromLog(
  log: Log,
  chainId: number,
  factoryAddress: string,
  provider: Provider,
  firestore: Firestore
): Promise<{ loan: ParsedLoan; result: IndexLoanResult } | null> {
  const poolId = await resolvePoolId(log.address, factoryAddress, provider)

  if (poolId === UNKNOWN_POOL_ID) return null

  const loanId = parseLoanIdFromLog(log)
  const state = await fetchLoan(loanId, log.address, provider)

  const loan: ParsedLoan = {
    ...state,
    poolId,
    chainId,
    transactionHash: log.transactionHash,
    blockNumber: log.blockNumber,
  }

  return { loan, result: await indexLoan(loan, firestore) }
}

export interface IndexLoansByTxHashResult {
  loans: ParsedLoan[]
  results: IndexLoanResult[]
}

/**
 * Index every loan touched by a transaction, borrowing or repaying alike.
 *
 * Both events are matched in one pass because the caller does not need to know
 * which happened — the record written is the loan's state afterwards either
 * way, so a borrow and a repayment take exactly the same path.
 */
export async function indexLoansByTxHash(
  txHash: string,
  chainId: number,
  factoryAddress: string,
  provider: JsonRpcProvider,
  firestore: Firestore
): Promise<IndexLoansByTxHashResult> {
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!receipt) {
    throw new HttpsError('not-found', `Transaction receipt not found for hash: ${txHash}`)
  }

  if (receipt.status !== 1) {
    throw new HttpsError('failed-precondition', `Transaction was reverted or failed: ${txHash}`)
  }

  const matchingLogs = receipt.logs.filter((log) => log.topics[0] === LOAN_CREATED_TOPIC || log.topics[0] === LOAN_REPAID_TOPIC)

  if (matchingLogs.length === 0) {
    throw new HttpsError('not-found', `No loan event found in transaction: ${txHash}`)
  }

  const loans: ParsedLoan[] = []
  const results: IndexLoanResult[] = []

  for (const log of matchingLogs) {
    const indexed = await indexLoanFromLog(log, chainId, factoryAddress, provider, firestore)

    if (!indexed) {
      throw new HttpsError('not-found', `Loan event did not come from a pool deployed by SuperPool: ${log.address}`)
    }

    loans.push(indexed.loan)
    results.push(indexed.result)
  }

  return { loans, results }
}
