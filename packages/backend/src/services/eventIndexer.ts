import { Firestore } from 'firebase-admin/firestore'
import { Contract, Interface, JsonRpcProvider, Log, Provider } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { PoolFactoryABI, POOLS_COLLECTION } from '../constants'

export interface ParsedPoolEvent {
  poolId: number
  poolAddress: string
  poolOwner: string
  name: string
  description: string // not in the event — read back from the factory, see fetchPoolDescription
  maxLoanAmount: string // bigint as string
  interestRate: number
  loanDuration: number
  chainId: number
  transactionHash: string
  blockNumber: number
  createdAt: Date // derived from block timestamp
  isActive: boolean // always true at creation
}

export interface IndexPoolResult {
  poolId: number
  alreadyIndexed: boolean
  stored: boolean
}

const poolFactoryInterface = new Interface([...PoolFactoryABI])

export function parsePoolCreatedLog(log: Log, chainId: number, blockTimestamp: number): ParsedPoolEvent {
  try {
    const decoded = poolFactoryInterface.decodeEventLog('PoolCreated', log.data, log.topics)

    return {
      poolId: Number(decoded.poolId),
      poolAddress: decoded.poolAddress as string,
      poolOwner: decoded.poolOwner as string,
      name: decoded.name as string,
      description: '',
      maxLoanAmount: (decoded.maxLoanAmount as bigint).toString(),
      interestRate: Number(decoded.interestRate),
      loanDuration: Number(decoded.loanDuration),
      chainId,
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
      createdAt: new Date(blockTimestamp * 1000),
      isActive: true,
    }
  } catch (error) {
    throw new Error(`Failed to decode PoolCreated log: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Read a pool's description back from the factory.
 *
 * `PoolCreated` does not emit `description`, so the value the user typed would
 * otherwise be written on-chain and then be invisible to the app, which reads
 * Firestore. `getPoolInfo` has it, and the log's own `address` is the factory
 * that emitted the event — so no chain configuration is needed here.
 *
 * The description is cosmetic: if this read fails, indexing must still store
 * the pool rather than lose it, so failures degrade to an empty string.
 */
export async function fetchPoolDescription(poolId: number, factoryAddress: string, provider: Provider): Promise<string> {
  try {
    const factory = new Contract(factoryAddress, [...PoolFactoryABI], provider)
    const poolInfo = await factory.getPoolInfo(poolId)
    return (poolInfo.description as string) ?? ''
  } catch (error) {
    logger.warn('Failed to read pool description from factory; indexing without it', {
      poolId,
      factoryAddress,
      error: error instanceof Error ? error.message : String(error),
    })
    return ''
  }
}

/**
 * Read a pool's active flag from the factory.
 *
 * `PoolDeactivated` and `PoolReactivated` carry no state — only the pool they
 * concern — so the sweep asks the chain what the flag is *now* rather than
 * replaying the events in order. Two things fall out of that: the result does
 * not depend on the order logs happen to be processed in, and re-scanning old
 * blocks is harmless, because it writes today's truth rather than the truth as
 * of some block in the past.
 */
export async function fetchPoolActive(poolId: number, factoryAddress: string, provider: Provider): Promise<boolean> {
  const factory = new Contract(factoryAddress, [...PoolFactoryABI], provider)

  return (await factory.isPoolActive(poolId)) as boolean
}

/**
 * Apply a pool's active flag to its Firestore document.
 *
 * `isActive` is written `true` when a pool is first indexed and was, until this
 * existed, never touched again — so a pool deactivated on chain kept appearing
 * in `listPools` forever. This is what reconciles it.
 *
 * Returns true only when the stored value actually changed, so a sweep over
 * settled history reports no work — the same guarantee `create()` gives the
 * other indexers.
 *
 * A missing document is skipped rather than created. It means the pool's own
 * creation was never indexed, and a status-only document would put a pool with
 * no name, owner or terms in front of the user.
 */
export async function updatePoolActive(poolId: number, chainId: number, isActive: boolean, firestore: Firestore): Promise<boolean> {
  const docId = `${chainId}-${poolId}`
  const docRef = firestore.collection(POOLS_COLLECTION).doc(docId)
  const doc = await docRef.get()

  if (!doc.exists) {
    logger.warn('Pool status changed for a pool that was never indexed; skipping', { poolId, chainId, docId })

    return false
  }

  if (doc.data()!.isActive === isActive) return false

  await docRef.update({ isActive })

  logger.info('Pool active flag updated', { poolId, chainId, docId, isActive })

  return true
}

/** Firestore's gRPC status for a `create()` against a document that exists. */
const ALREADY_EXISTS = 6

export async function indexPoolEvent(parsedPool: ParsedPoolEvent, firestore: Firestore): Promise<IndexPoolResult> {
  const docId = `${parsedPool.chainId}-${parsedPool.poolId}`
  const docRef = firestore.collection(POOLS_COLLECTION).doc(docId)

  // `create()` rather than read-then-`set()`: the indexing paths race. The
  // create screen indexes the transaction it just saw confirmed while the pools
  // screen drains the same hash, and the scheduled sync can arrive on top. A
  // read-then-write lets every caller observe "absent" and write, so each one
  // reports a first-time store and a doc written elsewhere in between is lost.
  // Rejection on an existing document is what makes the guarantee atomic.
  try {
    await docRef.create({
      poolId: parsedPool.poolId,
      poolAddress: parsedPool.poolAddress,
      // Lowercased on write: `listPools` lowercases the ownerAddress it filters
      // by, so storing the checksummed form would make that filter match nothing.
      poolOwner: parsedPool.poolOwner.toLowerCase(),
      name: parsedPool.name,
      description: parsedPool.description,
      maxLoanAmount: parsedPool.maxLoanAmount,
      interestRate: parsedPool.interestRate,
      loanDuration: parsedPool.loanDuration,
      chainId: parsedPool.chainId,
      createdBy: parsedPool.poolOwner.toLowerCase(), // poolOwner === msg.sender at creation time
      createdAt: parsedPool.createdAt,
      transactionHash: parsedPool.transactionHash,
      isActive: parsedPool.isActive,
    })
  } catch (error) {
    const alreadyExists = typeof error === 'object' && error !== null && 'code' in error && error.code === ALREADY_EXISTS

    if (!alreadyExists) throw error

    logger.info('Pool already indexed, skipping', {
      poolId: parsedPool.poolId,
      chainId: parsedPool.chainId,
      docId,
    })

    return { poolId: parsedPool.poolId, alreadyIndexed: true, stored: false }
  }

  logger.info('Pool indexed successfully', {
    poolId: parsedPool.poolId,
    chainId: parsedPool.chainId,
    docId,
  })

  return { poolId: parsedPool.poolId, alreadyIndexed: false, stored: true }
}

export async function indexPoolByTxHash(
  txHash: string,
  chainId: number,
  provider: JsonRpcProvider,
  firestore: Firestore
): Promise<IndexPoolResult> {
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!receipt) {
    throw new HttpsError('not-found', `Transaction receipt not found for hash: ${txHash}`)
  }

  if (receipt.status !== 1) {
    throw new HttpsError('failed-precondition', `Transaction was reverted or failed: ${txHash}`)
  }

  const poolCreatedTopicHash = poolFactoryInterface.getEvent('PoolCreated')!.topicHash

  const matchingLogs = receipt.logs.filter((log) => log.topics[0] === poolCreatedTopicHash)

  if (matchingLogs.length === 0) {
    throw new HttpsError('not-found', `No PoolCreated event found in transaction: ${txHash}`)
  }

  const block = await provider.getBlock(receipt.blockNumber)

  if (!block) {
    throw new HttpsError('internal', `Failed to fetch block ${receipt.blockNumber}`)
  }

  const parsedPool = parsePoolCreatedLog(matchingLogs[0], chainId, block.timestamp)
  parsedPool.description = await fetchPoolDescription(parsedPool.poolId, matchingLogs[0].address, provider)

  return indexPoolEvent(parsedPool, firestore)
}
