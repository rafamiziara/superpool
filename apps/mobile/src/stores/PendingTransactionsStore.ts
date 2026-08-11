import AsyncStorage from '@react-native-async-storage/async-storage'
import { makeAutoObservable, runInAction } from 'mobx'
import { parseEventLogs, type TransactionReceipt } from 'viem'
import { PoolFactoryABI, SampleLendingPoolABI } from '../constants/abis'
import { logger } from '../utils/logger'

/** AsyncStorage key holding the serialised transaction list. */
const STORAGE_KEY = '@superpool/pending_transactions'

/**
 * Upper bound on persisted transactions. The normal flow removes each entry once
 * the backend has indexed it, so this only bounds storage if the app is killed
 * mid-flow repeatedly. Oldest entries are dropped first.
 */
const MAX_STORED_TRANSACTIONS = 50

export type PendingTransactionStatus = 'submitted' | 'confirmed' | 'failed'

/**
 * Everything that resolves to one loan record.
 *
 * Six of them because they read as six different things to the user and half
 * are sent by the pool owner rather than the borrower — but they share a
 * payload, an extractor and an indexer, so the set is named once here and the
 * dispatches below narrow against it.
 */
export type LoanTransactionType = 'BORROW' | 'REPAY' | 'REQUEST_LOAN' | 'APPROVE_LOAN' | 'REJECT_LOAN' | 'CANCEL_LOAN_REQUEST'

export type PendingTransactionType = 'CREATE_POOL' | 'CONTRIBUTE' | 'WITHDRAW' | LoanTransactionType

const LOAN_TRANSACTION_TYPES: readonly LoanTransactionType[] = [
  'BORROW',
  'REPAY',
  'REQUEST_LOAN',
  'APPROVE_LOAN',
  'REJECT_LOAN',
  'CANCEL_LOAN_REQUEST',
]

export function isLoanTransactionType(type: PendingTransactionType): type is LoanTransactionType {
  return LOAN_TRANSACTION_TYPES.includes(type as LoanTransactionType)
}

export interface CreatePoolParams {
  name: string
  description: string
  /** Wei, as a decimal string — this record is persisted as JSON, which has no bigint. */
  maxLoanAmount: string
  /** Basis points: 500 = 5%. */
  interestRate: number
  /** Seconds. */
  loanDuration: number
}

export interface ContributeParams {
  poolId: number
  poolAddress: `0x${string}`
  /**
   * Denormalised so a pending card can name the pool without a store lookup —
   * the record has to render at startup, before any pool has been fetched.
   */
  poolName: string
  /** Wei, as a decimal string. */
  amount: string
}

/** Populated once the transaction is confirmed and its `PoolCreated` log is decoded. */
export interface CreatePoolResult {
  poolId: number
  poolAddress: `0x${string}`
}

/** Populated once the transaction is confirmed and its `FundsDeposited` log is decoded. */
export interface ContributeResult {
  /** Wei, as the chain recorded it — authoritative over the submitted params. */
  amount: string
}

/** Populated once the transaction is confirmed and its `FundsWithdrawn` log is decoded. */
export interface WithdrawResult {
  /** Wei, as the chain recorded it — authoritative over the submitted params. */
  amount: string
}

/**
 * Anything that acts on one loan.
 *
 * `loanId` is absent only when the loan does not exist yet — borrowing and
 * requesting, where the contract assigns it. Every other call takes the id as
 * its argument, so it is known before the transaction is sent.
 */
export interface LoanParams {
  poolId: number
  poolAddress: `0x${string}`
  /** Denormalised so a pending card can name the pool before any pool is fetched. */
  poolName: string
  /** Wei, as a decimal string: the principal borrowed or requested, or the total being repaid. */
  amount: string
  /** Per-pool loan id. Assigned by the chain on a borrow or a request; known for everything else. */
  loanId?: number
  /**
   * Whose loan this is, when that is not the sender.
   *
   * Set on the owner's approvals and rejections: the card has to say whose
   * request is being decided, and the sender's own address would name the wrong
   * person. Absent on the borrower's own calls, where it is redundant.
   */
  borrower?: string
}

/** Populated once a loan transaction is confirmed and its log is decoded. */
export interface LoanResult {
  /** The id the chain assigned (borrow) or settled (repayment). */
  loanId: number
  /** Wei, as the chain recorded it — authoritative over the submitted params. */
  amount: string
}

