import type { PreparePoolCreationRequest, PreparePoolCreationResponse } from '@superpool/types'
import { httpsCallable } from 'firebase/functions'
import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { FIREBASE_FUNCTIONS } from '../../config/firebase'
import { DEFAULT_CHAIN_ID, getPoolFactoryAddress } from '../../config/contracts'
import { PoolFactoryABI } from '../../constants/abis'
import { MAX_INTEREST_RATE_BPS } from '../../constants/pools'
import { pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { describeTransactionError } from './transactionErrors'

/**
 * Head-room added to the estimated gas. The estimate is taken against the
 * current block; by the time the user has approved in their wallet the pool
 * count has often moved, which changes the storage written.
 */
const GAS_BUFFER_PERCENT = 20n

export interface PoolCreationParams {
  name: string
  description: string
  /** Wei. */
  maxLoanAmount: bigint
  /** Basis points: 500 = 5%. */
  interestRate: number
  /** Seconds. */
  loanDuration: number
}

export interface UsePoolCreationReturn {
  /** Resolves to the transaction hash once the wallet has broadcast it. */
  createPool: (params: PoolCreationParams) => Promise<`0x${string}`>
  /** True while the backend is whitelisting the wallet. */
  isPreparing: boolean
  /** True while the wallet is signing and broadcasting. */
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

/** `PoolFactory`'s custom errors, in the wording a pool creator should see. */
const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  UnauthorizedCreator: 'This wallet is not authorised to create pools yet. Please try again in a moment.',
  InvalidMaxLoanAmount: 'Maximum loan amount must be greater than zero',
  InvalidInterestRate: 'Interest rate must be between 0% and 100%',
  InvalidLoanDuration: 'Loan duration must be greater than zero',
  EmptyName: 'Pool name is required',
  EnforcedPause: 'Pool creation is paused at the moment',
  ImplementationNotSet: 'The lending pool implementation is not configured on this network',
}

/**
 * Mirrors the checks in `PoolFactory.createPool` so an invalid form is rejected
 * before the user is asked to sign, instead of costing them a reverted
 * transaction. Returns the message to show, or `null` when the params are valid.
 */
export function validatePoolCreationParams(params: PoolCreationParams): string | null {
  if (!params.name.trim()) return 'Pool name is required'
  if (params.maxLoanAmount <= 0n) return 'Maximum loan amount must be greater than zero'
  if (!Number.isInteger(params.interestRate) || params.interestRate < 0) {
    return 'Interest rate must be a whole number of basis points'
  }
  if (params.interestRate > MAX_INTEREST_RATE_BPS) return 'Interest rate must be between 0% and 100%'
  if (!Number.isInteger(params.loanDuration) || params.loanDuration <= 0) {
    return 'Loan duration must be greater than zero'
  }

  return null
}

/** `PoolFactory`'s failures, in the wording a pool creator should see. */
export function describePoolCreationError(error: unknown): string {
  return describeTransactionError(error, CONTRACT_ERROR_MESSAGES, 'Failed to create pool')
}

/**
 * Creates a lending pool: the backend whitelists the wallet (paying that gas
 * itself), then the user sends `createPool` from their own wallet and the
 * transaction is recorded for monitoring.
 *
 * Validation failures throw without setting `error`, leaving field-level
 * messages to the form; everything after that sets `error` and rethrows.
 */
export const usePoolCreation = (): UsePoolCreationReturn => {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [isPreparing, setIsPreparing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setIsPreparing(false)
    setIsSubmitting(false)
    setError(null)
  }, [])

  const createPool = useCallback(
    async (params: PoolCreationParams): Promise<`0x${string}`> => {
      const validationError = validatePoolCreationParams(params)
      if (validationError) throw new Error(validationError)

      const activeChainId = chainId ?? DEFAULT_CHAIN_ID

      const fail = (message: string): never => {
        setError(message)
        setIsPreparing(false)
        setIsSubmitting(false)
        throw new Error(message)
      }

      if (!address) return fail('Connect a wallet before creating a pool')

      const factoryAddress = getPoolFactoryAddress(activeChainId)
      if (!factoryAddress) return fail('SuperPool is not deployed on the selected network')

      setError(null)
      setIsPreparing(true)

      try {
        const preparePoolCreation = httpsCallable<PreparePoolCreationRequest, PreparePoolCreationResponse>(
          FIREBASE_FUNCTIONS,
          'preparePoolCreation'
        )
        await preparePoolCreation({ chainId: activeChainId })
      } catch (prepareError) {
        return fail(describePoolCreationError(prepareError))
      }

      setIsPreparing(false)
      setIsSubmitting(true)

      const args = [
        {
          maxLoanAmount: params.maxLoanAmount,
          interestRate: BigInt(params.interestRate),
          loanDuration: BigInt(params.loanDuration),
          name: params.name,
          description: params.description,
        },
      ] as const

      try {
        // Estimating first turns a doomed transaction into a message rather than
        // a signature prompt the user pays for. Skipped when no client is
        // configured for the chain, leaving the estimate to the wallet.
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: factoryAddress,
            abi: PoolFactoryABI,
            functionName: 'createPool',
            args,
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: factoryAddress,
          abi: PoolFactoryABI,
          functionName: 'createPool',
          args,
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        // Recorded before returning so a kill straight after signing still leaves
        // the transaction recoverable at next launch.
        await pendingTransactionsStore.addPendingTransaction({
          txHash,
          chainId: activeChainId,
          type: 'CREATE_POOL',
          status: 'submitted',
          timestamp: Date.now(),
          params: {
            name: params.name,
            description: params.description,
            maxLoanAmount: params.maxLoanAmount.toString(),
            interestRate: params.interestRate,
            loanDuration: params.loanDuration,
          },
        })

        setIsSubmitting(false)

        return txHash
      } catch (submitError) {
        return fail(describePoolCreationError(submitError))
      }
    },
    [address, chainId, publicClient, writeContractAsync]
  )

  return { createPool, isPreparing, isSubmitting, error, reset }
}
