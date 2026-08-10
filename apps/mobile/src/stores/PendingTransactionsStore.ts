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
export type PendingTransactionType = 'CREATE_POOL' | 'CONTRIBUTE' | 'WITHDRAW'

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
 * Discriminated on `type`, because the flows carry genuinely different
 * payloads: a pool creation has terms and produces an id, a contribution has an
 * amount and a pool it went into. Widening them into one optional-everything
 * shape would push the narrowing into every consumer instead.
 *
 * A withdrawal reuses `ContributeParams` — it is the same amount moving the
 * other way — but keeps its own `type`, since the extractor, the copy and
 * eventually the indexer all differ.
 */
export type PendingTransaction = CreatePoolTransaction | ContributeTransaction | WithdrawTransaction

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
): CreatePoolResult | ContributeResult | WithdrawResult | undefined {
  if (type === 'CREATE_POOL') return extractPoolCreatedResult(receipt)
  if (type === 'WITHDRAW') return extractFundsWithdrawnResult(receipt)

  return extractFundsDepositedResult(receipt)
}

/**
 * Wallet transactions that have been submitted but are not yet confirmed and
 * indexed, persisted to AsyncStorage so they survive an app restart.
 *
 * Holds both pool creations and contributions. The two share every mechanic —
 * submission, receipt polling, startup recovery, indexing, dismissal — and
 * differ only in the payload each carries, so they share the store rather than
 * duplicating it.
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
    result?: CreatePoolResult | ContributeResult
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
