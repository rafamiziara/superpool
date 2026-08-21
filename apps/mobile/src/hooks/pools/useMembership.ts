import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { DEFAULT_CHAIN_ID } from '../../config/contracts'
import { LendingPoolABI } from '../../constants/abis'
import { type MembershipTransactionType, pendingTransactionsStore } from '../../stores/PendingTransactionsStore'
import { describeTransactionError } from './transactionErrors'

/**
 * Head-room added to the estimated gas. Every call here writes one enum and a
 * counter, so the estimate is small and stable — but it is still taken a block
 * or more before the wallet broadcasts.
 */
const GAS_BUFFER_PERCENT = 20n

/** Asking to join, or leaving: the sender acts on their own membership. */
export interface MembershipParams {
  poolId: number
  poolAddress: `0x${string}`
  /** Denormalised onto the pending record so a card can name the pool at startup. */
  poolName: string
}

/**
 * The owner deciding about somebody else.
 *
 * `account` is carried rather than read because the pending card has to name
 * whose membership is being changed before anything is indexed.
 */
export interface MemberDecisionParams extends MembershipParams {
  /** The address being admitted, turned down or removed. */
  account: `0x${string}`
}

export interface UseMembershipReturn {
  /** Resolves to the transaction hash once the wallet has broadcast it. */
  requestMembership: (params: MembershipParams) => Promise<`0x${string}`>
  /** Owner only: admits an applicant. */
  approveMember: (params: MemberDecisionParams) => Promise<`0x${string}`>
  /** Owner only: turns an applicant down. They may ask again. */
  rejectMember: (params: MemberDecisionParams) => Promise<`0x${string}`>
  /** Owner only: removes a member. Their balance stays withdrawable. */
  removeMember: (params: MemberDecisionParams) => Promise<`0x${string}`>
  /** The member's own counterpart to removal. */
  leavePool: (params: MembershipParams) => Promise<`0x${string}`>
  /** True while the wallet is signing and broadcasting. */
  isSubmitting: boolean
  error: string | null
  reset: () => void
}

/**
 * `AlreadyMember` covers two cases the contract does not distinguish — already
 * in, or already waiting — so the wording has to cover both without claiming
 * either.
 */
const REQUEST_ERROR_MESSAGES: Record<string, string> = {
  AlreadyMember: 'You are already a member of this pool, or waiting on a decision',
  PoolNotActive: 'This pool is not accepting members at the moment',
  EnforcedPause: 'This pool is not accepting members at the moment',
}

/**
 * The owner's side.
 *
 * `NoPendingRequest` is the one that will actually be hit: two owners on one
 * pool, or an applicant asking again while a decision is in flight, both land
 * here — so it has to read as a race rather than a fault.
 */
const DECIDE_ERROR_MESSAGES: Record<string, string> = {
  NoPendingRequest: 'This request has already been decided',
  OwnableUnauthorizedAccount: 'Only the pool owner can decide who joins',
  EnforcedPause: 'This pool is not processing decisions at the moment',
}

const REMOVE_ERROR_MESSAGES: Record<string, string> = {
  NotAMember: 'They are not a member of this pool',
  OwnableUnauthorizedAccount: 'Only the pool owner can remove members',
  EnforcedPause: 'This pool is not processing changes at the moment',
}

const LEAVE_ERROR_MESSAGES: Record<string, string> = {
  NotAMember: 'You are not a member of this pool',
  EnforcedPause: 'This pool is not processing changes at the moment',
}

export function describeRequestMembershipError(error: unknown): string {
  return describeTransactionError(error, REQUEST_ERROR_MESSAGES, 'Failed to send the request')
}

export function describeDecideMemberError(error: unknown): string {
  return describeTransactionError(error, DECIDE_ERROR_MESSAGES, 'Failed to decide on the request')
}

export function describeRemoveMemberError(error: unknown): string {
  return describeTransactionError(error, REMOVE_ERROR_MESSAGES, 'Failed to remove the member')
}

