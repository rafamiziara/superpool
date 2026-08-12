import { Contract, Interface, JsonRpcProvider, Log, Provider } from 'ethers'
import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { LOANS_COLLECTION, SampleLendingPoolABI } from '../constants'
import { resolvePoolId } from './contributionIndexer'

/**
 * One loan, read from the chain rather than decoded from a log.
 *
 * Contributions and withdrawals are events: one log, one immutable record. A
 * loan is not — it is requested, approved or rejected, then repaid, so the same
 * entity is described by several logs at different blocks. Replaying those in
 * order would work only if they always arrive in order, which a re-scan or a
 * topic-split query cannot guarantee.
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
  /** When the repayment landed. Undefined while the loan is outstanding. */
  repaidAt?: Date
  status: LoanStatus
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

/** The wire form of `SampleLendingPool.LoanStatus`. */
export type LoanStatus = 'disbursed' | 'requested' | 'rejected'

/**
 * The contract's enum, by ordinal.
 *
 * `Disbursed` is index 0 on purpose — a loan written before the field existed
 * reads zero, and every one of those was disbursed. Reordering this relabels
 * history, so it must track the Solidity enum exactly.
 */
const LOAN_STATUS: readonly LoanStatus[] = ['disbursed', 'requested', 'rejected']

const lendingPoolInterface = new Interface([...SampleLendingPoolABI])

export const LOAN_CREATED_TOPIC = lendingPoolInterface.getEvent('LoanCreated')!.topicHash
export const LOAN_REPAID_TOPIC = lendingPoolInterface.getEvent('LoanRepaid')!.topicHash
export const LOAN_REQUESTED_TOPIC = lendingPoolInterface.getEvent('LoanRequested')!.topicHash
export const LOAN_APPROVED_TOPIC = lendingPoolInterface.getEvent('LoanApproved')!.topicHash
export const LOAN_REJECTED_TOPIC = lendingPoolInterface.getEvent('LoanRejected')!.topicHash

/**
 * Every event that touches a loan.
 *
 * All five are treated identically: the log says *which* loan changed and
 * `getLoan` says what it now is, so nothing downstream branches on which one
 * arrived.
 */
export const LOAN_TOPICS = [LOAN_CREATED_TOPIC, LOAN_REPAID_TOPIC, LOAN_REQUESTED_TOPIC, LOAN_APPROVED_TOPIC, LOAN_REJECTED_TOPIC] as const

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
    // Read from state like everything else here, rather than taken from the
    // `LoanRepaid` log's block. That is what makes it survive a re-scan: the
    // sweep sees `LoanCreated` on every pass, and a timestamp derived from
    // whichever log happened to arrive would be overwritten by the wrong one.
    // Zero means either not repaid or repaid before the field existed; both
    // are "no date", and `isRepaid` is what says which.
    repaidAt: repaidAtFrom(loan.repaidAt as bigint),
    // Out-of-range would mean the contract grew a state this build does not
    // know; reading it as disbursed would be a lie, so it fails loudly.
    status: statusFromOrdinal(Number(loan.status)),
  }
}

/** The fields of a stored loan that decide what a fresh write has to change. */
interface StoredLoan {
  isRepaid?: boolean
  status?: LoanStatus
  startedAt?: Timestamp
  repaidAt?: Timestamp
}

function millisOf(stamp: Timestamp | undefined): number | undefined {
  return stamp?.toDate().getTime()
}

/**
 * Whether this event is the one the record should point at.
 *
 * True when the loan's date is moving, which is what `requestLoan` and
 * `approveLoan` do and what `repayLoan` deliberately does not. A first sighting
 * counts too — including the case where that sighting is a repayment, which
 * leaves the reference on the only transaction anyone has seen. That is
 * unavoidable without scanning history, and better than no reference at all.
 */
function datesTheLoan(stored: StoredLoan | undefined, loan: ParsedLoan): boolean {
  return !stored || millisOf(stored.startedAt) !== loan.startedAt.getTime()
}

/**
 * The chain's repayment stamp, or nothing.
 *
 * `uint64` seconds, and 0 for a loan that has not been repaid — so this is the
 * one place the zero has to be turned back into an absence, before anything
 * downstream dates a settlement to 1970.
 */
function repaidAtFrom(stamp: bigint | undefined): Date | undefined {
  if (!stamp) return undefined

  return new Date(Number(stamp) * 1000)
}

function statusFromOrdinal(ordinal: number): LoanStatus {
  const status = LOAN_STATUS[ordinal]

  if (!status) throw new Error(`Unknown LoanStatus ordinal from chain: ${ordinal}`)

  return status
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
 *
 * The one thing merging does *not* do by itself is preserve a field the write
 * also carries — `transactionHash` and `blockNumber` are both in the payload,
 * so they are held back deliberately instead. See `datesTheLoan`.
 */
export async function indexLoan(loan: ParsedLoan, firestore: Firestore): Promise<IndexLoanResult> {
  const docId = loanDocId(loan.chainId, loan.poolId, loan.loanId)
  const docRef = firestore.collection(LOANS_COLLECTION).doc(docId)
  const existing = await docRef.get()
  const stored = existing.data() as StoredLoan | undefined

  // Every field the chain can change, not just the obvious one. A request that
  // has since been approved has the same `isRepaid` as when it was requested,
  // so comparing that alone would leave the record stuck at `requested`
  // forever; and a record written before `repaidAt` existed has to be allowed
  // to pick it up rather than being reported as already current.
  if (
    stored &&
    stored.isRepaid === loan.isRepaid &&
    stored.status === loan.status &&
    millisOf(stored.repaidAt) === loan.repaidAt?.getTime() &&
    millisOf(stored.startedAt) === loan.startedAt.getTime()
  ) {
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
      // Omitted rather than written as undefined while the loan is
      // outstanding: Firestore rejects an undefined value, and under `merge`
      // an absent key leaves whatever is already there — which is what a
      // stamp the chain still reports would be anyway.
      ...(loan.repaidAt ? { repaidAt: loan.repaidAt } : {}),
      status: loan.status,
      chainId: loan.chainId,
      // The transaction and block always describe the moment `startedAt`
      // names, so a row can date itself and link to itself without the two
      // disagreeing. `startTime` is written by `requestLoan` and rewritten by
      // `approveLoan`, and those are exactly the transactions worth pointing
      // at; a repayment moves the loan without moving its date, so it must not
      // take the reference with it. (Merge alone does not do this — both
      // fields are in the payload, so every write would otherwise overwrite
      // them.)
      ...(datesTheLoan(stored, loan) ? { transactionHash: loan.transactionHash, blockNumber: loan.blockNumber } : {}),
    },
    { merge: true }
  )

  logger.info('Loan indexed successfully', {
    docId,
    loanId: loan.loanId,
    poolId: loan.poolId,
    status: loan.status,
    isRepaid: loan.isRepaid,
  })

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
 * Every loan event is matched in one pass because the caller does not need to
 * know which happened — the record written is the loan's state afterwards
 * whichever it was, so requesting, approving, rejecting, borrowing and repaying
 * all take exactly the same path.
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

  const matchingLogs = receipt.logs.filter((log) => (LOAN_TOPICS as readonly string[]).includes(log.topics[0]))

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
