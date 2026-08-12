import { FontAwesome } from '@expo/vector-icons'
import { observer } from 'mobx-react-lite'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useAccount, useReadContract } from 'wagmi'
import { SampleLendingPoolABI } from '../../constants/abis'
import { palette } from '../../constants/palette'
import { useInterest } from '../../hooks/pools/useInterest'
import { usePoolIndexing } from '../../hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../hooks/pools/useTransactionMonitoring'
import { poolStore } from '../../stores/PoolStore'
import { formatToken } from '../../utils/format'

export interface ClaimInterestCardProps {
  poolId: number
  poolAddress: `0x${string}`
  poolName: string
  testID?: string
}

/** Where the claim is. The hooks' own flags do not outlive the last of the three. */
type Stage = 'idle' | 'submitting' | 'confirming' | 'settling' | 'done'

const STAGE_MESSAGES: Record<Exclude<Stage, 'idle' | 'done'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  settling: 'Updating your earnings',
}

/**
 * What a pool has earned the connected wallet, and the way to take it out.
 *
 * The figure is read from the chain rather than from the indexed feeds, and
 * cannot be anything else: accrual is a consequence of *other* people's
 * repayments and emits nothing naming the member it credits. `claimable` is the
 * only thing that can answer it, and the contract deliberately does not cap it
 * by free liquidity — so this shows what has been earned even while a loan is
 * outstanding, and the claim itself is what runs into the liquidity bound.
 *
 * There is no amount to enter: `claimInterest` pays out everything owed, so the
 * whole interaction is one button.
 *
 * Rendered even at zero, unlike the approvals link, because "you have earned
 * nothing yet" is a real answer to the question a lender is asking, and hiding
 * the card would read as the feature not existing.
 */
function ClaimInterestCardComponent({ poolId, poolAddress, poolName, testID = 'claim-interest-card' }: ClaimInterestCardProps) {
  const { address } = useAccount()

  const { claimInterest, error: claimError, reset } = useInterest()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<bigint | null>(null)

  const { data: claimable, refetch } = useReadContract({
    address: poolAddress,
    abi: SampleLendingPoolABI,
    functionName: 'claimable',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  })

  // Mirrored into the store so the dashboard's all-time figure can include what
  // is still on the pool — nothing else in the app reads the chain for it.
  useEffect(() => {
    if (claimable === undefined) return

    poolStore.setClaimable(poolId, claimable)
  }, [claimable, poolId])

  const amount = claimable ?? 0n
  const isBusy = stage === 'submitting' || stage === 'confirming' || stage === 'settling'

  const handleClaim = async () => {
    setFailure(null)
    reset()

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await claimInterest({ poolId, poolAddress, poolName })
    } catch (error) {
      setStage('idle')
      setFailure(error instanceof Error ? error.message : 'Could not send the claim')

      return
    }

    try {
      setStage('confirming')
      const result = await waitForTransaction(txHash, 'CLAIM_INTEREST')
      setClaimed(BigInt(result.amount))
    } catch (error) {
      // The transaction is on chain; only its outcome is unresolved. The record
      // in PendingTransactionsStore survives, so recovery can finish the job.
      setStage('idle')
      setFailure(error instanceof Error ? error.message : 'Could not confirm the transaction')

      return
    }

    // Never throws: indexing is best-effort, and the record is recoverable.
    setStage('settling')
    await triggerIndexing(txHash, 'CLAIM_INTEREST')

    // Re-read the chain even though indexing refreshed the store: the claim is
    // what makes `claimable` fall to zero, and the two are only eventually
    // consistent.
    await refetch()

    setStage('done')
  }

  return (
    <View className="rounded-3xl border-continuous border-hairline border-iris/20 bg-iris-deep p-5" testID={testID}>
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-2xl border-continuous bg-iris/10">
          <FontAwesome name="line-chart" size={16} color={palette.iris} />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-semibold uppercase tracking-widest text-iris">Interest earned</Text>
          <Text className="mt-1 font-mono text-lg font-bold text-snow" testID="claim-interest-amount">
            {formatToken(amount)} POL
          </Text>
        </View>
      </View>

      {amount > 0n && (
        <Text className="mt-3 text-xs leading-5 text-fog">
          Your share of what borrowers have repaid. It keeps growing while your contribution is in the pool, whether you take it out or not.
        </Text>
      )}

      {amount === 0n && stage !== 'done' && (
        <Text className="mt-3 text-xs leading-5 text-fog">
          You earn a share of the interest on every loan this pool is repaid, in proportion to what you have put in.
        </Text>
      )}

      {stage === 'done' && claimed !== null && (
        <Text className="mt-3 text-xs leading-5 text-mint" testID="claim-interest-success">
          {formatToken(claimed)} POL is on its way to your wallet.
        </Text>
      )}

      {isBusy && (
        <View className="mt-4 flex-row items-center gap-3" testID="claim-interest-progress">
          <ActivityIndicator color={palette.iris} />
          <Text className="text-xs text-fog">{STAGE_MESSAGES[stage]}</Text>
        </View>
      )}

      {(failure ?? claimError) && !isBusy && (
        <Text className="mt-3 text-xs leading-5 text-coral" testID="claim-interest-error">
          {failure ?? claimError}
        </Text>
      )}

      {amount > 0n && (
        <Pressable
          onPress={handleClaim}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          className={`mt-4 items-center rounded-2xl border-continuous px-5 py-3 ${isBusy ? 'bg-veil' : 'bg-iris'} active:opacity-80`}
          testID="claim-interest-button"
        >
          <Text className={`text-sm font-bold ${isBusy ? 'text-mist' : 'text-abyss'}`}>Claim {formatToken(amount)} POL</Text>
        </Pressable>
      )}
    </View>
  )
}

export const ClaimInterestCard = observer(ClaimInterestCardComponent)