export function describeLeavePoolError(error: unknown): string {
  return describeTransactionError(error, LEAVE_ERROR_MESSAGES, 'Failed to leave the pool')
}

/**
 * Every way a membership changes, sent from the user's own wallet.
 *
 * One hook rather than five because it is a single lifecycle: the contract
 * holds one `Membership` per address per pool, so asking, being admitted,
 * turned down, removed or leaving are all the same slot in different states.
 *
 * Whether a pool uses any of this is its own `requiresMembership` setting. With
 * it off, depositing enrols the depositor and none of these calls is needed;
 * with it on, `depositFunds` reverts for anyone who is not `Active` and the
 * flow is `requestMembership` → `approveMember` / `rejectMember`. Read the flag
 * from the chain rather than from indexed data — the owner can change it at any
 * time and nothing indexes it.
 *
 * Nothing here moves money, which is what separates it from `useLoan`: removal
 * and leaving both leave the member's contribution untouched and withdrawable.
 */
export const useMembership = (): UseMembershipReturn => {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setIsSubmitting(false)
    setError(null)
  }, [])

  /**
   * Every membership call takes either nothing or one address, and differs only
   * in the function called, the wording of a failure and the type recorded.
   *
   * Factored for the same reason `sendLoanDecision` is: writing the estimate and
   * the pending record out five times is how one of them ends up missing.
   */
  const send = useCallback(
    async (
      params: MembershipParams & { account?: `0x${string}` },
      functionName: 'requestMembership' | 'approveMember' | 'rejectMember' | 'removeMember' | 'leavePool',
      type: MembershipTransactionType,
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

      // The self-serve calls take no arguments; the owner's take the address
      // being decided. Built once so the estimate and the write cannot disagree.
      const args = (params.account === undefined ? [] : [params.account]) as [] | [`0x${string}`]

      try {
        // The estimate is what catches an applicant someone else already
        // decided, and a caller who is not the owner. Both revert, and both are
        // worth catching before the user is asked to sign.
        let gas: bigint | undefined
        if (publicClient) {
          const estimate = await publicClient.estimateContractGas({
            address: params.poolAddress,
            abi: LendingPoolABI,
            functionName,
            args,
            account: address,
          })
          gas = estimate + (estimate * GAS_BUFFER_PERCENT) / 100n
        }

        const txHash = await writeContractAsync({
          address: params.poolAddress,
          abi: LendingPoolABI,
          functionName,
          args,
          chainId: activeChainId,
          ...(gas === undefined ? {} : { gas }),
        })

        // Recorded before returning so a kill straight after signing still
        // leaves the transaction recoverable at next launch.
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
            ...(params.account === undefined ? {} : { account: params.account }),
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

  const requestMembership = useCallback(
    (params: MembershipParams): Promise<`0x${string}`> =>
      send(params, 'requestMembership', 'REQUEST_MEMBERSHIP', describeRequestMembershipError, 'Connect a wallet before asking to join'),
    [send]
  )

  const approveMember = useCallback(
    (params: MemberDecisionParams): Promise<`0x${string}`> =>
      send(params, 'approveMember', 'APPROVE_MEMBER', describeDecideMemberError, 'Connect a wallet before approving'),
    [send]
  )

  const rejectMember = useCallback(
    (params: MemberDecisionParams): Promise<`0x${string}`> =>
      send(params, 'rejectMember', 'REJECT_MEMBER', describeDecideMemberError, 'Connect a wallet before deciding'),
    [send]
  )

  const removeMember = useCallback(
    (params: MemberDecisionParams): Promise<`0x${string}`> =>
      send(params, 'removeMember', 'REMOVE_MEMBER', describeRemoveMemberError, 'Connect a wallet before removing a member'),
    [send]
  )

  const leavePool = useCallback(
    (params: MembershipParams): Promise<`0x${string}`> =>
      send(params, 'leavePool', 'LEAVE_POOL', describeLeavePoolError, 'Connect a wallet before leaving'),
    [send]
  )

  return { requestMembership, approveMember, rejectMember, removeMember, leavePool, isSubmitting, error, reset }
}