interface PendingTransactionBase {
  txHash: `0x${string}`
  chainId: number
  status: PendingTransactionStatus
  timestamp: number
}

export interface CreatePoolTransaction extends PendingTransactionBase {
  type: 'CREATE_POOL'
  params: CreatePoolParams
  result?: CreatePoolResult
}

export interface ContributeTransaction extends PendingTransactionBase {
  type: 'CONTRIBUTE'
  params: ContributeParams
  result?: ContributeResult
}

export interface WithdrawTransaction extends PendingTransactionBase {
  type: 'WITHDRAW'
  /** Same shape as a contribution: an amount, and the pool it moved through. */
  params: ContributeParams
  result?: WithdrawResult
}

/**
 * One loan action, kept generic in its `type` so the union still discriminates.
 *
 * Six near-identical interfaces would say the same thing six times: what
 * distinguishes these is the wording, the sender and the direction of the
 * money, none of which is a payload difference.
 */
export interface LoanTransaction<T extends LoanTransactionType> extends PendingTransactionBase {
  type: T
  params: LoanParams
  result?: LoanResult
}

export type BorrowTransaction = LoanTransaction<'BORROW'>
export type RepayTransaction = LoanTransaction<'REPAY'>
/** The borrower asking a pool that reviews before it lends. */
export type RequestLoanTransaction = LoanTransaction<'REQUEST_LOAN'>
/** The owner approving a request, which disburses in the same transaction. */
export type ApproveLoanTransaction = LoanTransaction<'APPROVE_LOAN'>
/** The owner turning a request down. Nothing moves; the borrower is freed to ask again. */
export type RejectLoanTransaction = LoanTransaction<'REJECT_LOAN'>
/** The borrower withdrawing their own request before it is decided. */
export type CancelLoanRequestTransaction = LoanTransaction<'CANCEL_LOAN_REQUEST'>

/**
 * Discriminated on `type`, because the flows carry genuinely different
 * payloads: a pool creation has terms and produces an id, a contribution has an
 * amount and a pool it went into. Widening them into one optional-everything
 * shape would push the narrowing into every consumer instead.
 *
 * A withdrawal reuses `ContributeParams` — it is the same amount moving the
 * other way — but keeps its own `type`, since the extractor, the copy and
 * eventually the indexer all differ.
 *
 * The loan actions share `LoanParams` for the same reason and stay separate
 * types: they move money in different directions, are sent by different people
 * and read as different things to the user, even though all six resolve to one
 * loan record and one indexer.
 */
export type PendingTransaction = CreatePoolTransaction | ContributeTransaction | WithdrawTransaction | LoanTransaction<LoanTransactionType>

/**
 * Narrows a transaction to the loan actions in one step.
 *
 * Testing `type` alone narrows the discriminant without narrowing the record it
 * came from, so a consumer reading `params.loanId` after that check still sees
 * the whole union. Six `type === …` comparisons would narrow, which is exactly
 * the enumeration this exists to avoid repeating.
 */
export function isLoanTransaction(transaction: PendingTransaction): transaction is LoanTransaction<LoanTransactionType> {
  return isLoanTransactionType(transaction.type)
}

/**
 * The slice of a Viem `PublicClient` this store needs. Injected rather than
 * imported so the store stays outside the Wagmi/React tree — the caller passes
 * the client it already holds from `usePublicClient()`. A real `PublicClient`
 * satisfies this structurally (asserted in the tests).
 */
export interface TransactionReceiptReader {
  chain?: { id: number }
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<TransactionReceipt | null>
}

/** Any value that can come back out of `JSON.parse`. */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

function isHexString(value: string): value is `0x${string}` {
  return value.startsWith('0x')
}

function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toCreatePoolParams(value: JsonValue | undefined): CreatePoolParams | null {
  if (!isJsonObject(value)) return null

  const { name, description, maxLoanAmount, interestRate, loanDuration } = value

  if (typeof name !== 'string' || typeof description !== 'string' || typeof maxLoanAmount !== 'string') return null
  if (typeof interestRate !== 'number' || typeof loanDuration !== 'number') return null

  return { name, description, maxLoanAmount, interestRate, loanDuration }
}

function toCreatePoolResult(value: JsonValue | undefined): CreatePoolResult | null {
  if (!isJsonObject(value)) return null

  const { poolId, poolAddress } = value

  if (typeof poolId !== 'number') return null
  if (typeof poolAddress !== 'string' || !isHexString(poolAddress)) return null

  return { poolId, poolAddress }
}

