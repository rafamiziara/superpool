import { ListMembersRequest, ListMembersResponse } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, MEMBERSHIPS_COLLECTION } from '../../constants'
import { listMembersSchema } from '../../schemas'
import { firestore } from '../../services'
import { parseRequest } from '../../utils/validation'

/** Mirrors the cap in the Firestore rules, which reject a larger `list`. */
const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export const listMembersHandler = async (request: CallableRequest<ListMembersRequest>): Promise<ListMembersResponse> => {
  // Gated like the other feeds: this says who belongs to whose private circle,
  // which is the one thing a permissioned pool exists to keep to itself.
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to list members')
  }

  // Outside the `try`: the catch below reports everything as `internal`, and a
  // malformed request is the caller's to fix rather than something to retry.
  const data = parseRequest(listMembersSchema, request.data)

  try {
    const limit = Math.min(MAX_LIMIT, data.limit ?? DEFAULT_LIMIT)
    const chainId = data.chainId ?? DEFAULT_CHAIN_ID
    // The indexer lowercases what it stores, so the filter must too — wallets
    // report addresses checksummed and would otherwise match nothing.
    const account = data.account?.toLowerCase()

    let query = firestore.collection(MEMBERSHIPS_COLLECTION).where('chainId', '==', chainId)

    if (data.poolId !== undefined) {
      query = query.where('poolId', '==', data.poolId)
    }

    if (account) {
      query = query.where('account', '==', account)
    }

    // Who is in the pool right now. Rejected, removed and departed addresses
    // keep their records as history, which is what lets the app tell "never
    // asked" from "asked and turned down".
    if (data.activeOnly) {
      query = query.where('status', '==', 'active')
    }

    // What a pool owner has to decide on.
    if (data.pendingOnly) {
      query = query.where('status', '==', 'requested')
    }

    const totalSnapshot = await query.count().get()
    const totalCount = totalSnapshot.data().count

    const snapshot = await query.orderBy('joinedAt', 'desc').limit(limit).get()

    const members = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        poolId: data.poolId,
        poolAddress: data.poolAddress,
        account: data.account,
        status: data.status,
        // ISO string, not a Date: the callable encoder turns a Date into `{}`.
        joinedAt: (data.joinedAt?.toDate() || new Date()).toISOString(),
        chainId: data.chainId,
        transactionHash: data.transactionHash,
        blockNumber: data.blockNumber,
      }
    })

    logger.info(`Retrieved ${members.length} members`, { totalCount, chainId, limit })

    return { members, totalCount, limit }
  } catch (error) {
    logger.error('Error listing members', {
      error: error instanceof Error ? error.message : String(error),
      params: data,
    })

    throw new HttpsError('internal', 'Failed to list members. Please try again.')
  }
}

/**
 * Cloud Function to list indexed pool memberships.
 *
 * Each record is an address's current standing rather than an event, so a
 * removed or rejected address stays in the list as history. `activeOnly`
 * narrows to who is in the pool now, `pendingOnly` to applicants awaiting the
 * pool owner.
 *
 * @param {CallableRequest<ListMembersRequest>} request Filtering options
 * @returns {Promise<ListMembersResponse>} Matching memberships, newest first
 * @throws {HttpsError} If unauthenticated or the query fails
 */
export const listMembers = onCall<ListMembersRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  listMembersHandler
)
