import { Contract, Interface, JsonRpcProvider, Log, Provider } from 'ethers'
import { Firestore, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { LendingPoolABI, LOANS_COLLECTION } from '../constants'
import { resolvePoolId } from './contributionIndexer'
import { notifyLoanDecided, notifyLoanRequested } from './poolNotifications'

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
  /**
   * How much of `amount + interest` has been paid back, in wei as a decimal
   * string.
   *
   * The running total the chain holds now, not this event's payment — a loan
   * can be settled in instalments, and each of those is its own record in
   * `loan_repayments`. Reads `'0'` on a loan written before the field existed,
   * which is right for an outstanding one and wrong-but-harmless for a settled
   * one, since `isRepaid` is what anything asking "is this closed" reads.
   */
  amountRepaid: string
  /**
   * Principal not yet returned, in wei as a decimal string.
   *
   * Changes only when a payment is made, so unlike the interest beside it this
   * one does not go stale between blocks.
   */
  principalOutstanding: string
  /**
   * Interest accrued and not yet paid, in wei as a decimal string, **as of
   * `accruedAt`**.
   *
   * A snapshot, not a live figure. Anything reporting what is owed now has to
   * project it forward from `accruedAt` at the loan's own rate — which is why
   * `interestRate` and `duration` are stored beside it, and why this is worth
   * indexing at all: a list of loans can price itself without an RPC each.
   */
  interestOutstanding: string
  /**
   * When `interestOutstanding` was taken, or `undefined` on a loan that does
   * not accrue.
   *
   * **Undefined means the figures are static**, not that they are unknown. A
   * loan made before interest accrued is priced on the flat terms it was made
   * under and stays there until its first payment converts it — so projecting
   * one forward would charge interest the contract will not ask for.
   */
  accruedAt?: Date
  /**
   * When the loan was **settled**. Undefined while any of it is still owed.
   *
   * Not "when a payment last arrived": earlier instalments are dated by their
   * own `LoanRepaymentMade` logs, and this is stamped only by the payment that
   * closes the debt.
   */
  repaidAt?: Date
  /**
   * When the pool's owner declared this loan defaulted. Undefined on every
   * loan nobody declared.
   *
   * Read from state for the same reason `repaidAt` is: the sweep sees the
   * `LoanDefaulted` log on every pass forever, and a date taken from whichever
   * log happened to arrive would be rewritten by the wrong one. It is on chain
   * at all so that a loan first indexed *after* it defaulted can still say
   * when — a log is not something a later reader can ask for by loan id.
   */
  defaultedAt?: Date
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
  /**
   * What actually changed about the loan, if anything worth telling somebody.
   *
   * Reported separately from `stored` because **`stored` is not news.** A write
   * also happens when nothing about the loan changed and only its transaction
   * reference moved to an earlier block (see `datesTheLoan`), so a notification
   * triggered on `stored` would tell a borrower their loan was approved because
   * a sweep tidied up a hash.
   *
   * This is the only place both halves of a transition exist — the indexer
   * already reads the previous document to decide whether to write at all.
   */
  transition: LoanTransition
}

/**
 * A change worth telling somebody about, or `null` for a write that only
 * corrected bookkeeping.
 *
 * Named for the state arrived at, not the event observed, because the event is
 * deliberately not consulted anywhere in this indexer — `getLoan` is.
 *
 * `disbursed` and `approved` are the one place two journeys reach the same
 * state and have to be told apart: `createLoan` hands money to a borrower who
 * asked for it a moment ago and needs no telling, while `approveLoan` answers
 * a request somebody has been waiting on. Both leave the loan `disbursed`, so
 * only the state it came *from* separates them — and collapsing the two would
 * congratulate every borrower on their own transaction.
 */
export type LoanTransition = 'requested' | 'disbursed' | 'approved' | 'rejected' | 'repayment' | 'repaid' | 'defaulted' | null

/** The wire form of `LendingPool.LoanStatus`. */
export type LoanStatus = 'disbursed' | 'requested' | 'rejected' | 'defaulted'

