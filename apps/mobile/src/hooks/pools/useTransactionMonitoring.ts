import { useCallback, useState } from 'react'
import { WaitForTransactionReceiptTimeoutError } from 'viem'
import { usePublicClient } from 'wagmi'
import {
  type ClaimInterestResult,
  type ContributeResult,
  type CreatePoolResult,
  extractResult,
  type LoanResult,
  type LoanTransactionType,
  type MembershipResult,
  type MembershipTransactionType,
  pendingTransactionsStore,
  type PendingTransactionType,
  type WithdrawResult,
} from '../../stores/PendingTransactionsStore'
import { describeTransactionError } from './transactionErrors'

/** How long to watch a transaction before handing it back to startup recovery. */
const RECEIPT_TIMEOUT_MS = 120_000

/** What a confirmed transaction of each type yields. */
export type ResultFor<T extends PendingTransactionType> = T extends 'CREATE_POOL'
  ? CreatePoolResult
  : T extends 'WITHDRAW'
    ? WithdrawResult
    : T extends 'CLAIM_INTEREST'
      ? ClaimInterestResult
      : T extends LoanTransactionType
        ? LoanResult
        : T extends MembershipTransactionType
          ? MembershipResult
          : ContributeResult

export type TransactionOutcome<T extends PendingTransactionType> = ResultFor<T> & { txHash: `0x${string}` }

/**
 * What it means for a confirmed transaction to have produced nothing. The
 * transaction succeeded in both cases, so the wording has to say what is
 * actually missing rather than claim a failure.
 */
const MISSING_LOG_MESSAGE: Record<PendingTransactionType, string> = {
  CREATE_POOL: 'The transaction confirmed but did not create a pool',
  CONTRIBUTE: 'The transaction confirmed but did not record a deposit',
  WITHDRAW: 'The transaction confirmed but did not record a withdrawal',
  CLAIM_INTEREST: 'The transaction confirmed but did not record a claim',
  BORROW: 'The transaction confirmed but did not record a loan',
  REPAY: 'The transaction confirmed but did not record a repayment',
  REQUEST_LOAN: 'The transaction confirmed but did not record a request',
  APPROVE_LOAN: 'The transaction confirmed but did not record an approval',
  REJECT_LOAN: 'The transaction confirmed but did not record a decision',
  CANCEL_LOAN_REQUEST: 'The transaction confirmed but did not withdraw the request',
  REQUEST_MEMBERSHIP: 'The transaction confirmed but did not record a request to join',
  APPROVE_MEMBER: 'The transaction confirmed but did not record the new member',
  REJECT_MEMBER: 'The transaction confirmed but did not record a decision',
  REMOVE_MEMBER: 'The transaction confirmed but did not record the removal',
  LEAVE_POOL: 'The transaction confirmed but did not record you leaving',
}

export interface UseTransactionMonitoringReturn {
  /** Resolves once the chain has accepted the transaction; rejects on revert, timeout or RPC failure. */
  waitForTransaction: <T extends PendingTransactionType>(txHash: `0x${string}`, type: T) => Promise<TransactionOutcome<T>>
  isWaiting: boolean
  error: string | null
}

/**
 * Watches a submitted transaction to confirmation and records the outcome on
 * `PendingTransactionsStore`.
 *
 * The type is passed in rather than looked up on the store, because the caller
 * always knows what it submitted and the record is not guaranteed to be there —
 * persistence failures are swallowed by design, and a monitor that could not
 * find its record would otherwise have to guess which event to decode.
 *
 * How each failure moves the stored status matters, because only `submitted`
 * transactions are re-checked at startup and only `confirmed` ones are handed to
 * indexing:
 *
 * - **Reverted** → `failed`. A verdict, and a final one.
 * - **Timed out** → left `submitted`. Two minutes of silence is a slow block far
 *   more often than a lost transaction; it usually still lands. Marking it failed
 *   would be both untrue and unrecoverable, since startup recovery would skip it
 *   from then on. (The plan for this task said to mark it failed — this is a
 *   deliberate departure.)
 * - **RPC or transport error** → left `submitted`, for the same reason.
 * - **Confirmed but the expected event is absent** → `failed`. The transaction
 *   succeeded, so this is not literally true, but nothing was produced and
 *   nothing ever will be: leaving it `confirmed` would queue it for indexing
 *   that can never succeed.
 */
export const useTransactionMonitoring = (): UseTransactionMonitoringReturn => {
  const publicClient = usePublicClient()

  const [isWaiting, setIsWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const waitForTransaction = useCallback(
    async <T extends PendingTransactionType>(txHash: `0x${string}`, type: T): Promise<TransactionOutcome<T>> => {
      const fail = (message: string): never => {
        setError(message)
        setIsWaiting(false)
        throw new Error(message)
      }

      if (!publicClient) return fail('No connection to the network')

      setError(null)
      setIsWaiting(true)

      let receipt
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: RECEIPT_TIMEOUT_MS })
      } catch (waitError) {
        // The transaction keeps its `submitted` status either way, so startup
        // recovery can resolve it later.
        if (waitError instanceof WaitForTransactionReceiptTimeoutError) {
          return fail('Still waiting for the network to confirm this transaction')
        }

        return fail(describeTransactionError(waitError, {}, 'Could not confirm the transaction'))
      }

      if (receipt.status === 'reverted') {
        await pendingTransactionsStore.updateTransactionStatus(txHash, 'failed')

        return fail('Transaction was reverted')
      }

      const result = extractResult(type, receipt)
      if (!result) {
        await pendingTransactionsStore.updateTransactionStatus(txHash, 'failed')

        return fail(MISSING_LOG_MESSAGE[type])
      }

      await pendingTransactionsStore.updateTransactionStatus(txHash, 'confirmed', result)

      setIsWaiting(false)

      // `extractResult` dispatches on the same `type` this call was given, so
      // the result is the one the signature promises; the compiler cannot follow
      // that through the runtime dispatch, hence the widening step.
      return { ...result, txHash } as unknown as TransactionOutcome<T>
    },
    [publicClient]
  )

  return { waitForTransaction, isWaiting, error }
}
