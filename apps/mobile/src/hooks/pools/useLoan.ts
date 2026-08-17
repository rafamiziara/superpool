import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { LendingPoolABI } from '../../constants/abis'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { describeTransactionError } from './transactionErrors'

/**
 * Head-room added to the estimated gas. Every call here writes a handful of
 * storage slots and at most one transfer, so the estimate is small and stable —
 * but it is still taken a block or more before the wallet broadcasts.
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
  /** Per-pool loan id — `repayLoan` takes the id; the payment is the `value`. */
  loanId: number
  /**
   * What to pay, in wei. Sent as `value`.
   *
   * Any amount above zero is accepted: the contract credits it against the
   * debt and closes the loan only when the whole of it has been paid. Anything
   * beyond what is still owed is refunded in the same transaction, so
   * overpaying costs only gas.
   */
  amount: bigint
}

/**
 * Acting on a request that already exists: approving, rejecting or withdrawing
 * it.
 *
 * The amount is carried rather than read, because the pending card has to name
 * it before anything is indexed. `borrower` is set only on the owner's
 * decisions — on the borrower's own cancellation it would just repeat the
 * sender.
 */
export interface LoanDecisionParams {
  poolId: number
  poolAddress: `0x${string}`
  poolName: string
  /** The request being acted on. */
  loanId: number
  /** Principal requested, in wei. Nothing moves for a rejection or a cancellation. */
  amount: bigint
  /** Whose request this is. Set by the owner's screens; omitted by the borrower's. */
  borrower?: string
}

export interface UseLoanReturn {
  /** Resolves to the transaction hash once the wallet has broadcast it. */
  borrow: (params: BorrowParams) => Promise<`0x${string}`>
  repay: (params: RepayParams) => Promise<`0x${string}`>
  /** Asks a pool that reviews before it lends. Same params as borrowing — nothing moves yet. */
  requestLoan: (params: BorrowParams) => Promise<`0x${string}`>
  /** Owner only: approves a request, which disburses in the same transaction. */
  approveLoan: (params: LoanDecisionParams) => Promise<`0x${string}`>
  /** Owner only: turns a request down. */
  rejectLoan: (params: LoanDecisionParams) => Promise<`0x${string}`>
  /** Borrower only: withdraws their own request before it is decided. */
  cancelLoanRequest: (params: LoanDecisionParams) => Promise<`0x${string}`>
  /** True while the wallet is signing and broadcasting. */
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

/**
 * What a loan costs if it runs exactly its term and is repaid once.
 *
 * The **quoted price, not the bill**: `interestRate` basis points buys the
 * pool's `loanDuration`, so this is what borrowing costs held exactly that
 * long. Repaying sooner costs less and later costs more.
 *
 * Matches the contract's `calculateRepaymentAmount`, and is what the borrow
 * form states before anyone signs. What is owed at a given moment is a
 * different question, and only the chain can answer it — see
 * `settlementQuote`.
 */
export function calculateRepayment(amount: bigint, interestRate: number): bigint {
  return amount + (amount * BigInt(interestRate)) / BASIS_POINTS
}

/**
 * How far ahead a settlement is quoted.
 *
 * Interest accrues per second, so a payment of exactly what is owed *now*
 * arrives a block or two late and leaves the loan a few seconds short of
 * settled — which looks like success and is not. An hour covers any realistic
 * gap between reading the balance, signing in a wallet and the block being
 * mined.
 */
export const SETTLEMENT_BUFFER_SECONDS = 3600n

/**
 * What to send to close a loan in one transaction.
 *
 * The debt plus an hour of accrual on the principal still out. **Overshooting
 * is free** — `repayLoan` credits only what is owed and refunds the rest — so
 * this errs upwards on purpose, and being approximate here is harmless in a
 * way it would never be for the debt itself.
 *
 * That is why the buffer is computed locally rather than read from the
 * contract's `outstandingBalanceAt`: quoting a moving timestamp would change
 * the call's arguments on every render, and nothing here needs to be exact.
 * The `principal` and `interest` it starts from must still come from the
 * chain.
 */
export function settlementQuote(principal: bigint, interest: bigint, interestRate: number, loanDuration: number): bigint {
  if (loanDuration <= 0) return principal + interest

  const buffer = (principal * BigInt(interestRate) * SETTLEMENT_BUFFER_SECONDS) / (BASIS_POINTS * BigInt(loanDuration))

  return principal + interest + buffer
}

/**
 * `LendingPool`'s custom errors, in the wording a borrower should see.
 *
 * `UnauthorizedBorrower` means two different things depending on the call, and
 * the wording has to pick one: on `createLoan` it is fired when the caller is
 * not a member, which is the case a borrower will actually hit. On `repayLoan`
 * it means the loan is someone else's, which the UI does not let you reach.
 *
 * "Not a member" is the honest wording since the gate became the register: in
 * an open pool the way in is still to contribute, but in a private one the
 * owner has to admit you and no amount of depositing would help.
 */
const BORROW_ERROR_MESSAGES: Record<string, string> = {
  UnauthorizedBorrower: 'Join this pool before borrowing from it',
  LoanOutstanding: 'Repay your current loan from this pool first',
  ExceedsMaxLoanAmount: 'That is more than this pool lends at once',
  InsufficientFunds: 'The pool does not have that much available right now',
  PoolNotActive: 'This pool is not lending at the moment',
  EnforcedPause: 'This pool is not lending at the moment',
  TransferFailed: 'The transfer to your wallet failed',
  // Only reachable if the owner turned review on between the screen reading
  // `requiresApproval` and the user signing. The app routes to `requestLoan` on
  // this, so the wording is a fallback rather than something normally seen.
  ApprovalRequired: 'This pool now reviews requests before lending',
}

/**
 * `InsufficientRepaymentAmount` is deliberately absent: the contract no longer
 * has that error, because there is no longer a minimum. Any amount above zero
 * is a payment, and zero is `InvalidAmount`.
 */
const REPAY_ERROR_MESSAGES: Record<string, string> = {
  UnauthorizedBorrower: 'This loan belongs to another wallet',
  LoanAlreadyRepaid: 'This loan has already been repaid',
  LoanNotDisbursed: 'Nothing has been lent on this request yet',
  InvalidAmount: 'Enter an amount greater than zero',
  EnforcedPause: 'This pool is not processing repayments at the moment',
}

/**
 * Requesting is borrowing minus the liquidity rules.
 *
 * `InsufficientFunds` is deliberately absent: the contract does not check the
 * balance at request time, because the pool that is empty now may be fundable
 * by the time the owner decides.
 */
const REQUEST_ERROR_MESSAGES: Record<string, string> = {
  UnauthorizedBorrower: 'Join this pool before asking to borrow from it',
  LoanOutstanding: 'You already have a loan or a request in this pool',
  ExceedsMaxLoanAmount: 'That is more than this pool lends at once',
  InvalidAmount: 'Enter an amount greater than zero',
  PoolNotActive: 'This pool is not lending at the moment',
  EnforcedPause: 'This pool is not lending at the moment',
}

/**
 * The owner's side.
 *
 * `LoanNotPending` is the one that will actually be hit: two owners on one pool,
 * or a borrower cancelling while the decision is in flight, both land here — so
 * it has to read as a race rather than a fault.
 */
const APPROVE_ERROR_MESSAGES: Record<string, string> = {
  LoanNotPending: 'This request has already been decided',
  InsufficientFunds: 'The pool does not have that much available right now',
  OwnableUnauthorizedAccount: 'Only the pool owner can approve requests',
  EnforcedPause: 'This pool is not lending at the moment',
  TransferFailed: 'The transfer to the borrower failed',
}

const REJECT_ERROR_MESSAGES: Record<string, string> = {
  LoanNotPending: 'This request has already been decided',
  OwnableUnauthorizedAccount: 'Only the pool owner can decide on requests',
  EnforcedPause: 'This pool is not processing decisions at the moment',
}

const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  LoanNotPending: 'This request has already been decided',
  UnauthorizedBorrower: 'This request belongs to another wallet',
  EnforcedPause: 'This pool is not processing requests at the moment',
}

