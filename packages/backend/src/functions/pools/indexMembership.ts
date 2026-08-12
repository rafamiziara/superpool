import { IndexMembershipRequest, IndexMembershipResponse, MemberInfo } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, getChainConfig } from '../../constants'
import { firestore } from '../../services'
import { indexMembershipsByTxHash, membershipDocId, ParsedMembership } from '../../services/membershipIndexer'
import { getProvider } from '../../utils/blockchain'

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/

/** Firestore's Date becomes an ISO string on the wire; see MemberInfo. */
function toMemberInfo(membership: ParsedMembership): MemberInfo {
  return {
    id: membershipDocId(membership.chainId, membership.poolId, membership.account),
    poolId: membership.poolId,
    poolAddress: membership.poolAddress,
    account: membership.account,
    status: membership.status,
    joinedAt: membership.joinedAt.toISOString(),
    chainId: membership.chainId,
    transactionHash: membership.transactionHash,
    blockNumber: membership.blockNumber,
  }
}

export const indexMembershipHandler = async (request: CallableRequest<IndexMembershipRequest>): Promise<IndexMembershipResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to index memberships')
  }

  const { txHash, chainId: requestedChainId } = request.data

  if (!txHash || !TX_HASH_REGEX.test(txHash)) {
    throw new HttpsError('invalid-argument', 'Invalid transaction hash format')
  }

  const chainId = requestedChainId || DEFAULT_CHAIN_ID
  const chainConfig = getChainConfig(chainId)

  if (!chainConfig) {
    throw new HttpsError('invalid-argument', `Unsupported chain ID: ${chainId}`)
  }

  // The factory is what maps a pool address back to its id, and what proves the
  // emitting contract is a pool of ours at all.
  if (!chainConfig.poolFactoryAddress) {
    throw new HttpsError('internal', `PoolFactory address not configured for chain ${chainId}`)
  }

  logger.info('Indexing membership by transaction hash', { txHash, chainId })

  try {
    const provider = getProvider(chainId)
    const { members, results } = await indexMembershipsByTxHash(txHash, chainId, chainConfig.poolFactoryAddress, provider, firestore)

    const storedCount = results.filter((result) => result.stored).length

    logger.info('Membership indexing completed', { txHash, chainId, count: members.length, storedCount })

    return {
      members: members.map(toMemberInfo),
      storedCount,
      // True only when this call changed nothing at all.
      alreadyIndexed: storedCount === 0,
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error('Failed to index membership', {
      txHash,
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to index membership. Please try again.')
  }
}

/**
 * Cloud Function to index a membership change by its transaction hash.
 *
 * Called by the mobile app after asking to join, or after an owner decides, so
 * the queue and the member's own status move without waiting for a sweep. Every
 * direction uses this one callable: the record written is the address's
 * standing afterwards either way, so nothing here needs to know which happened.
 *
 * Also fires after a deposit into an open pool, which enrols the depositor —
 * that transaction carries a `MemberJoined` alongside its `FundsDeposited`, and
 * the two are indexed by their own callables.
 *
 * @param {CallableRequest<IndexMembershipRequest>} request txHash and optional chainId
 * @returns {Promise<IndexMembershipResponse>} the affected memberships and how many records changed
 * @throws {HttpsError} If unauthenticated, invalid args, or indexing fails
 */
export const indexMembership = onCall<IndexMembershipRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  indexMembershipHandler
)
