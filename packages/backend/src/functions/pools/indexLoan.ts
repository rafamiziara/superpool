import { IndexLoanRequest, IndexLoanResponse, LoanInfo, LoanRepaymentInfo } from '@superpool/types'
import { logger } from 'firebase-functions/v2'
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { DEFAULT_CHAIN_ID, getChainConfig } from '../../constants'
import { firestore } from '../../services'
import { indexLoansByTxHash, loanDocId, ParsedLoan } from '../../services/loanIndexer'
import { indexLoanRepaymentsByTxHash, loanRepaymentDocId, ParsedLoanRepaymentEvent } from '../../services/loanRepaymentIndexer'
import { getProvider } from '../../utils/blockchain'

const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/

/** Firestore's Date becomes an ISO string on the wire; see LoanInfo. */
function toLoanInfo(loan: ParsedLoan): LoanInfo {
  return {
    id: loanDocId(loan.chainId, loan.poolId, loan.loanId),
    loanId: loan.loanId,
    poolId: loan.poolId,
    poolAddress: loan.poolAddress,
    borrower: loan.borrower,
    amount: loan.amount,
    interestRate: loan.interestRate,
    duration: loan.duration,
    startedAt: loan.startedAt.toISOString(),
    isRepaid: loan.isRepaid,
    amountRepaid: loan.amountRepaid,
    status: loan.status,
    chainId: loan.chainId,
    transactionHash: loan.transactionHash,
    blockNumber: loan.blockNumber,
  }
}

/** Firestore's Date becomes an ISO string on the wire; see LoanRepaymentInfo. */
function toLoanRepaymentInfo(repayment: ParsedLoanRepaymentEvent): LoanRepaymentInfo {
  return {
    id: loanRepaymentDocId(repayment.chainId, repayment.transactionHash, repayment.logIndex),
    loanId: repayment.loanId,
    poolId: repayment.poolId,
    poolAddress: repayment.poolAddress,
    borrower: repayment.borrower,
    amount: repayment.amount,
    chainId: repayment.chainId,
    transactionHash: repayment.transactionHash,
    logIndex: repayment.logIndex,
    blockNumber: repayment.blockNumber,
    repaidAt: repayment.repaidAt.toISOString(),
  }
}

export const indexLoanHandler = async (request: CallableRequest<IndexLoanRequest>): Promise<IndexLoanResponse> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to index loans')
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

  logger.info('Indexing loan by transaction hash', { txHash, chainId })

  try {
    const provider = getProvider(chainId)
    const { loans, results } = await indexLoansByTxHash(txHash, chainId, chainConfig.poolFactoryAddress, provider, firestore)

    // After the loans, and in the same call: a repayment writes two records —
    // the loan's new `amountRepaid` and the instalment itself — and the app
    // knows only that it confirmed a transaction. Returns nothing for every
    // other loan event, so this costs a receipt fetch and no more.
    const { repayments, results: repaymentResults } = await indexLoanRepaymentsByTxHash(
      txHash,
      chainId,
      chainConfig.poolFactoryAddress,
      provider,
      firestore
    )

    const storedCount = results.filter((result) => result.stored).length + repaymentResults.filter((result) => result.stored).length

    logger.info('Loan indexing completed', { txHash, chainId, count: loans.length, repayments: repayments.length, storedCount })

    return {
      loans: loans.map(toLoanInfo),
      repayments: repayments.map(toLoanRepaymentInfo),
      storedCount,
      // True only when this call changed nothing at all.
      alreadyIndexed: storedCount === 0,
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error('Failed to index loan', {
      txHash,
      chainId,
      error: error instanceof Error ? error.message : String(error),
    })

    throw new HttpsError('internal', 'Failed to index loan. Please try again.')
  }
}

/**
 * Cloud Function to index a loan by its transaction hash.
 *
 * Called by the mobile app after a borrow or a repayment is confirmed, so the
 * loan appears — or moves — without waiting for a sweep. Both directions use
 * this one callable: the record written is the loan's state afterwards either
 * way, so nothing here needs to know which happened.
 *
 * A repayment is the one transaction that produces a second kind of record.
 * The loan gains a new `amountRepaid`, and the payment itself is appended to
 * `loan_repayments` — the only place an instalment is dated, since the loan
 * carries one `repaidAt` and it belongs to whichever payment closed the debt.
 *
 * @param {CallableRequest<IndexLoanRequest>} request txHash and optional chainId
 * @returns {Promise<IndexLoanResponse>} the affected loans and how many records changed
 * @throws {HttpsError} If unauthenticated, invalid args, or indexing fails
 */
export const indexLoan = onCall<IndexLoanRequest>(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
    cors: true,
  },
  indexLoanHandler
)
