import { DocumentReference, Firestore } from 'firebase-admin/firestore'
import { Contract, Interface, JsonRpcProvider, Log, Provider, ZeroAddress } from 'ethers'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { ERC20MetadataABI, PoolFactoryABI, POOLS_COLLECTION } from '../constants'

export interface ParsedPoolEvent {
  poolId: number
  poolAddress: string
  poolOwner: string
  name: string
  description: string // not in the event — read back from the factory, see fetchPoolMetadata
  maxLoanAmount: string // bigint as string
  interestRate: number
  loanDuration: number
  chainId: number
  transactionHash: string
  blockNumber: number
  createdAt: Date // derived from block timestamp
  isActive: boolean // always true at creation
  /**
   * What the pool is denominated in — the zero address for native.
   *
   * Not in the event either. `PoolCreated` was deliberately left alone when
   * pools gained a denomination: adding a field changes the event's topic hash
   * and breaks every indexer at once, including this one mid-upgrade.
   * `requiresMembership` is absent from it for the same reason.
   */
  loanToken: string
  /** Absent on a native pool, and absent when the token could not be read. */
  tokenSymbol?: string
  /** Absent on a native pool, and absent when the token could not be read. */
  tokenDecimals?: number
}

/** The parts of a pool that have to be read back rather than decoded from its log. */
export type PoolMetadata = Pick<ParsedPoolEvent, 'description' | 'loanToken' | 'tokenSymbol' | 'tokenDecimals'>

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
      // Native until the factory says otherwise. The log cannot carry this, so
      // this is the pre-`fetchPoolMetadata` default and it is the right one:
      // every pool was native before the field existed.
      loanToken: ZeroAddress,
    }
  } catch (error) {
    throw new Error(`Failed to decode PoolCreated log: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Read back the parts of a pool that its log does not carry.
 *
 * Two facts, one `getPoolInfo` call. Neither is in `PoolCreated`: the
 * description because it was never emitted, and the denomination because the
 * event was deliberately left unchanged when pools gained one — adding a field
 * changes the topic hash and breaks every reader at once. The log's own
 * `address` is the factory that emitted it, so no chain configuration is needed
 * here.
 *
 * **The two facts degrade differently, and that difference is the point.**
 *
 * A description is cosmetic, so a failed read stores an empty string rather
 * than losing the pool. Decimals are not: rendering a 6-decimal balance as an
 * 18-decimal one is a factor of a trillion, so a token whose metadata cannot be
 * read leaves `tokenSymbol` and `tokenDecimals` **absent** — which the app is
 * required to treat as "unsupported", never as "assume 18". The pool is still
 * stored either way; losing it would be worse than showing it as unreadable.
 *
 * A failed `getPoolInfo` falls back to native, which is what every pool was
 * before denominations existed and what all but the token pools still are.
 */
export async function fetchPoolMetadata(poolId: number, factoryAddress: string, provider: Provider): Promise<PoolMetadata> {
  let description = ''
  let loanToken = ZeroAddress

  try {
    const factory = new Contract(factoryAddress, [...PoolFactoryABI], provider)
    const poolInfo = await factory.getPoolInfo(poolId)

    description = (poolInfo.description as string) ?? ''
    loanToken = (poolInfo.loanToken as string) ?? ZeroAddress
  } catch (error) {
    logger.warn('Failed to read pool info from factory; indexing as a native pool without a description', {
      poolId,
      factoryAddress,
      error: error instanceof Error ? error.message : String(error),
    })

    return { description, loanToken }
  }

  if (loanToken === ZeroAddress) return { description, loanToken }

  return { description, loanToken, ...(await fetchTokenMetadata(loanToken, provider)) }
}

/**
 * Read a token's symbol and decimals.
 *
 * Safe to store, unlike most things read from a contract: both are immutable
 * for the life of an ERC-20. `requiresMembership` is the counter-example the
 * codebase already has — the owner can change it at any moment, so it must
 * always be read from the chain and never from an indexed record.
 *
 * Returns nothing at all on failure rather than a guess. See
 * `fetchPoolMetadata`.
 */
async function fetchTokenMetadata(
  tokenAddress: string,
  provider: Provider
): Promise<Pick<ParsedPoolEvent, 'tokenSymbol' | 'tokenDecimals'>> {
  try {
    const token = new Contract(tokenAddress, [...ERC20MetadataABI], provider)

    const [symbol, decimals] = await Promise.all([token.symbol() as Promise<string>, token.decimals() as Promise<bigint>])

    return { tokenSymbol: symbol, tokenDecimals: Number(decimals) }
  } catch (error) {
    logger.warn('Failed to read token metadata; the pool will be indexed as unsupported rather than guessed at', {
      tokenAddress,
      error: error instanceof Error ? error.message : String(error),
    })

    return {}
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

/**
 * Fill in token metadata on a pool that was indexed without it.
 *
 * The narrow exception to "a pool document is written once". `create()` is what
 * makes the racing indexing paths safe, but it also means a pool stored while
 * the token read was failing keeps that gap for ever — and the gap is not
 * cosmetic. A pool with a denomination but no decimals is unsupported in the
 * app, permanently, because of one RPC hiccup at the moment it was created.
 *
 * The sweep re-scans ranges deliberately and re-scanning genesis is supported,
 * so this is a path that actually runs. It repairs in one direction only —
 * absent to known — so it cannot overwrite a good value with a later failed
 * read, and it never touches anything else on the document.
 *
 * Not a general backfill: pools indexed before denominations existed have no
 * `loanToken` and are native, which is what they are, so there is nothing to
 * repair on them.
 */
async function repairTokenMetadata(docRef: DocumentReference, parsedPool: ParsedPoolEvent): Promise<boolean> {
  if (parsedPool.loanToken === ZeroAddress) return false
  if (parsedPool.tokenDecimals === undefined) return false

  const doc = await docRef.get()

  if (!doc.exists) return false
  if (doc.data()!.tokenDecimals != null) return false

  await docRef.update({
    loanToken: parsedPool.loanToken.toLowerCase(),
    tokenDecimals: parsedPool.tokenDecimals,
    // Never written as `undefined`: Firestore rejects it outright. In practice
    // the symbol is always there when the decimals are — they are read in one
    // `Promise.all`, so either both arrive or neither does.
    ...(parsedPool.tokenSymbol === undefined ? {} : { tokenSymbol: parsedPool.tokenSymbol }),
  })

  logger.info('Filled in token metadata on a pool indexed without it', {
    poolId: parsedPool.poolId,
    chainId: parsedPool.chainId,
    loanToken: parsedPool.loanToken,
  })

  return true
}

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
      // Lowercased like the addresses above, so a comparison against a
      // wallet-supplied or config-supplied token address cannot miss on case.
      loanToken: parsedPool.loanToken.toLowerCase(),
      // Written only when they mean something. A native pool has no symbol of
      // its own — the chain does — and a token whose metadata could not be read
      // must stay absent rather than acquire a plausible default.
      ...(parsedPool.tokenSymbol === undefined ? {} : { tokenSymbol: parsedPool.tokenSymbol }),
      ...(parsedPool.tokenDecimals === undefined ? {} : { tokenDecimals: parsedPool.tokenDecimals }),
    })
  } catch (error) {
    const alreadyExists = typeof error === 'object' && error !== null && 'code' in error && error.code === ALREADY_EXISTS

    if (!alreadyExists) throw error

    const repaired = await repairTokenMetadata(docRef, parsedPool)

    logger.info('Pool already indexed, skipping', {
      poolId: parsedPool.poolId,
      chainId: parsedPool.chainId,
      docId,
      repaired,
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
  Object.assign(parsedPool, await fetchPoolMetadata(parsedPool.poolId, matchingLogs[0].address, provider))

  return indexPoolEvent(parsedPool, firestore)
}
