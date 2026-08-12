import { FontAwesome } from '@expo/vector-icons'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { palette } from '../../../src/constants/palette'
import { useMembership } from '../../../src/hooks/pools/useMembership'
import { usePoolIndexing } from '../../../src/hooks/pools/usePoolIndexing'
import { useTransactionMonitoring } from '../../../src/hooks/pools/useTransactionMonitoring'
import { poolStore } from '../../../src/stores/PoolStore'

type Stage = 'idle' | 'submitting' | 'confirming' | 'indexing' | 'done'

const STAGE_MESSAGES: Record<Exclude<Stage, 'idle' | 'done'>, string> = {
  submitting: 'Approve the transaction in your wallet',
  confirming: 'Waiting for the network to confirm',
  indexing: 'Recording your request',
}

/**
 * Asking to join a pool that decides who is in.
 *
 * Its own screen rather than a button on the pool page, for the same reason
 * borrowing is: it costs a transaction, and anything that costs a signature
 * should say what it does before asking for one.
 *
 * There is no amount and no form — the contract takes no arguments — so the
 * whole screen is an explanation and a button.
 */
function JoinPoolScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>()

  const { requestMembership, error: membershipError, reset } = useMembership()
  const { waitForTransaction } = useTransactionMonitoring()
  const { triggerIndexing } = usePoolIndexing()

  const [stage, setStage] = useState<Stage>('idle')
  const [failure, setFailure] = useState<string | null>(null)

  const pool = poolStore.poolById(Number(poolId))
  const standing = pool ? poolStore.registerStandingFor(pool.poolId) : undefined

  const isBusy = stage !== 'idle' && stage !== 'done'

  const ask = async () => {
    if (!pool || isBusy) return

    setFailure(null)
    reset()

    let txHash: `0x${string}`
    try {
      setStage('submitting')
      txHash = await requestMembership({
        poolId: pool.poolId,
        poolAddress: pool.poolAddress as `0x${string}`,
        poolName: pool.name,
      })
    } catch (error) {
      setStage('idle')
      setFailure(error instanceof Error ? error.message : 'Could not send the request')

      return
    }

    try {
      setStage('confirming')
      await waitForTransaction(txHash, 'REQUEST_MEMBERSHIP')
    } catch (error) {
      // On chain, outcome unresolved. The pending record survives, so startup
      // recovery finishes it and the sweep indexes it either way.
      setStage('idle')
      setFailure(error instanceof Error ? error.message : 'Could not confirm the transaction')

      return
    }

    setStage('indexing')
    await triggerIndexing(txHash, 'REQUEST_MEMBERSHIP')
    await poolStore.refreshPools()

    setStage('done')
  }

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="join-pool-not-found">
        <Stack.Screen options={{ title: 'Join pool' }} />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-amber-deep">
          <FontAwesome name="exclamation" size={20} color={palette.amber} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">That pool is not available</Text>
        <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  const alreadyWaiting = standing?.status === 'requested' || stage === 'done'

  return (
    <View className="flex-1 bg-abyss" testID="join-screen">
      <Stack.Screen options={{ title: `Join ${pool.name}` }} />
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-6 px-6 pb-16 pt-4"
      >
        <View className="gap-3 rounded-3xl border-continuous border-hairline border-veil bg-surface p-5">
          <Text className="text-base font-bold text-snow">{pool.name} decides who joins</Text>
          <Text className="text-sm leading-6 text-fog">
            {alreadyWaiting
              ? 'Your request is with the pool owner. You will be able to fund the pool and borrow from it as soon as they let you in.'
              : 'Ask to join, and the pool owner decides. Until they do you cannot fund the pool or borrow from it.'}
          </Text>
          <Text className="text-xs leading-5 text-mist">
            Asking costs a network fee and nothing else. No money moves, and you can be turned down without losing anything.
          </Text>
        </View>

        {/*
          A previous decision, which changes what this screen means. Somebody
          turned down is not a stranger, and pretending otherwise would hide
          that their first attempt already happened.
        */}
        {standing?.status === 'rejected' ? (
          <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3" testID="join-previously-rejected">
            <Text className="text-xs leading-5 text-mist">
              You asked before and were turned down. You are free to ask again — the owner may have had a reason that no longer applies.
            </Text>
          </View>
        ) : null}

        {standing?.status === 'removed' ? (
          <View className="rounded-2xl border-continuous border-hairline border-veil bg-raised px-4 py-3" testID="join-previously-removed">
            <Text className="text-xs leading-5 text-mist">
              You were removed from this pool. Anything you had put in is still yours and can still be withdrawn.
            </Text>
          </View>
        ) : null}

        {isBusy ? (
          <View
            className="flex-row items-center gap-3 rounded-2xl border-continuous border-hairline border-veil bg-surface px-4 py-4"
            testID="join-status"
          >
            <ActivityIndicator colorClassName="accent-mint" />
            <Text className="flex-1 text-sm text-snow">{STAGE_MESSAGES[stage as Exclude<Stage, 'idle' | 'done'>]}</Text>
          </View>
        ) : null}

        {(failure ?? membershipError) ? (
          <View className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3">
            <Text className="text-sm text-coral" testID="join-error">
              {failure ?? membershipError}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={alreadyWaiting ? () => router.back() : ask}
          disabled={isBusy}
          accessibilityRole="button"
          accessibilityState={{ disabled: isBusy }}
          testID="join-submit"
          className={
            alreadyWaiting
              ? 'items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised px-6 py-4 active:opacity-80'
              : 'items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-4 shadow-glow-mint active:opacity-90 disabled:bg-veil disabled:shadow-none'
          }
        >
          <Text className={alreadyWaiting ? 'text-base font-bold text-snow' : 'text-base font-bold text-abyss disabled:text-mist'}>
            {alreadyWaiting ? 'Back to the pool' : isBusy ? 'Sending…' : standing?.status === 'rejected' ? 'Ask again' : 'Ask to join'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

export default observer(JoinPoolScreen)