/**
 * The contract's enum, by ordinal.
 *
 * `Disbursed` is index 0 on purpose — a loan written before the field existed
 * reads zero, and every one of those was disbursed. Reordering this relabels
 * history, so it must track the Solidity enum exactly, and `defaulted` is
 * appended here because it was appended there.
 */
const LOAN_STATUS: readonly LoanStatus[] = ['disbursed', 'requested', 'rejected', 'defaulted']

const lendingPoolInterface = new Interface([...LendingPoolABI])

export const LOAN_CREATED_TOPIC = lendingPoolInterface.getEvent('LoanCreated')!.topicHash
export const LOAN_REPAID_TOPIC = lendingPoolInterface.getEvent('LoanRepaid')!.topicHash
export const LOAN_REQUESTED_TOPIC = lendingPoolInterface.getEvent('LoanRequested')!.topicHash
export const LOAN_APPROVED_TOPIC = lendingPoolInterface.getEvent('LoanApproved')!.topicHash
export const LOAN_REJECTED_TOPIC = lendingPoolInterface.getEvent('LoanRejected')!.topicHash
export const LOAN_REPAYMENT_MADE_TOPIC = lendingPoolInterface.getEvent('LoanRepaymentMade')!.topicHash
export const LOAN_DEFAULTED_TOPIC = lendingPoolInterface.getEvent('LoanDefaulted')!.topicHash

/**
 * Every event that touches a loan.
 *
 * All seven are treated identically: the log says *which* loan changed and
 * `getLoan` says what it now is, so nothing downstream branches on which one
 * arrived.
 *
 * `LoanRepaymentMade` has to be in here even though it has its own collection:
 * a payment that does not settle the loan emits **only** that event, so leaving
 * it out would let `amountRepaid` sit at zero on the loan record until some
 * later event happened to touch it.
 */
export const LOAN_TOPICS = [
  LOAN_CREATED_TOPIC,
  LOAN_REPAID_TOPIC,
  LOAN_REQUESTED_TOPIC,
  LOAN_APPROVED_TOPIC,
  LOAN_REJECTED_TOPIC,
  LOAN_REPAYMENT_MADE_TOPIC,
  LOAN_DEFAULTED_TOPIC,
] as const

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

/** The three fields that describe where a loan's interest has got to. */
interface LoanAccrual {
  principalOutstanding: string
  interestOutstanding: string
  accruedAt?: Date
}

/**
 * What a loan's accrual state is, as the contract would price it.
 *
 * The raw struct is enough for a loan made since interest started accruing:
 * `principalOutstanding` and `interestOutstanding` are a snapshot and
 * `accruedAt` says when it was taken.
 *
 * **A loan made before that reads all three as zero**, because none of the
 * fields existed when it was written — and storing that literally would tell
 * the app the principal is already back. Such a loan is priced by
 * `loanBalance`, which applies the same conversion the contract does when the
 * loan is next paid, so the arithmetic lives in one place rather than being
 * restated here. `accruedAt` stays undefined, which is what says the figures
 * are static: an unconverted loan does not accrue until its first payment.
 *
 * Costs an extra call only for those legacy loans; a modern one is read
 * entirely from the struct already in hand.
 */
