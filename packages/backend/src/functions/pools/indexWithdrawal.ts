import { IndexWithdrawalRequest, IndexWithdrawalResponse, WithdrawalInfo } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, getChainConfig } from '../../constants'
import { indexByTransactionSchema } from '../../schemas'
import { firestore } from '../../services'
import { indexWithdrawalsByTxHash, ParsedWithdrawalEvent, withdrawalDocId } from '../../services/withdrawalIndexer'
import { parseRequest } from '../../utils/validation'
import { getProvider } from '../../utils/blockchain'

/** Firestore's Date becomes an ISO string on the wire; see WithdrawalInfo. */
function toWithdrawalInfo(withdrawal: ParsedWithdrawalEvent): WithdrawalInfo {
  return {
    id: withdrawalDocId(withdrawal.chainId, withdrawal.transactionHash, withdrawal.logIndex),
    poolId: withdrawal.poolId,
    poolAddress: withdrawal.poolAddress,
    member: withdrawal.member,
    amount: withdrawal.amount,
    chainId: withdrawal.chainId,
    transactionHash: withdrawal.transactionHash,
    logIndex: withdrawal.logIndex,
    blockNumber: withdrawal.blockNumber,
    withdrawnAt: withdrawal.withdrawnAt.toISOString(),
  }
}

export const indexWithdrawalHandler = async (request: CallableRequest<IndexWithdrawalRequest>): Promise<IndexWithdrawalResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to index withdrawals')
  }

  const { txHash, chainId: requestedChainId } = parseRequest(indexByTransactionSchema, request.data)

  const chainId = requestedChainId ?? DEFAULT_CHAIN_ID
  const chainConfig = getChainConfig(chainId)

  if (!chainConfig) {
    throw new HttpsError('invalid-argument', `Unsupported chain ID: ${chainId}`)
  }

  // The factory is what maps a pool address back to its id, and what proves the
  // address is a pool of ours at all.
  if (!chainConfig.poolFactoryAddress) {
    throw new HttpsError('internal', `PoolFactory address not configured for chain ${chainId}`)
  }

  logger.info('Indexing withdrawal by transaction hash', { txHash, chainId })

  try {
    const provider = getProvider(chainId)
    const { withdrawals, results } = await indexWithdrawalsByTxHash(txHash, chainId, chainConfig.poolFactoryAddress, provider, firestore)

    const storedCount = results.filter((result) => result.stored).length

    logger.info('Withdrawal indexing completed', {
      txHash,
      chainId,
      count: withdrawals.length,
      storedCount,
    })

    return {
      withdrawals: withdrawals.map(toWithdrawalInfo),
      storedCount,
      // True only when this call wrote nothing at all.
      alreadyIndexed: storedCount === 0,
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error('Failed to index withdrawal', {
      txHash,
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to index withdrawal. Please try again.')
  }
}

/**
 * Cloud Function to index a liquidity withdrawal by its transaction hash.
 *
 * Called by the mobile app immediately after a `withdraw` transaction is
 * confirmed, so the member's position drops without waiting for a sync.
 *
 * @param {CallableRequest<IndexWithdrawalRequest>} request txHash and optional chainId
 * @returns {Promise<IndexWithdrawalResponse>} the indexed withdrawals and how many were new
 * @throws {HttpsError} If unauthenticated, invalid args, or indexing fails
 */
export const indexWithdrawal = onCall<IndexWithdrawalRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  indexWithdrawalHandler
)
