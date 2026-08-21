import { Interface, JsonRpcProvider, Log } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { INTEREST_CLAIMS_COLLECTION, LendingPoolABI } from '../constants'
import { resolvePoolId } from './contributionIndexer'

/**
 * One `InterestClaimed` event, resolved to the pool it belongs to.
 *
 * Shaped like `ParsedContributionEvent` and `ParsedWithdrawalEvent`: a claim is
 * an event, not an entity with a lifecycle, so the record is the log and never
 * changes afterwards.
 */
export interface ParsedInterestClaimEvent {
  poolId: number
  poolAddress: string
  account: string
  /** Wei, as a decimal string. */
  amount: string
  chainId: number
  transactionHash: string
  logIndex: number
  blockNumber: number
  claimedAt: Date
}

export interface IndexInterestClaimResult {
  id: string
  poolId: number
  alreadyIndexed: boolean
  stored: boolean
}

const lendingPoolInterface = new Interface([...LendingPoolABI])

/** `getPoolId` returns 0 for an unknown address — pool ids start at 1. */
const UNKNOWN_POOL_ID = 0

/**
 * The document id for an interest claim.
 *
 * Keyed on the log rather than the transaction, like every other append-only
 * feed: nothing stops a transaction carrying two claims, and a hash-only key
 * would collapse them into one.
 */
export function interestClaimDocId(chainId: number, transactionHash: string, logIndex: number): string {
  return `${chainId}-${transactionHash.toLowerCase()}-${logIndex}`
}

/**
 * Decode an `InterestClaimed` log.
 *
 * Both parameters are `indexed`, matching `FundsDeposited` and `FundsWithdrawn`,
 * so the values live entirely in `log.topics` and `log.data` is empty. A decoder
 * that reads `data` returns zero for every claim — and a hand-written fixture
 * that puts the amount in `data` would agree with it. Encode fixtures through
 * the shipped ABI.
 */
export function parseInterestClaimedLog(log: Log, chainId: number, blockTimestamp: number): Omit<ParsedInterestClaimEvent, 'poolId'> {
  try {
    const decoded = lendingPoolInterface.decodeEventLog('InterestClaimed', log.data, log.topics)

    return {
      poolAddress: log.address,
      // Lowercased on write so `listInterestClaims` can filter by a wallet
      // address without caring how the caller cased it.
      account: (decoded.account as string).toLowerCase(),
      amount: (decoded.amount as bigint).toString(),
      chainId,
      transactionHash: log.transactionHash,
      // ethers v6 renamed v5's `logIndex` to `index`; the old name yields
      // `undefined` and collapses every log onto one document id.
      logIndex: log.index,
      blockNumber: log.blockNumber,
      claimedAt: new Date(blockTimestamp * 1000),
    }
  } catch (error) {
    throw new Error(`Failed to decode InterestClaimed log: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Firestore's gRPC status for a `create()` against a document that exists. */
const ALREADY_EXISTS = 6

export async function indexInterestClaimEvent(claim: ParsedInterestClaimEvent, firestore: Firestore): Promise<IndexInterestClaimResult> {
  const docId = interestClaimDocId(claim.chainId, claim.transactionHash, claim.logIndex)
  const docRef = firestore.collection(INTEREST_CLAIMS_COLLECTION).doc(docId)

  // `create()` rather than read-then-`set()`: the indexing paths race, and
  // rejection on an existing document is what makes the guarantee atomic.
  try {
    await docRef.create({
      poolId: claim.poolId,
      poolAddress: claim.poolAddress,
      account: claim.account,
      amount: claim.amount,
      chainId: claim.chainId,
      transactionHash: claim.transactionHash,
      logIndex: claim.logIndex,
      blockNumber: claim.blockNumber,
      claimedAt: claim.claimedAt,
    })
  } catch (error) {
    const alreadyExists = typeof error === 'object' && error !== null && 'code' in error && error.code === ALREADY_EXISTS

    if (!alreadyExists) throw error

    logger.info('Interest claim already indexed, skipping', { docId, poolId: claim.poolId })

    return { id: docId, poolId: claim.poolId, alreadyIndexed: true, stored: false }
  }

  logger.info('Interest claim indexed successfully', {
    docId,
    poolId: claim.poolId,
    amount: claim.amount,
  })

  return { id: docId, poolId: claim.poolId, alreadyIndexed: false, stored: true }
}

export interface IndexInterestClaimsByTxHashResult {
  claims: ParsedInterestClaimEvent[]
  results: IndexInterestClaimResult[]
}

/**
 * Index every `InterestClaimed` event in a transaction.
 *
 * Returns `{claims, results}`. `storedCount` and `alreadyIndexed` are the
 * callable's job — asserting them here compares against `undefined`.
 */
export async function indexInterestClaimsByTxHash(
  txHash: string,
  chainId: number,
  factoryAddress: string,
  provider: JsonRpcProvider,
  firestore: Firestore
): Promise<IndexInterestClaimsByTxHashResult> {
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!receipt) {
    throw new HttpsError('not-found', `Transaction receipt not found for hash: ${txHash}`)
  }

  if (receipt.status !== 1) {
    throw new HttpsError('failed-precondition', `Transaction was reverted or failed: ${txHash}`)
  }

  const interestClaimedTopicHash = lendingPoolInterface.getEvent('InterestClaimed')!.topicHash
  const matchingLogs = receipt.logs.filter((log) => log.topics[0] === interestClaimedTopicHash)

  if (matchingLogs.length === 0) {
    throw new HttpsError('not-found', `No InterestClaimed event found in transaction: ${txHash}`)
  }

  const block = await provider.getBlock(receipt.blockNumber)

  if (!block) {
    throw new HttpsError('internal', `Failed to fetch block ${receipt.blockNumber}`)
  }

  const claims: ParsedInterestClaimEvent[] = []
  const results: IndexInterestClaimResult[] = []

  for (const log of matchingLogs) {
    const parsed = parseInterestClaimedLog(log, chainId, block.timestamp)
    const poolId = await resolvePoolId(parsed.poolAddress, factoryAddress, provider)

    // Only claims from pools this factory deployed are ours. Anyone can emit an
    // identically-shaped event from their own contract, and indexing one would
    // credit earnings against a pool it has nothing to do with.
    if (poolId === UNKNOWN_POOL_ID) {
      throw new HttpsError('not-found', `Interest was not claimed from a pool deployed by SuperPool: ${parsed.poolAddress}`)
    }

    const claim: ParsedInterestClaimEvent = { ...parsed, poolId }

    claims.push(claim)
    results.push(await indexInterestClaimEvent(claim, firestore))
  }

  return { claims, results }
}
