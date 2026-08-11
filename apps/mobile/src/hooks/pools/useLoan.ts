import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { SampleLendingPoolABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { describeTransactionError } from './transactionErrors'

/**
 * Head-room added to the estimated gas. Both calls write a handful of storage
 * slots and make one transfer, so the estimate is small and stable — but it is
 * still taken a block or more before the wallet broadcasts.
 */
const GAS_BUFFER_PERCENT = 20n

/** Basis points, as the contract stores an interest rate. */
const BASIS_POINTS = 10_000n

export interface BorrowParams {
  poolId: number
  poolAddress: `0x${string}`
  /** Denormalised onto the pending record so a card can name the pool at startup. */
  poolName: string
  /** Principal, in wei. */
  amount: bigint
}

export interface RepayParams {
  poolId: number
  poolAddress: `0x${string}`
  poolName: string
  /** Per-pool loan id — `repayLoan` takes the id, not an amount. */
  loanId: number
  /** Total due in wei: principal plus interest. Sent as `value`. */
  amount: bigint
}

export interface UseLoanReturn {
  /** Resolves to the transaction hash once the wallet has broadcast it. */
  borrow: (params: BorrowParams) => Promise<`0x${string}`>
  repay: (params: RepayParams) => Promise<`0x${string}`>
  /** True while the wallet is signing and broadcasting. */
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

/**
 * What a loan costs to settle: principal plus flat interest.
 *
 * Not accrued over time — the contract computes `amount * rate / 10000` once
 * and the figure never changes, so repaying early costs exactly the same as
 * repaying on the due date. The app must send at least this much as `value`;
 * `repayLoan` reverts on anything less.
 */
export function calculateRepayment(amount: bigint, interestRate: number): bigint {
  return amount + (amount * BigInt(interestRate)) / BASIS_POINTS
}

/**
 * `SampleLendingPool`'s custom errors, in the wording a borrower should see.
 *
 * `UnauthorizedBorrower` means two different things depending on the call, and
 * the wording has to pick one: on `createLoan` it is fired when the caller has
 * never contributed, which is the case a borrower will actually hit. On
 * `repayLoan` it means the loan is someone else's, which the UI does not let
 * you reach.
 */
const BORROW_ERROR_MESSAGES: Record<string, string> = {
  UnauthorizedBorrower: 'Contribute to this pool before borrowing from it',
  LoanOutstanding: 'Repay your current loan from this pool first',
  ExceedsMaxLoanAmount: 'That is more than this pool lends at once',
  InsufficientFunds: 'The pool does not have that much available right now',
  PoolNotActive: 'This pool is not lending at the moment',
  EnforcedPause: 'This pool is not lending at the moment',
  TransferFailed: 'The transfer to your wallet failed',
}

const REPAY_ERROR_MESSAGES: Record<string, string> = {
  UnauthorizedBorrower: 'This loan belongs to another wallet',
  LoanAlreadyRepaid: 'This loan has already been repaid',
  InsufficientRepaymentAmount: 'That is less than the full amount due',
  EnforcedPause: 'This pool is not processing repayments at the moment',
}

export function describeBorrowError(error: unknown): string {
  return describeTransactionError(error, BORROW_ERROR_MESSAGES, 'Failed to borrow')
}

export function describeRepayError(error: unknown): string {
  return describeTransactionError(error, REPAY_ERROR_MESSAGES, 'Failed to repay')
}

/**
 * Mirrors the contract's checks so an impossible request is rejected before the
 * user is asked to sign, rather than costing them a reverted transaction.
 * Returns the message to show, or `null` when the params are valid.
 *
 * `available` is the pool's liquidity and `maxLoanAmount` its per-loan cap;
 * both are the chain's figures, so pass values read from the contract rather
 * than ones derived from indexed events, which lag.
 */
export function validateBorrowParams(params: BorrowParams, limits: { maxLoanAmount?: bigint; available?: bigint } = {}): string | null {
  if (params.amount <= 0n) return 'Enter an amount greater than zero'
  if (limits.maxLoanAmount !== undefined && params.amount > limits.maxLoanAmount) {
    return 'That is more than this pool lends at once'
  }
  if (limits.available !== undefined && params.amount > limits.available) {
    return 'The pool does not have that much available right now'
  }

  return null
}

/**
 * Borrowing from and repaying to a pool, both sent from the user's own wallet.
 *
 * One hook rather than two because the pair is a single lifecycle: the contract
 * allows one open loan per member per pool, so a screen that can borrow is the
 * same screen that can repay, and they share every mechanic below the call.
 *
 * There is no backend preparation step, as with contributions and withdrawals —
 * the borrower is spending against their own recorded contribution, so there is
 * nothing to authorise off chain.
 *
 * Validation failures throw without setting `error`, leaving field-level
 * messages to the form; everything after that sets `error` and rethrows.
 */
export const useLoan = (): UseLoanReturn => {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setIsSubmitting(false)
    setError(null)
  }, [])

  const borrow = useCallback(
    async (params: BorrowParams): Promise<`0x${string}`> => {
      const validationError = validateBorrowParams(params)
      if (validationError) throw new Error(validationError)

      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail('Connect a wallet before borrowing')

      setError(null)
      setIsSubmitting(true)

      try {
        // Estimating first turns a doomed transaction into a message rather than
        // a signature prompt the user pays for. It is also what catches the
        // membership rule, which the app cannot check without reading the chain.
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: params.poolAddress,
            abi: SampleLendingPoolABI,
            functionName: 'createLoan',
            args: [params.amount],
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: SampleLendingPoolABI,
          functionName: 'createLoan',
          args: [params.amount],
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        // Recorded before returning so a kill straight after signing still
        // leaves the transaction recoverable at next launch. No `loanId` yet —
        // the contract assigns it, and the receipt is where it comes back.
        await pendingTransactionsStore.addPendingTransaction({
          txHash,
          chainId: activeChainId,
          type: 'BORROW',
          status: 'submitted',
          timestamp: Date.now(),
          params: {
            poolId: params.poolId,
            poolAddress: params.poolAddress,
            poolName: params.poolName,
            amount: params.amount.toString(),
          },
        })

        setIsSubmitting(false)

        return txHash
      } catch (submitError) {
        return fail(describeBorrowError(submitError))
      }
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  const repay = useCallback(
    async (params: RepayParams): Promise<`0x${string}`> => {
      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail('Connect a wallet before repaying')

      setError(null)
      setIsSubmitting(true)

      try {
        // `repayLoan` is payable and reverts on anything less than the total, so
        // the value is part of the estimate — an underfunded repayment is caught
        // here rather than at the signature prompt.
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: params.poolAddress,
            abi: SampleLendingPoolABI,
            functionName: 'repayLoan',
            args: [BigInt(params.loanId)],
            account: address,
            value: params.amount,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: SampleLendingPoolABI,
          functionName: 'repayLoan',
          args: [BigInt(params.loanId)],
          value: params.amount,
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        await pendingTransactionsStore.addPendingTransaction({
          txHash,
          chainId: activeChainId,
          type: 'REPAY',
          status: 'submitted',
          timestamp: Date.now(),
          params: {
            poolId: params.poolId,
            poolAddress: params.poolAddress,
            poolName: params.poolName,
            amount: params.amount.toString(),
            loanId: params.loanId,
          },
        })

        setIsSubmitting(false)

        return txHash
      } catch (submitError) {
        return fail(describeRepayError(submitError))
      }
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  return { borrow, repay, isSubmitting, error, reset }
}
