import { Contract, Interface, JsonRpcProvider, Log, Provider } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { CONTRIBUTIONS_COLLECTION, LendingPoolABI, PoolFactoryABI } from '../constants'

/**
 * One `FundsDeposited` event, resolved to the pool it belongs to.
 *
 * `poolId` is not in the event — the log only identifies its pool by the address
 * that emitted it — so it is read back from the factory. See `resolvePoolId`.
 */
export interface ParsedContributionEvent {
  poolId: number
  poolAddress: string
  contributor: string
  /** Wei, as a decimal string. */
  amount: string
  chainId: number
  transactionHash: string
  logIndex: number
  blockNumber: number
  contributedAt: Date
}

export interface IndexContributionResult {
  id: string
  poolId: number
  alreadyIndexed: boolean
  stored: boolean
}

const lendingPoolInterface = new Interface([...LendingPoolABI])

/** `getPoolId` returns 0 for an unknown address — pool ids start at 1 (`++poolCount`). */
const UNKNOWN_POOL_ID = 0

/**
 * The document id for a contribution.
 *
 * Keyed on the log rather than the transaction because one transaction can carry
 * several `FundsDeposited` events — a contract that deposits into two pools, or
 * a multicall. Keying on the hash alone would silently collapse those into one.
 */
export function contributionDocId(chainId: number, transactionHash: string, logIndex: number): string {
  return `${chainId}-${transactionHash.toLowerCase()}-${logIndex}`
}

/**
 * Decode a `FundsDeposited` log.
 *
 * Both of its parameters are `indexed`, so the values live in `log.topics` and
 * `log.data` is empty — `decodeEventLog` needs both halves passed regardless.
 *
 * The pool is identified by `log.address`: the event is emitted by the pool
 * contract itself, so no configuration is needed to know where it came from.
 */
export function parseFundsDepositedLog(log: Log, chainId: number, blockTimestamp: number): Omit<ParsedContributionEvent, 'poolId'> {
  try {
    const decoded = lendingPoolInterface.decodeEventLog('FundsDeposited', log.data, log.topics)

    return {
      poolAddress: log.address,
      // Lowercased on write so `listContributions` can filter by a wallet address
      // without caring how the caller cased it.
      contributor: (decoded.depositor as string).toLowerCase(),
      amount: (decoded.amount as bigint).toString(),
      chainId,
      transactionHash: log.transactionHash,
      // ethers v6 renamed v5's `logIndex` to `index`; reading the old name here
      // yields `undefined` and silently collapses every log onto one document id.
      logIndex: log.index,
      blockNumber: log.blockNumber,
      contributedAt: new Date(blockTimestamp * 1000),
    }
  } catch (error) {
    throw new Error(`Failed to decode FundsDeposited log: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Map a pool's address back to its id via the factory's `poolAddressToId`.
 *
 * This is the chain's own answer rather than a Firestore lookup, which matters
 * because it doubles as validation: an address the factory does not know is not
 * a SuperPool pool, and a deposit into it is not ours to index.
 *
 * Returns 0 for an unknown pool — ids start at 1.
 */
export async function resolvePoolId(poolAddress: string, factoryAddress: string, provider: Provider): Promise<number> {
  const factory = new Contract(factoryAddress, [...PoolFactoryABI], provider)
  const poolId = (await factory.getPoolId(poolAddress)) as bigint

  return Number(poolId)
}

/** Firestore's gRPC status for a `create()` against a document that exists. */
const ALREADY_EXISTS = 6

export async function indexContributionEvent(
  contribution: ParsedContributionEvent,
  firestore: Firestore
): Promise<IndexContributionResult> {
  const docId = contributionDocId(contribution.chainId, contribution.transactionHash, contribution.logIndex)
  const docRef = firestore.collection(CONTRIBUTIONS_COLLECTION).doc(docId)

  // `create()` rather than read-then-`set()`, for the same reason the pool
  // indexer uses it: the indexing paths race. The contribute screen indexes the
  // transaction it just watched confirm while startup recovery drains the same
  // hash. Rejection on an existing document is what makes the guarantee atomic.
  try {
    await docRef.create({
      poolId: contribution.poolId,
      poolAddress: contribution.poolAddress,
      contributor: contribution.contributor,
      amount: contribution.amount,
      chainId: contribution.chainId,
      transactionHash: contribution.transactionHash,
      logIndex: contribution.logIndex,
      blockNumber: contribution.blockNumber,
      contributedAt: contribution.contributedAt,
    })
  } catch (error) {
    const alreadyExists = typeof error === 'object' && error !== null && 'code' in error && error.code === ALREADY_EXISTS

    if (!alreadyExists) throw error

    logger.info('Contribution already indexed, skipping', { docId, poolId: contribution.poolId })

    return { id: docId, poolId: contribution.poolId, alreadyIndexed: true, stored: false }
  }

  logger.info('Contribution indexed successfully', {
    docId,
    poolId: contribution.poolId,
    amount: contribution.amount,
  })

  return { id: docId, poolId: contribution.poolId, alreadyIndexed: false, stored: true }
}

export interface IndexContributionsByTxHashResult {
  contributions: ParsedContributionEvent[]
  results: IndexContributionResult[]
}

/**
 * Index every `FundsDeposited` event in a transaction.
 *
 * Unlike pool creation, which produces exactly one `PoolCreated` log, a deposit
 * transaction is only *usually* singular — so all matching logs are indexed and
 * the caller is told how many were new.
 */
export async function indexContributionsByTxHash(
  txHash: string,
  chainId: number,
  factoryAddress: string,
  provider: JsonRpcProvider,
  firestore: Firestore
): Promise<IndexContributionsByTxHashResult> {
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!receipt) {
    throw new HttpsError('not-found', `Transaction receipt not found for hash: ${txHash}`)
  }

  if (receipt.status !== 1) {
    throw new HttpsError('failed-precondition', `Transaction was reverted or failed: ${txHash}`)
  }

  const fundsDepositedTopicHash = lendingPoolInterface.getEvent('FundsDeposited')!.topicHash
  const matchingLogs = receipt.logs.filter((log) => log.topics[0] === fundsDepositedTopicHash)

  if (matchingLogs.length === 0) {
    throw new HttpsError('not-found', `No FundsDeposited event found in transaction: ${txHash}`)
  }

  const block = await provider.getBlock(receipt.blockNumber)

  if (!block) {
    throw new HttpsError('internal', `Failed to fetch block ${receipt.blockNumber}`)
  }

  const contributions: ParsedContributionEvent[] = []
  const results: IndexContributionResult[] = []

  for (const log of matchingLogs) {
    const parsed = parseFundsDepositedLog(log, chainId, block.timestamp)
    const poolId = await resolvePoolId(parsed.poolAddress, factoryAddress, provider)

    // Anyone can call `depositFunds` on any contract that has it. Only deposits
    // into pools this factory deployed are ours, and indexing a stranger's
    // contract would put an unreachable pool id in front of the user.
    if (poolId === UNKNOWN_POOL_ID) {
      throw new HttpsError('not-found', `Deposit was not made to a pool deployed by SuperPool: ${parsed.poolAddress}`)
    }

    const contribution: ParsedContributionEvent = { ...parsed, poolId }

    contributions.push(contribution)
    results.push(await indexContributionEvent(contribution, firestore))
  }

  return { contributions, results }
}
