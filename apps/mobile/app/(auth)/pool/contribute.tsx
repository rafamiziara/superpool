import { FontAwesome } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useAccount, useBalance } from 'wagmi'
import { ContributeForm } from '../../../src/components/lending/ContributeForm'
import { palette } from '../../../src/constants/palette'
import { useContribution } from '../../../src/hooks/pools/useContribution'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import { poolStore } from '../../../src/stores/PoolStore'
import { formatToken } from '../../../src/utils/format'

/**
 * Where the flow is. Distinct from the hooks' own flags because it has to
 * survive across three of them and outlive the last one.
 */
type Stage = 'form' | 'submitting' | 'confirming' | 'indexing' | 'done'

const STAGE_MESSAGES: Record<Exclude<Stage, 'form' | 'done'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  indexing: 'Recording your contribution',
}

/**
 * A static route rather than a segment under `pool/[id]`, matching how
 * `pool/create` sits beside `pool/[id]`. The pool comes in as a query
 * parameter, which is also what lets the screen be reached from anywhere
 * holding only an id.
 */
function ContributeScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()
  const { address } = useAccount()
  const { data: balance } = useBalance({ address })

  const { contribute, error: contributionError, reset } = useContribution()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('form')
  const [failure, setFailure] = useState<string | null>(null)
  const [contributed, setContributed] = useState<bigint | null>(null)

  const pool = poolStore.poolById(Number(poolId))
  const membership = pool ? poolStore.membershipFor(pool.poolId) : undefined

  const handleSubmit = async (amount: bigint) => {
    if (!pool) return

    setFailure(null)
    reset()

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await contribute({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
        amount,
      })
    } catch (error) {
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not send the contribution')

      return
    }

    try {
      setStage('confirming')
      const result = await waitForTransaction(txHash, 'CONTRIBUTE')
      setContributed(BigInt(result.amount))
    } catch (error) {
      // The transaction is on chain; only its outcome is unresolved. The record
      // in PendingTransactionsStore survives, so recovery can finish the job.
      setStage('form')
      setFailure(error instanceof Error ? error.message : 'Could not confirm the transaction')

      return
    }

    // Never throws: indexing is best-effort, and the scheduled sync is the net.
    setStage('indexing')
    await triggerIndexing(txHash, 'CONTRIBUTE')

    setStage('done')
  }

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="contribute-pool-not-found">
        <Stack.Screen options={{ title: 'Contribute' }} />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-amber-deep">
          <FontAwesome name="exclamation" size={20} color={palette.amber} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">That pool is not available</Text>
        <Text className="text-center text-sm text-fog">Go back and pull down to refresh your circles, then try again.</Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  if (stage === 'done') {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="contribute-success">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-mint-deep">
          <FontAwesome name="check" size={24} color={palette.mint} />
        </View>
        <Text className="text-center text-lg font-bold text-snow">Contribution received</Text>
        <Text className="text-center text-sm text-fog">
          {contributed === null
            ? `Your funds are in ${pool.name}.`
            : `${formatToken(contributed)} POL is now in ${pool.name} and available to lend.`}
        </Text>
        <Pressable
          onPress={() => router.replace(`/(auth)/pool/${pool.poolId}`)}
          className="mt-2 items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90"
          testID="contribute-view-pool"
        >
          <Text className="text-base font-bold text-abyss">Back to the pool</Text>
        </Pressable>
      </View>
    )
  }

  const isBusy = stage !== 'form'

  return (
    <View className="flex-1 bg-abyss" testID="contribute-screen">
      <Stack.Screen options={{ title: 'Contribute' }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
      >
        <Text className="text-sm leading-6 text-fog">
          Your contribution becomes liquidity this pool can lend. It takes one transaction from your wallet.
        </Text>

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="contribute-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">{STAGE_MESSAGES[stage]}</Text>
          </View>
        ) : null}

        <ContributeForm
          poolName={pool.name}
          currentPosition={membership?.totalContributed}
          walletBalance={balance?.value}
          onSubmit={handleSubmit}
          isSubmitting={isBusy}
          error={failure ?? contributionError}
        />
      </ScrollView>
    </View>
  )
}

export default observer(ContributeScreen)
