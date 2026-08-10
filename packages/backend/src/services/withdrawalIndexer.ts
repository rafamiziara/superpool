import { Interface, JsonRpcProvider, Log } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { SampleLendingPoolABI, WITHDRAWALS_COLLECTION } from '../constants'
import { resolvePoolId } from './contributionIndexer'

/**
 * One `FundsWithdrawn` event, resolved to the pool it belongs to.
 *
 * The mirror of `ParsedContributionEvent`, and deliberately so: the two are
 * summed against each other to give a member's position, so they carry the same
 * fields under names that say which direction the money went.
 */
export interface ParsedWithdrawalEvent {
  poolId: number
  poolAddress: string
  member: string
  /** Wei, as a decimal string. */
  amount: string
  chainId: number
  transactionHash: string
  logIndex: number
  blockNumber: number
  withdrawnAt: Date
}

export interface IndexWithdrawalResult {
  id: string
  poolId: number
  alreadyIndexed: boolean
  stored: boolean
}

const lendingPoolInterface = new Interface([...SampleLendingPoolABI])

/** `getPoolId` returns 0 for an unknown address — pool ids start at 1. */
const UNKNOWN_POOL_ID = 0

/**
 * The document id for a withdrawal.
 *
 * Keyed on the log, not the transaction, for the same reason contributions are:
 * one transaction can carry several `FundsWithdrawn` events, and a hash-only key
 * would silently collapse them into one.
 */
export function withdrawalDocId(chainId: number, transactionHash: string, logIndex: number): string {
  return `${chainId}-${transactionHash.toLowerCase()}-${logIndex}`
}

/**
 * Decode a `FundsWithdrawn` log.
 *
 * Both of its parameters are `indexed` — the event mirrors `FundsDeposited` on
 * purpose — so the values live entirely in `log.topics` and `log.data` is empty.
 * A decoder that reads only `data` returns zero for every withdrawal, and a
 * hand-written fixture that puts the amount in `data` would agree with it.
 * Encode fixtures through the shipped ABI.
 *
 * The pool is identified by `log.address`: the event is emitted by the pool
 * contract itself.
 */
export function parseFundsWithdrawnLog(log: Log, chainId: number, blockTimestamp: number): Omit<ParsedWithdrawalEvent, 'poolId'> {
  try {
    const decoded = lendingPoolInterface.decodeEventLog('FundsWithdrawn', log.data, log.topics)

    return {
      poolAddress: log.address,
      // Lowercased on write so `listWithdrawals` can filter by a wallet address
      // without caring how the caller cased it.
      member: (decoded.member as string).toLowerCase(),
      amount: (decoded.amount as bigint).toString(),
      chainId,
      transactionHash: log.transactionHash,
      // ethers v6 renamed v5's `logIndex` to `index`; the old name yields
      // `undefined` and collapses every log onto one document id.
      logIndex: log.index,
      blockNumber: log.blockNumber,
      withdrawnAt: new Date(blockTimestamp * 1000),
    }
  } catch (error) {
    throw new Error(`Failed to decode FundsWithdrawn log: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Firestore's gRPC status for a `create()` against a document that exists. */
const ALREADY_EXISTS = 6

export async function indexWithdrawalEvent(withdrawal: ParsedWithdrawalEvent, firestore: Firestore): Promise<IndexWithdrawalResult> {
  const docId = withdrawalDocId(withdrawal.chainId, withdrawal.transactionHash, withdrawal.logIndex)
  const docRef = firestore.collection(WITHDRAWALS_COLLECTION).doc(docId)

  // `create()` rather than read-then-`set()`: the indexing paths race, and
  // rejection on an existing document is what makes the guarantee atomic.
  try {
    await docRef.create({
      poolId: withdrawal.poolId,
      poolAddress: withdrawal.poolAddress,
      member: withdrawal.member,
      amount: withdrawal.amount,
      chainId: withdrawal.chainId,
      transactionHash: withdrawal.transactionHash,
      logIndex: withdrawal.logIndex,
      blockNumber: withdrawal.blockNumber,
      withdrawnAt: withdrawal.withdrawnAt,
    })
  } catch (error) {
    const alreadyExists = typeof error === 'object' && error !== null && 'code' in error && error.code === ALREADY_EXISTS

    if (!alreadyExists) throw error

    logger.info('Withdrawal already indexed, skipping', { docId, poolId: withdrawal.poolId })

    return { id: docId, poolId: withdrawal.poolId, alreadyIndexed: true, stored: false }
  }

  logger.info('Withdrawal indexed successfully', {
    docId,
    poolId: withdrawal.poolId,
    amount: withdrawal.amount,
  })

  return { id: docId, poolId: withdrawal.poolId, alreadyIndexed: false, stored: true }
}

export interface IndexWithdrawalsByTxHashResult {
  withdrawals: ParsedWithdrawalEvent[]
  results: IndexWithdrawalResult[]
}

/**
 * Index every `FundsWithdrawn` event in a transaction.
 */
export async function indexWithdrawalsByTxHash(
  txHash: string,
  chainId: number,
  factoryAddress: string,
  provider: JsonRpcProvider,
  firestore: Firestore
): Promise<IndexWithdrawalsByTxHashResult> {
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!receipt) {
    throw new HttpsError('not-found', `Transaction receipt not found for hash: ${txHash}`)
  }

  if (receipt.status !== 1) {
    throw new HttpsError('failed-precondition', `Transaction was reverted or failed: ${txHash}`)
  }

  const fundsWithdrawnTopicHash = lendingPoolInterface.getEvent('FundsWithdrawn')!.topicHash
  const matchingLogs = receipt.logs.filter((log) => log.topics[0] === fundsWithdrawnTopicHash)

  if (matchingLogs.length === 0) {
    throw new HttpsError('not-found', `No FundsWithdrawn event found in transaction: ${txHash}`)
  }

  const block = await provider.getBlock(receipt.blockNumber)

  if (!block) {
    throw new HttpsError('internal', `Failed to fetch block ${receipt.blockNumber}`)
  }

  const withdrawals: ParsedWithdrawalEvent[] = []
  const results: IndexWithdrawalResult[] = []

  for (const log of matchingLogs) {
    const parsed = parseFundsWithdrawnLog(log, chainId, block.timestamp)
    const poolId = await resolvePoolId(parsed.poolAddress, factoryAddress, provider)

    // Only withdrawals from pools this factory deployed are ours. Anyone can
    // emit an identically-shaped event from their own contract, and indexing one
    // would subtract from a position it has nothing to do with.
    if (poolId === UNKNOWN_POOL_ID) {
      throw new HttpsError('not-found', `Withdrawal was not made from a pool deployed by SuperPool: ${parsed.poolAddress}`)
    }

    const withdrawal: ParsedWithdrawalEvent = { ...parsed, poolId }

    withdrawals.push(withdrawal)
    results.push(await indexWithdrawalEvent(withdrawal, firestore))
  }

  return { withdrawals, results }
}