function toContributeParams(value: JsonValue | undefined): ContributeParams | null {
  if (!isJsonObject(value)) return null

  const { poolId, poolAddress, poolName, amount } = value

  if (typeof poolId !== 'number' || typeof poolName !== 'string' || typeof amount !== 'string') return null
  if (typeof poolAddress !== 'string' || !isHexString(poolAddress)) return null

  return { poolId, poolAddress, poolName, amount }
}

function toContributeResult(value: JsonValue | undefined): ContributeResult | null {
  if (!isJsonObject(value)) return null

  const { amount } = value

  if (typeof amount !== 'string') return null

  return { amount }
}

function toLoanParams(value: JsonValue | undefined): LoanParams | null {
  if (!isJsonObject(value)) return null

  const { poolId, poolAddress, poolName, amount, loanId, borrower } = value

  if (typeof poolId !== 'number' || typeof poolName !== 'string' || typeof amount !== 'string') return null
  if (typeof poolAddress !== 'string' || !isHexString(poolAddress)) return null
  // Both are genuinely optional — a borrow has no id yet and only the owner's
  // calls name a borrower — so absent is valid and a wrong type is not.
  if (loanId !== undefined && typeof loanId !== 'number') return null
  if (borrower !== undefined && typeof borrower !== 'string') return null

  const params: LoanParams = { poolId, poolAddress, poolName, amount }

  if (loanId !== undefined) params.loanId = loanId
  if (borrower !== undefined) params.borrower = borrower

  return params
}

function toLoanResult(value: JsonValue | undefined): LoanResult | null {
  if (!isJsonObject(value)) return null

  const { loanId, amount } = value

  if (typeof loanId !== 'number' || typeof amount !== 'string') return null

  return { loanId, amount }
}

/**
 * Rebuilds a transaction from persisted JSON, returning `null` for anything that
 * does not match the current shape. Storage outlives the code that wrote it: a
 * record left by an older build must be dropped, never trusted, because this runs
 * during app startup where a throw would be fatal.
 */
function toPendingTransaction(value: JsonValue): PendingTransaction | null {
  if (!isJsonObject(value)) return null

  const { txHash, chainId, type, status, timestamp, params, result } = value

  if (typeof txHash !== 'string' || !isHexString(txHash)) return null
  if (typeof chainId !== 'number' || typeof timestamp !== 'number') return null
  if (status !== 'submitted' && status !== 'confirmed' && status !== 'failed') return null

  const base = { txHash, chainId, status, timestamp } as const

  if (type === 'CREATE_POOL') {
    const parsedParams = toCreatePoolParams(params)
    if (!parsedParams) return null

    const transaction: CreatePoolTransaction = { ...base, type, params: parsedParams }

    const parsedResult = toCreatePoolResult(result)
    if (parsedResult) transaction.result = parsedResult

    return transaction
  }

  if (type === 'CONTRIBUTE') {
    const parsedParams = toContributeParams(params)
    if (!parsedParams) return null

    const transaction: ContributeTransaction = { ...base, type, params: parsedParams }

    const parsedResult = toContributeResult(result)
    if (parsedResult) transaction.result = parsedResult

    return transaction
  }

  if (type === 'WITHDRAW') {
    const parsedParams = toContributeParams(params)
    if (!parsedParams) return null

    const transaction: WithdrawTransaction = { ...base, type, params: parsedParams }

    const parsedResult = toContributeResult(result)
    if (parsedResult) transaction.result = parsedResult

    return transaction
  }

  // Every loan action revives the same way. Until this existed a borrow or a
  // repayment was dropped on restore, so an app killed after signing lost the
  // only record of it and startup recovery had nothing to resolve.
  if (typeof type === 'string' && isLoanTransactionType(type as PendingTransactionType)) {
    const parsedParams = toLoanParams(params)
    if (!parsedParams) return null

    const transaction: LoanTransaction<LoanTransactionType> = { ...base, type: type as LoanTransactionType, params: parsedParams }

    const parsedResult = toLoanResult(result)
    if (parsedResult) transaction.result = parsedResult

    return transaction
  }

  return null
}

/**
 * Reads the pool identifiers out of a confirmed receipt's `PoolCreated` log.
 *
 * Returns `undefined` rather than throwing when the log is absent or
 * undecodable: the identifiers are for display only, and the backend's
 * `indexPool` re-derives them from the transaction hash regardless.
 */