async function accrualOf(
  loan: { accruedAt: bigint; principalOutstanding: bigint; interestOutstanding: bigint },
  loanId: number,
  pool: Contract
): Promise<LoanAccrual> {
  if (loan.accruedAt !== 0n) {
    return {
      principalOutstanding: loan.principalOutstanding.toString(),
      interestOutstanding: loan.interestOutstanding.toString(),
      accruedAt: new Date(Number(loan.accruedAt) * 1000),
    }
  }

  const [principal, interest] = await pool.loanBalance(loanId)

  return {
    principalOutstanding: (principal as bigint).toString(),
    interestOutstanding: (interest as bigint).toString(),
  }
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
  const pool = new Contract(poolAddress, [...LendingPoolABI], provider)
  const loan = await pool.getLoan(loanId)
  const accrual = await accrualOf(loan, loanId, pool)

  return {
    ...accrual,
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
    amountRepaid: (loan.amountRepaid as bigint).toString(),
    // Read from state like everything else here, rather than taken from the
    // `LoanRepaid` log's block. That is what makes it survive a re-scan: the
    // sweep sees `LoanCreated` on every pass, and a timestamp derived from
    // whichever log happened to arrive would be overwritten by the wrong one.
    // Zero means either not repaid or repaid before the field existed; both
    // are "no date", and `isRepaid` is what says which.
    repaidAt: repaidAtFrom(loan.repaidAt as bigint),
    // Same zero-is-absence rule as `repaidAt` above, and the same reason it
    // has to be applied here: nothing downstream should have to know that the
    // chain says "never" by saying 1970.
    defaultedAt: repaidAtFrom(loan.defaultedAt as bigint),
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
  defaultedAt?: Timestamp
  amountRepaid?: string
  principalOutstanding?: string
  interestOutstanding?: string
  accruedAt?: Timestamp
  blockNumber?: number
}

function millisOf(stamp: Timestamp | undefined): number | undefined {
  return stamp?.toDate().getTime()
}

/**
 * Whether this event is the one the record should point at.
 *
 * The reference should always be the transaction that put the loan into the
 * dating it now carries, so that a row's date and its link are the same block.
 * Two ways an event earns it:
 *
 * - **The date moved**, which is what `requestLoan` and `approveLoan` do and
 *   what `repayLoan` deliberately does not.
 * - **It is earlier than what is stored and carries the same date.** Events do
 *   not have to arrive in order — a loan first seen at its repayment points at
 *   the repayment, and the creation log turning up later is what corrects it.
 *   Verified live: without this the reference sticks to whichever transaction
 *   happened to be indexed first, forever.
 */
function datesTheLoan(stored: StoredLoan | undefined, loan: ParsedLoan): boolean {
  if (!stored) return true

  if (millisOf(stored.startedAt) !== loan.startedAt.getTime()) return true

  return stored.blockNumber === undefined || loan.blockNumber < stored.blockNumber
}

/**
 * What changed between the stored record and the chain.
 *
 * Repayment is checked first: a loan can be created and repaid between two
 * sweeps, and of the two facts the settlement is the later one and the one
 * somebody is waiting on.
 *
 * A record that already exists and is still `requested` yields `null` even
 * though `indexLoan` may well write it — that write is the transaction
 * reference being corrected, which is precisely the case this exists to keep
 * quiet.
 */
function transitionOf(stored: StoredLoan | undefined, loan: ParsedLoan): LoanTransition {
  if (loan.isRepaid && !stored?.isRepaid) return 'repaid'

  // Absent → whatever it is now, which every `LoanStatus` is a transition to.
  // A pool that reviews requests produces `requested` here; one that lends on
  // demand produces `disbursed`, because `createLoan` disburses in the same
  // transaction and there was never a request to observe.
  //
  // A stored record with no `status` counts as absent: it was written before
  // the field existed, and it has no previous state to have moved from. The
  // news is the loan, not any instalment already paid against it.
  if (!stored?.status) return loan.status

  // A declaration moves `disbursed` → `defaulted` on a loan that is otherwise
  // untouched: same borrower, same amount, same `isRepaid`. Checked before the
  // equality below simply because it is a status move like the others; it
  // needs no special case beyond being reachable, since `disbursed` is not
  // `requested` and the final clause would otherwise refuse it.
  if (stored.status === 'disbursed' && loan.status === 'defaulted') {
    return 'defaulted'
  }

  if (stored.status === loan.status) {
    // Money arrived without closing the debt — a state the loan record could
    // not be in until instalments existed, and one that has to be told apart
    // from the reference-tidying write this function exists to silence.
    //
    // Gated on the loan still being open, because a record written before
    // `amountRepaid` existed reads it as absent: without the gate, the first
    // sweep after the upgrade would announce a payment on every settled loan
    // in the index.
    if (!loan.isRepaid && paidMoreThan(stored, loan)) return 'repayment'

    return null
  }

  // `requested` is the only *other* state anything moves out of: a disbursed
  // loan is settled by repayment or declared in default, both handled above,
  // and a rejected one is final.
  if (stored.status !== 'requested') return null

  // Arriving at `disbursed` *from* a request is the owner having approved it.
  return loan.status === 'disbursed' ? 'approved' : loan.status
}

/** Whether the chain has been paid more towards this loan than the record knows. */
function paidMoreThan(stored: StoredLoan, loan: ParsedLoan): boolean {
  return BigInt(loan.amountRepaid) > BigInt(stored.amountRepaid ?? '0')
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
  //
  // `amountRepaid` is here for the sharpest version of that: an instalment
  // moves *only* this field — same status, same `isRepaid`, same dates — so
  // without it a part payment would be reported as already indexed and the
  // record would keep claiming the whole debt is outstanding.
  if (
    stored &&
    stored.isRepaid === loan.isRepaid &&
    stored.status === loan.status &&
    (stored.amountRepaid ?? '0') === loan.amountRepaid &&
    // The accrual snapshot moves on every payment, and only on a payment —
    // nothing else calls `_accrue`. Comparing `accruedAt` alone would be
    // enough on a live chain, but the two amounts are what a reader actually
    // uses, so all three are checked rather than a proxy for them.
    stored.principalOutstanding === loan.principalOutstanding &&
    stored.interestOutstanding === loan.interestOutstanding &&
    millisOf(stored.accruedAt) === loan.accruedAt?.getTime() &&
    millisOf(stored.repaidAt) === loan.repaidAt?.getTime() &&
    // Without this a declaration would be reported as already indexed on a
    // loan whose figures happened not to move — which is every loan the owner
    // declares without a payment having arrived first, i.e. all of them.
    millisOf(stored.defaultedAt) === loan.defaultedAt?.getTime() &&
    millisOf(stored.startedAt) === loan.startedAt.getTime() &&
    // A record whose state is right but whose reference points at a later
    // transaction than this one is not current: nothing else would ever go
    // back and correct it, because every field it compares already matches.
    !datesTheLoan(stored, loan)
  ) {
    logger.info('Loan already current, skipping', { docId, loanId: loan.loanId, poolId: loan.poolId })

    return { id: docId, loanId: loan.loanId, poolId: loan.poolId, alreadyIndexed: true, stored: false, transition: null }
  }

  // Computed before the write, which is the only moment both halves exist.
  const transition = transitionOf(stored, loan)

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
      amountRepaid: loan.amountRepaid,
      principalOutstanding: loan.principalOutstanding,
      interestOutstanding: loan.interestOutstanding,
      // Omitted rather than null when the loan does not accrue, which is the
      // same shape `repaidAt` uses and means the same thing here: absent is a
      // statement, not a gap. A reader takes it as "these figures are static".
      ...(loan.accruedAt ? { accruedAt: loan.accruedAt } : {}),
      // Omitted rather than written as undefined while the loan is
      // outstanding: Firestore rejects an undefined value, and under `merge`
      // an absent key leaves whatever is already there — which is what a
      // stamp the chain still reports would be anyway.
      ...(loan.repaidAt ? { repaidAt: loan.repaidAt } : {}),
      // Omitted rather than null, like the two stamps above. Absent means
      // nobody declared this loan, which is the honest reading and the one
      // almost every loan wants.
      ...(loan.defaultedAt ? { defaultedAt: loan.defaultedAt } : {}),
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
    transition,
  })

  return { id: docId, loanId: loan.loanId, poolId: loan.poolId, alreadyIndexed: false, stored: true, transition }
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

  const result = await indexLoan(loan, firestore)

  // Here rather than in the callable, so the sweep notifies too — a request
  // made while the app was closed is exactly the one the owner needs telling
  // about. Failures are swallowed: the record is indexed either way, and an
  // unreachable push service must not turn a successful index into an error the
  // user is shown.
  await notifyLoanRequested(result, loan, firestore).catch((error: unknown) => {
    logger.error('Loan notification failed; indexing stands', {
      docId: result.id,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  // The borrower's half: their request was answered, or their debt was
  // declared. Needs the provider, which the owner-facing pair does not — a
  // rejection has to be told apart from the borrower cancelling their own
  // request, and only the transaction's sender can do that.
  await notifyLoanDecided(result, loan, provider, firestore).catch((error: unknown) => {
    logger.error('Loan decision notification failed; indexing stands', {
      docId: result.id,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  return { loan, result }
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