export function describeBorrowError(error: unknown): string {
  return describeTransactionError(error, BORROW_ERROR_MESSAGES, 'Failed to borrow')
}

export function describeRepayError(error: unknown): string {
  return describeTransactionError(error, REPAY_ERROR_MESSAGES, 'Failed to repay')
}

export function describeRequestError(error: unknown): string {
  return describeTransactionError(error, REQUEST_ERROR_MESSAGES, 'Failed to send the request')
}

export function describeApproveError(error: unknown): string {
  return describeTransactionError(error, APPROVE_ERROR_MESSAGES, 'Failed to approve the request')
}

export function describeRejectError(error: unknown): string {
  return describeTransactionError(error, REJECT_ERROR_MESSAGES, 'Failed to turn down the request')
}

export function describeCancelError(error: unknown): string {
  return describeTransactionError(error, CANCEL_ERROR_MESSAGES, 'Failed to withdraw the request')
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
 * Every way a loan moves, sent from the user's own wallet.
 *
 * One hook rather than six because it is a single lifecycle: the contract holds
 * one `activeLoanId` per member per pool, so borrowing, requesting, cancelling
 * and repaying are all the same slot in different states, and the owner's two
 * decisions are what move it between them. They share every mechanic below the
 * call.
 *
 * Which path a pool takes is its own `requiresApproval` setting: with it off,
 * `createLoan` pays out immediately; with it on, that call reverts and the flow
 * is `requestLoan` → `approveLoan` / `rejectLoan`. Read the flag from the chain
 * rather than from indexed data — it can be changed at any time by the owner.
 *
 * There is no backend preparation step, as with contributions and withdrawals —
 * the borrower is spending against their own recorded contribution and the
 * owner against their own pool, so there is nothing to authorise off chain.
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
            abi: LendingPoolABI,
            functionName: 'createLoan',
            args: [params.amount],
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: LendingPoolABI,
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
        // `repayLoan` is payable, so the value is part of the estimate. It no
        // longer catches an underfunded repayment — there is no such thing now
        // — but it still catches a loan that belongs to someone else, one
        // already settled, and a paused pool.
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: params.poolAddress,
            abi: LendingPoolABI,
            functionName: 'repayLoan',
            args: [BigInt(params.loanId)],
            account: address,
            value: params.amount,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: LendingPoolABI,
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

  /**
   * Every call below sends one loan id and moves the request to its next state.
   *
   * Factored because the four differ only in the function called, the wording of
   * a failure, the transaction type recorded and — for approval — that money
   * moves. The mechanics either side of that are identical, and writing them out
   * four more times is how the estimate or the pending record goes missing from
   * one of them.
   */
  const sendLoanDecision = useCallback(
    async (
      params: LoanDecisionParams,
      functionName: 'approveLoan' | 'rejectLoan' | 'cancelLoanRequest',
      type: 'APPROVE_LOAN' | 'REJECT_LOAN' | 'CANCEL_LOAN_REQUEST',
      describe: (error: unknown) => string,
      notConnected: string
    ): Promise<`0x${string}`> => {
      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail(notConnected)

      setError(null)
      setIsSubmitting(true)

      try {
        // The estimate is what catches a request someone else already decided,
        // and — on approval — a pool that cannot cover it. Both revert, and both
        // are worth catching before the user is asked to sign.
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: params.poolAddress,
            abi: LendingPoolABI,
            functionName,
            args: [BigInt(params.loanId)],
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: LendingPoolABI,
          functionName,
          args: [BigInt(params.loanId)],
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        await pendingTransactionsStore.addPendingTransaction({
          txHash,
          chainId: activeChainId,
          type,
          status: 'submitted',
          timestamp: Date.now(),
          params: {
            poolId: params.poolId,
            poolAddress: params.poolAddress,
            poolName: params.poolName,
            amount: params.amount.toString(),
            loanId: params.loanId,
            ...(params.borrower === undefined ? {} : { borrower: params.borrower }),
          },
        })

        setIsSubmitting(false)

        return txHash
      } catch (submitError) {
        return fail(describe(submitError))
      }
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  /**
   * Asking a pool that reviews before it lends.
   *
   * Deliberately not folded into `borrow` behind a flag: the two produce
   * different outcomes from the user's point of view — funds now, or an answer
   * later — and the screen already knows which it is from the pool's
   * `requiresApproval`.
   *
   * The pool's liquidity is not checked, here or in the contract: what matters
   * is whether it can cover the loan when the owner decides, not now.
   */
  const requestLoan = useCallback(
    async (params: BorrowParams): Promise<`0x${string}`> => {
      const validationError = validateBorrowParams(params)
      if (validationError) throw new Error(validationError)

      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail('Connect a wallet before requesting a loan')

      setError(null)
      setIsSubmitting(true)

      try {
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: params.poolAddress,
            abi: LendingPoolABI,
            functionName: 'requestLoan',
            args: [params.amount],
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: LendingPoolABI,
          functionName: 'requestLoan',
          args: [params.amount],
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        // No `loanId`: a request is assigned one by the contract, exactly as a
        // borrow is, and it comes back on the receipt.
        await pendingTransactionsStore.addPendingTransaction({
          txHash,
          chainId: activeChainId,
          type: 'REQUEST_LOAN',
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
        return fail(describeRequestError(submitError))
      }
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  const approveLoan = useCallback(
    (params: LoanDecisionParams): Promise<`0x${string}`> =>
      sendLoanDecision(params, 'approveLoan', 'APPROVE_LOAN', describeApproveError, 'Connect a wallet before approving'),
    [sendLoanDecision]
  )

  const rejectLoan = useCallback(
    (params: LoanDecisionParams): Promise<`0x${string}`> =>
      sendLoanDecision(params, 'rejectLoan', 'REJECT_LOAN', describeRejectError, 'Connect a wallet before deciding'),
    [sendLoanDecision]
  )

  const cancelLoanRequest = useCallback(
    (params: LoanDecisionParams): Promise<`0x${string}`> =>
      sendLoanDecision(
        params,
        'cancelLoanRequest',
        'CANCEL_LOAN_REQUEST',
        describeCancelError,
        'Connect a wallet before withdrawing your request'
      ),
    [sendLoanDecision]
  )

  return { borrow, repay, requestLoan, approveLoan, rejectLoan, cancelLoanRequest, isSubmitting, error, reset }
}
