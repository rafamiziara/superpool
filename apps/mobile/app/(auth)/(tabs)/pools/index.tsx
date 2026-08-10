import { FontAwesome } from '@expo/vector-icons'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useCallback, useEffect } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useAccount } from 'wagmi'
import { PendingPoolCard } from '../../../../src/components/lending/PendingPoolCard'
import { PoolCard } from '../../../../src/components/lending/PoolCard'
import { DEFAULT_CHAIN_ID } from '../../../../src/config/contracts'
import { palette } from '../../../../src/constants/palette'
import { usePoolIndexing } from '../../../../src/hooks/pools/usePoolIndexing'
import { type PendingTransaction, pendingTransactionsStore } from '../../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../../src/stores/PoolStore'

/**
 * Pool creations to show above the list: this chain's, newest first, minus any
 * whose pool the backend has since listed.
 *
 * The dedupe matters because the two sources overlap for a moment. A confirmed
 * transaction carries the `poolId` decoded from its receipt, and the scheduled
 * sync can list that pool before `indexConfirmed` drops the local record — which
 * would otherwise show the same pool twice, once "Syncing" and once real.
 *
 * A `submitted` transaction has no `poolId` yet and needs no dedupe: nothing it
 * produced can be listed until it is mined.
 */
function unlistedTransactions(chainId: number): PendingTransaction[] {
  const listed = new Set(poolStore.pools.map((pool) => pool.poolId))

  return pendingTransactionsStore.transactions
    .filter((transaction) => transaction.chainId === chainId)
    .filter((transaction) => transaction.result === undefined || !listed.has(transaction.result.poolId))
    .sort((a, b) => b.timestamp - a.timestamp)
}

function PoolsScreen() {
  const { chainId } = useAccount()
  const { indexConfirmed } = usePoolIndexing()

  const activeChainId = chainId ?? DEFAULT_CHAIN_ID
  const pools = poolStore.myPools
  const pending = unlistedTransactions(activeChainId)

  /**
   * Hands the backend anything startup recovery confirmed while the app was
   * closed. Keyed on the hashes rather than run once on mount because recovery
   * is asynchronous at the root and usually resolves after this screen mounts.
   *
   * This terminates: a success removes the record and shrinks the key, and a
   * failure leaves it untouched so the effect does not re-fire. Retrying is the
   * pull-to-refresh path below.
   */
  const confirmedHashes = pendingTransactionsStore.confirmedUnindexed.map((transaction) => transaction.txHash).join(',')

  useEffect(() => {
    if (confirmedHashes === '') return

    void indexConfirmed()
  }, [confirmedHashes, indexConfirmed])

  const handleRefresh = useCallback(async () => {
    await poolStore.refreshPools()
    await indexConfirmed()
  }, [indexConfirmed])

  const isEmpty = pools.length === 0 && pending.length === 0

  if (poolStore.isLoading && isEmpty) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss" testID="pools-loading">
        <StatusBar style="light" />
        <ActivityIndicator colorClassName="accent-mint" />
        <Text className="text-sm text-fog">Loading your circles</Text>
      </View>
    )
  }

  // A failed load with nothing cached leaves the screen with nothing to say, so
  // it becomes the error. With pools on screen the same failure is a banner
  // below, because tearing down good data to report a failed refresh is worse
  // than showing it slightly stale.
  if (poolStore.hasError && isEmpty) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID="pools-error">
        <StatusBar style="light" />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-coral-deep">
          <FontAwesome name="exclamation" size={20} color={palette.coral} />
        </View>
        <Text className="text-center text-base font-semibold text-snow">Could not load your circles</Text>
        <Text className="text-center text-sm text-fog">{poolStore.error}</Text>
        <Pressable onPress={() => poolStore.fetchPools()} className="mt-2 active:opacity-70" testID="pools-error-retry">
          <Text className="font-semibold text-mint">Try again</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-abyss" testID="pools-screen">
      <StatusBar style="light" />

      <ScrollView
        testID="pools-scroll"
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-8 pt-4"
        refreshControl={<RefreshControl refreshing={poolStore.isRefreshing} onRefresh={handleRefresh} tintColor={palette.fog} />}
      >
        {!isEmpty && (
          <View className="px-6">
            <Text className="text-sm text-fog">
              {pools.length} {pools.length === 1 ? 'circle' : 'circles'} you&apos;re part of
            </Text>
          </View>
        )}

        <View className="mt-4 gap-4 px-6">
          {poolStore.hasError && (
            <View
              className="rounded-2xl border-continuous border-hairline border-coral bg-coral-deep px-4 py-3"
              testID="pools-error-banner"
            >
              <Text className="text-sm text-coral">{poolStore.error}</Text>
            </View>
          )}

          {pending.map((transaction) => (
            <PendingPoolCard
              key={transaction.txHash}
              transaction={transaction}
              onDismiss={
                transaction.status === 'failed' ? () => pendingTransactionsStore.removePendingTransaction(transaction.txHash) : undefined
              }
            />
          ))}

          {pools.map((pool) => (
            <PoolCard
              key={pool.poolId}
              pool={pool}
              membership={poolStore.membershipFor(pool.poolId)}
              onPress={() => router.push(`/(auth)/pool/${pool.poolId}`)}
            />
          ))}

          {isEmpty && (
            <View className="items-center gap-2 py-6" testID="pools-empty">
              <Text className="text-base font-semibold text-snow">No circles yet</Text>
              <Text className="text-center text-sm text-fog">Start your own pool, or pull down to refresh once someone invites you.</Text>
            </View>
          )}

          {/* Create pool ghost card */}
          <Pressable
            onPress={() => router.push('/(auth)/pool/create')}
            className="items-center justify-center gap-3 rounded-3xl border-continuous border border-dashed border-veil bg-abyss py-10 active:opacity-70"
            testID="create-pool-card"
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-mint-deep">
              <FontAwesome name="plus" size={16} color={palette.mint} />
            </View>
            <Text className="text-sm font-semibold text-fog">Start a new pool</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

export default observer(PoolsScreen)