export function extractPoolCreatedResult(receipt: TransactionReceipt): CreatePoolResult | undefined {
  try {
    const [event] = parseEventLogs({ abi: PoolFactoryABI, eventName: 'PoolCreated', logs: receipt.logs })
    if (!event) return undefined

    return { poolId: Number(event.args.poolId), poolAddress: event.args.poolAddress }
  } catch {
    return undefined
  }
}

/**
 * Reads the deposited amount out of a confirmed receipt's `FundsDeposited` log.
 *
 * Both of that event's parameters are `indexed`, so the values come from the log
 * topics; `parseEventLogs` handles that from the ABI without special casing.
 */
export function extractFundsDepositedResult(receipt: TransactionReceipt): ContributeResult | undefined {
  try {
    const [event] = parseEventLogs({ abi: SampleLendingPoolABI, eventName: 'FundsDeposited', logs: receipt.logs })
    if (!event) return undefined

    return { amount: event.args.amount.toString() }
  } catch {
    return undefined
  }
}

/**
 * Reads the withdrawn amount out of a confirmed receipt's `FundsWithdrawn` log.
 *
 * Like `FundsDeposited`, both parameters are `indexed`, so the values live in
 * the log topics and `data` is empty.
 */
export function extractFundsWithdrawnResult(receipt: TransactionReceipt): WithdrawResult | undefined {
  try {
    const [event] = parseEventLogs({ abi: SampleLendingPoolABI, eventName: 'FundsWithdrawn', logs: receipt.logs })
    if (!event) return undefined

    return { amount: event.args.amount.toString() }
  } catch {
    return undefined
  }
}

/**
 * Reads the loan id and amount out of a confirmed receipt.
 *
 * One extractor for every loan action: all five events carry the same three
 * indexed parameters, and a transaction contains exactly one of them, so trying
 * each in turn is unambiguous. The amount differs in meaning — principal
 * borrowed, requested or disbursed, versus total repaid — but each is what the
 * chain recorded for that action, which is what the pending card shows.
 *
 * `cancelLoanRequest` has no event of its own: it emits `LoanRejected`, because
 * the record only tracks the state and the outcome is the same however the
 * request ended.
 */
export function extractLoanResult(receipt: TransactionReceipt): LoanResult | undefined {
  for (const eventName of ['LoanCreated', 'LoanRepaid', 'LoanRequested', 'LoanApproved', 'LoanRejected'] as const) {
    try {
      const [event] = parseEventLogs({ abi: SampleLendingPoolABI, eventName, logs: receipt.logs })
      if (!event) continue

      return { loanId: Number(event.args.loanId), amount: event.args.amount.toString() }
    } catch {
      // Try the other one; an undecodable log is not a reason to give up on a
      // receipt that may still hold the sibling event.
    }
  }

  return undefined
}

/**
 * The result extractor for a transaction's type.
 *
 * Startup recovery resolves records of every kind against the chain and has only
 * the stored `type` to tell them apart, so the dispatch lives here rather than
 * at each call site. Picking the wrong extractor finds no log, and "no log" is
 * what the monitor reads as failure.
 */
export function extractResult(
  type: PendingTransactionType,
  receipt: TransactionReceipt
): CreatePoolResult | ContributeResult | WithdrawResult | LoanResult | undefined {
  if (type === 'CREATE_POOL') return extractPoolCreatedResult(receipt)
  if (type === 'WITHDRAW') return extractFundsWithdrawnResult(receipt)
  if (isLoanTransactionType(type)) return extractLoanResult(receipt)

  return extractFundsDepositedResult(receipt)
}

/**
 * Wallet transactions that have been submitted but are not yet confirmed and
 * indexed, persisted to AsyncStorage so they survive an app restart.
 *
 * Holds every kind: pool creations, contributions, withdrawals and the loan
 * actions. They share every mechanic — submission, receipt polling, startup
 * recovery, indexing, dismissal — and differ only in the payload each carries,
 * so they share the store rather than duplicating it.
 *
 * Every write is mirrored to storage; persistence failures are logged and
 * swallowed, since losing the local record must not fail a transaction that is
 * already on chain.
 */
export class PendingTransactionsStore {
  transactions: PendingTransaction[] = []
  /** True while restoring from AsyncStorage at startup. */
  isLoading = false

