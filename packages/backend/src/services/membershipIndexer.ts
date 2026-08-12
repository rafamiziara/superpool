import { Contract, Interface, JsonRpcProvider, Log, Provider } from 'ethers'
import { Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { MEMBERSHIPS_COLLECTION, SampleLendingPoolABI } from '../constants'
import { resolvePoolId } from './contributionIndexer'

/**
 * Where one address stands with one pool, read from the chain rather than
 * decoded from a log.
 *
 * The same reasoning as loans, not contributions. A contribution is an event —
 * one log, one immutable record. A membership is a state: requested, then
 * admitted or turned down, then perhaps removed, each a separate log at a
 * different block. Replaying those in order would only work if they always
 * arrived in order, which a re-scan cannot promise.
 *
 * So the log says *which* address changed, and `membership(address)` says what
 * it is now.
 */
export interface ParsedMembership {
  poolId: number
  poolAddress: string
  /** Lowercased, as everything address-shaped is on write. */
  account: string
  status: MembershipStatus
  joinedAt: Date
  chainId: number
  transactionHash: string
  blockNumber: number
}

export interface IndexMembershipResult {
  id: string
  poolId: number
  account: string
  /** True when the stored record already matched the chain. */
  alreadyIndexed: boolean
  /** True when this call wrote the document. */
  stored: boolean
}

/** The wire form of `SampleLendingPool.Membership`. */
export type MembershipStatus = 'none' | 'requested' | 'active' | 'rejected' | 'removed' | 'left'

/**
 * The contract's enum, by ordinal.
 *
 * `none` is index 0 because an address nobody has heard of has no membership —
 * here the default value and the correct value coincide, unlike `LOAN_STATUS`
 * where zero had to mean `disbursed`. Must track the Solidity enum exactly.
 */
const MEMBERSHIP_STATUS: readonly MembershipStatus[] = ['none', 'requested', 'active', 'rejected', 'removed', 'left']

const lendingPoolInterface = new Interface([...SampleLendingPoolABI])

export const MEMBERSHIP_REQUESTED_TOPIC = lendingPoolInterface.getEvent('MembershipRequested')!.topicHash
export const MEMBERSHIP_APPROVED_TOPIC = lendingPoolInterface.getEvent('MembershipApproved')!.topicHash
export const MEMBERSHIP_REJECTED_TOPIC = lendingPoolInterface.getEvent('MembershipRejected')!.topicHash
export const MEMBERSHIP_REVOKED_TOPIC = lendingPoolInterface.getEvent('MembershipRevoked')!.topicHash
export const MEMBERSHIP_LEFT_TOPIC = lendingPoolInterface.getEvent('MembershipLeft')!.topicHash
export const MEMBER_JOINED_TOPIC = lendingPoolInterface.getEvent('MemberJoined')!.topicHash

/**
 * Every event that touches a membership.
 *
 * All six are treated identically: the log says which address changed and the
 * chain says what it now is, so nothing downstream branches on which arrived.
 * `MemberJoined` — an open pool enrolling a depositor — is in the list because
 * it is a membership change like any other, even though it rides along with a
 * `FundsDeposited` in the same transaction.
 */
export const MEMBERSHIP_TOPICS = [
  MEMBERSHIP_REQUESTED_TOPIC,
  MEMBERSHIP_APPROVED_TOPIC,
  MEMBERSHIP_REJECTED_TOPIC,
  MEMBERSHIP_REVOKED_TOPIC,
  MEMBERSHIP_LEFT_TOPIC,
  MEMBER_JOINED_TOPIC,
] as const

/** `getPoolId` returns 0 for an unknown address — pool ids start at 1. */
const UNKNOWN_POOL_ID = 0

/**
 * The document id for a membership.
 *
 * Keyed on the pair, not the transaction, because the record is rewritten by
 * every decision about that address. The pool has to be part of the key: the
 * same wallet is a member of several pools independently.
 */
export function membershipDocId(chainId: number, poolId: number, account: string): string {
  return `${chainId}-${poolId}-${account.toLowerCase()}`
}

/**
 * The address carried by every membership event.
 *
 * All six declare a single `account` parameter and it is indexed, so it is
 * topic 1 and needs no ABI decode — `log.data` is empty, exactly as with
 * `FundsDeposited`.
 */
export function parseAccountFromLog(log: Log): string {
  return `0x${log.topics[1].slice(-40)}`.toLowerCase()
}

/**
 * Read an address's current standing from its pool.
 *
 * The pool address comes from `log.address` — the event is emitted by the pool
 * itself — so nothing needs configuring to know where to ask.
 */
export async function fetchMembership(account: string, poolAddress: string, provider: Provider): Promise<MembershipStatus> {
  const pool = new Contract(poolAddress, [...SampleLendingPoolABI], provider)

  return statusFromOrdinal(Number(await pool.membership(account)))
}

function statusFromOrdinal(ordinal: number): MembershipStatus {
  const status = MEMBERSHIP_STATUS[ordinal]

  // Out of range would mean the contract grew a state this build does not know.
  // Reading it as `none` would quietly drop somebody out of their pool.
  if (!status) throw new Error(`Unknown Membership ordinal from chain: ${ordinal}`)

  return status
}

/**
 * Write an address's current standing.
 *
 * `set` with merge rather than `create`: the second event about an address is a
 * change to a document that already exists, so rejecting an existing document —
 * what makes the contribution indexer idempotent — would make a removal
 * impossible to record.
 *
 * Idempotency comes instead from writing chain truth and reporting no work when
 * the stored record already says the same thing, which is what keeps a re-scan
 * of settled history free.
 */
export async function indexMembership(membership: ParsedMembership, firestore: Firestore): Promise<IndexMembershipResult> {
  const docId = membershipDocId(membership.chainId, membership.poolId, membership.account)
  const docRef = firestore.collection(MEMBERSHIPS_COLLECTION).doc(docId)
  const existing = await docRef.get()

  if (existing.exists && existing.data()!.status === membership.status) {
    logger.info('Membership already current, skipping', { docId, account: membership.account, poolId: membership.poolId })

    return { id: docId, poolId: membership.poolId, account: membership.account, alreadyIndexed: true, stored: false }
  }

  await docRef.set(
    {
      poolId: membership.poolId,
      poolAddress: membership.poolAddress,
      account: membership.account,
      status: membership.status,
      // Only on create: `joinedAt` is when this address first appeared in the
      // register, and a later removal must not restamp it as if they had joined
      // the day they were thrown out.
      ...(existing.exists ? {} : { joinedAt: membership.joinedAt }),
      chainId: membership.chainId,
      transactionHash: membership.transactionHash,
      blockNumber: membership.blockNumber,
    },
    { merge: true }
  )

  logger.info('Membership indexed successfully', {
    docId,
    account: membership.account,
    poolId: membership.poolId,
    status: membership.status,
  })

  return { id: docId, poolId: membership.poolId, account: membership.account, alreadyIndexed: false, stored: true }
}

/**
 * Resolve one membership log all the way to a stored record.
 *
 * Shared by the callable and the sweep so both agree on what a membership is.
 * Returns null when the emitting contract is not a pool this factory deployed —
 * anyone can emit an identically-shaped event, and indexing one would put a
 * stranger's pool in a user's list.
 */
export async function indexMembershipFromLog(
  log: Log,
  chainId: number,
  factoryAddress: string,
  provider: Provider,
  firestore: Firestore
): Promise<{ membership: ParsedMembership; result: IndexMembershipResult } | null> {
  const poolId = await resolvePoolId(log.address, factoryAddress, provider)

  if (poolId === UNKNOWN_POOL_ID) return null

  const account = parseAccountFromLog(log)
  const status = await fetchMembership(account, log.address, provider)

  const block = await provider.getBlock(log.blockNumber)

  const membership: ParsedMembership = {
    poolId,
    poolAddress: log.address,
    account,
    status,
    // Only used when creating the record; an existing one keeps its own.
    joinedAt: new Date((block?.timestamp ?? Math.floor(Date.now() / 1000)) * 1000),
    chainId,
    transactionHash: log.transactionHash,
    blockNumber: log.blockNumber,
  }

  return { membership, result: await indexMembership(membership, firestore) }
}

export interface IndexMembershipsByTxHashResult {
  members: ParsedMembership[]
  results: IndexMembershipResult[]
}

/**
 * Index every membership touched by a transaction.
 *
 * Every membership event is matched in one pass because the caller does not
 * need to know which happened — the record written is the address's standing
 * afterwards whichever it was, so asking, admitting, rejecting, removing,
 * leaving and being enrolled by a deposit all take the same path.
 */
export async function indexMembershipsByTxHash(
  txHash: string,
  chainId: number,
  factoryAddress: string,
  provider: JsonRpcProvider,
  firestore: Firestore
): Promise<IndexMembershipsByTxHashResult> {
  const receipt = await provider.getTransactionReceipt(txHash)

  if (!receipt) {
    throw new HttpsError('not-found', `Transaction receipt not found for hash: ${txHash}`)
  }

  if (receipt.status !== 1) {
    throw new HttpsError('failed-precondition', `Transaction was reverted or failed: ${txHash}`)
  }

  const matchingLogs = receipt.logs.filter((log) => (MEMBERSHIP_TOPICS as readonly string[]).includes(log.topics[0]))

  if (matchingLogs.length === 0) {
    throw new HttpsError('not-found', `No membership event found in transaction: ${txHash}`)
  }

  const members: ParsedMembership[] = []
  const results: IndexMembershipResult[] = []

  for (const log of matchingLogs) {
    const indexed = await indexMembershipFromLog(log, chainId, factoryAddress, provider, firestore)

    if (!indexed) {
      throw new HttpsError('not-found', `Membership event did not come from a pool deployed by SuperPool: ${log.address}`)
    }

    members.push(indexed.membership)
    results.push(indexed.result)
  }

  return { members, results }
}