  constructor() {
    makeAutoObservable(this)
  }

  get pendingCount(): number {
    return this.transactions.filter((transaction) => transaction.status === 'submitted').length
  }

  get hasPending(): boolean {
    return this.pendingCount > 0
  }

  /** Confirmed on chain but not yet known to the backend — the retry set for indexing. */
  get confirmedUnindexed(): PendingTransaction[] {
    return this.transactions.filter((transaction) => transaction.status === 'confirmed')
  }

  /** Restores persisted transactions. Call once at startup. */
  loadFromStorage = async (): Promise<void> => {
    runInAction(() => {
      this.isLoading = true
    })

    const restored = await this.readStorage()

    runInAction(() => {
      this.transactions = restored
      this.isLoading = false
    })
  }

  /** Adds a transaction, replacing any existing entry with the same hash. */
  addPendingTransaction = async (transaction: PendingTransaction): Promise<void> => {
    runInAction(() => {
      const others = this.transactions.filter((existing) => existing.txHash !== transaction.txHash)
      this.transactions = [...others, transaction].slice(-MAX_STORED_TRANSACTIONS)
    })

    await this.persist()
  }

  updateTransactionStatus = async (
    txHash: `0x${string}`,
    status: PendingTransactionStatus,
    result?: CreatePoolResult | ContributeResult | WithdrawResult | LoanResult
  ): Promise<void> => {
    const transaction = this.transactions.find((existing) => existing.txHash === txHash)
    if (!transaction) return

    runInAction(() => {
      transaction.status = status
      // The result shape follows the transaction's own type; the caller is the
      // monitor, which extracted it from that type's event in the first place.
      if (result) transaction.result = result as typeof transaction.result
    })

    await this.persist()
  }

  removePendingTransaction = async (txHash: `0x${string}`): Promise<void> => {
    const remaining = this.transactions.filter((existing) => existing.txHash !== txHash)
    if (remaining.length === this.transactions.length) return

    runInAction(() => {
      this.transactions = remaining
    })

    await this.persist()
  }

  /**
   * Resolves every still-submitted transaction against the chain. Call at startup
   * after `loadFromStorage()`, once a client is available.
   *
   * Only transactions belonging to the client's chain are checked, so a stored
   * transaction from another network is not read against the wrong node.
   */
  checkPendingTransactions = async (client: TransactionReceiptReader): Promise<void> => {
    const chainId = client.chain?.id
    const submitted = this.transactions.filter(
      (transaction) => transaction.status === 'submitted' && (chainId === undefined || transaction.chainId === chainId)
    )

    for (const transaction of submitted) {
      const receipt = await this.fetchReceipt(client, transaction.txHash)
      if (!receipt) continue

      if (receipt.status === 'success') {
        await this.updateTransactionStatus(transaction.txHash, 'confirmed', extractResult(transaction.type, receipt))
      } else {
        await this.updateTransactionStatus(transaction.txHash, 'failed')
      }
    }
  }

  /** Clears all state and the persisted copy. */
  reset = async (): Promise<void> => {
    runInAction(() => {
      this.transactions = []
    })

    await this.persist()
  }

  /**
   * Viem throws `TransactionReceiptNotFoundError` for a transaction the node has
   * not mined yet — it does not return null. That, and a transport error, both
   * mean "no verdict yet", so the transaction is left submitted rather than being
   * marked failed on what is usually just a slow block or a dropped connection.
   */
  private fetchReceipt = async (client: TransactionReceiptReader, hash: `0x${string}`): Promise<TransactionReceipt | null> => {
    try {
      return await client.getTransactionReceipt({ hash })
    } catch {
      return null
    }
  }

  private persist = async (): Promise<void> => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.transactions))
    } catch (error) {
      logger.warn('Failed to persist pending transactions:', error)
    }
  }

  private readStorage = async (): Promise<PendingTransaction[]> => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY)
      if (!stored) return []

      const parsed = JSON.parse(stored) as JsonValue
      if (!Array.isArray(parsed)) return []

      const restored: PendingTransaction[] = []
      for (const entry of parsed) {
        const transaction = toPendingTransaction(entry)
        if (transaction) restored.push(transaction)
      }

      return restored.slice(-MAX_STORED_TRANSACTIONS)
    } catch (error) {
      logger.warn('Failed to restore pending transactions:', error)
      return []
    }
  }
}

export const pendingTransactionsStore = new PendingTransactionsStore()
