import { FontAwesome } from '@expo/vector-icons'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { ActivityRow } from '../../../../src/components/lending/ActivityRow'
import { PendingTransactionBanner } from '../../../../src/components/lending/PendingTransactionBanner'
import { PoolCard } from '../../../../src/components/lending/PoolCard'
import { TransactionStatusModal } from '../../../../src/components/lending/TransactionStatusModal'
import { palette } from '../../../../src/constants/palette'
import { type PendingTransaction, pendingTransactionsStore } from '../../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../../src/stores/PoolStore'
import { daysUntil, formatToken } from '../../../../src/utils/format'

const CARD_WIDTH = 288 // w-72
const CARD_GAP = 16

function DashboardScreen() {
  const loan = poolStore.activeLoan
  const loanPool = loan ? poolStore.poolById(Number(loan.poolId)) : undefined
  const loanTotal = loan ? loan.amount + loan.interestAccrued : 0n
  const repaidPct = loan && loanTotal > 0n ? Number((loan.amountRepaid * 100n) / loanTotal) : 0

  const [detail, setDetail] = useState<PendingTransaction | null>(null)

  return (
    <View className="flex-1 bg-abyss" testID="dashboard-screen">
      <StatusBar style="light" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="pb-8 pt-6"
        testID="dashboard-scroll"
      >
        {/* Hero: total balance */}
        <View className="px-6" testID="dashboard-hero">
          <Text className="text-xs font-semibold uppercase tracking-widest text-mist">Total pool balance</Text>
          <View className="mt-2 flex-row items-baseline gap-2">
            <Text className="text-5xl font-bold tracking-tight text-snow">{formatToken(poolStore.totalBalance)}</Text>
            <Text className="text-xl font-bold text-mint">POL</Text>
          </View>
          {poolStore.totalEarned > 0n && (
            <Text className="mt-2 text-sm text-mint">+{formatToken(poolStore.totalEarned)} POL earned all-time</Text>
          )}

          <View className="mt-5 flex-row gap-2">
            <View className="rounded-full border-hairline border-veil bg-surface px-4 py-2">
              <Text className="text-xs font-semibold text-fog">{poolStore.activeMemberships.length} pools</Text>
            </View>
            {loan && (
              <View className="rounded-full border-hairline border-veil bg-surface px-4 py-2">
                <Text className="text-xs font-semibold text-amber">1 active loan</Text>
              </View>
            )}
            {poolStore.pendingLoan && (
              <View className="rounded-full border-hairline border-veil bg-surface px-4 py-2">
                <Text className="text-xs font-semibold text-iris">1 request in review</Text>
              </View>
            )}
          </View>
        </View>

        {/* Pool creations that have not landed yet — invisible on this screen otherwise */}
        <PendingTransactionBanner className="mx-6 mt-6" onPress={setDetail} />

        {/* Your pools: horizontal macro-cards */}
        <View className="mt-10" testID="dashboard-pools">
          <View className="flex-row items-center justify-between px-6">
            <Text className="text-lg font-bold text-snow">Your pools</Text>
            <Pressable onPress={() => router.replace('/(auth)/(tabs)/pools')} className="active:opacity-70" testID="see-all-pools">
              <Text className="text-sm font-semibold text-mint">See all</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            contentContainerClassName="gap-4 px-6 py-4"
          >
            {poolStore.myPools.map((pool) => (
              <PoolCard
                key={pool.poolId}
                pool={pool}
                membership={poolStore.membershipFor(pool.poolId)}
                carousel
                onPress={() => router.push(`/(auth)/pool/${pool.poolId}`)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Active loan */}
        {loan && (
          <View className="mt-6 px-6" testID="dashboard-loan">
            <View className="rounded-3xl border-continuous border-hairline border-amber/20 bg-surface p-5 shadow-float">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                  <View className="h-10 w-10 items-center justify-center rounded-2xl border-continuous bg-amber-deep">
                    <FontAwesome name="handshake-o" size={16} color={palette.amber} />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-snow">Active loan</Text>
                    <Text className="mt-0.5 text-xs text-mist">{loanPool?.name}</Text>
                  </View>
                </View>
                {loan.dueDate && (
                  <View className="rounded-full bg-amber-deep px-3 py-1">
                    <Text className="text-xs font-semibold text-amber">due in {daysUntil(loan.dueDate)}d</Text>
                  </View>
                )}
              </View>

              <View className="mt-5 h-2 overflow-hidden rounded-full bg-abyss">
                <View className="h-2 rounded-full bg-amber" style={{ width: `${repaidPct}%` }} />
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-xs text-fog">
                  <Text className="font-mono font-bold text-snow">{formatToken(loan.amountRepaid)}</Text> of{' '}
                  <Text className="font-mono">{formatToken(loanTotal)}</Text> POL repaid
                </Text>
                <Pressable
                  onPress={() => router.push(`/(auth)/pool/borrow?poolId=${loan.poolId}`)}
                  className="rounded-full bg-amber px-5 py-2.5 active:scale-95 active:opacity-90"
                  testID="repay-button"
                >
                  <Text className="text-xs font-bold text-abyss">Repay</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Quick actions — thumb zone */}
        <View className="mt-6 flex-row gap-3 px-6" testID="dashboard-actions">
          {/* Contributing needs a pool, and this screen does not know which one
              is meant, so it hands over to the list rather than guessing. */}
          <Pressable
            onPress={() => router.replace('/(auth)/(tabs)/pools')}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border-continuous bg-mint py-4 shadow-glow-mint active:scale-[0.97] active:opacity-90"
            testID="contribute-button"
          >
            <FontAwesome name="arrow-up" size={14} color={palette.abyss} />
            <Text className="text-sm font-bold text-abyss">Contribute</Text>
          </Pressable>
          <Pressable
            // With a loan open, this is the way to settle it; without one, the
            // pools list is where a pool to borrow from gets picked.
            onPress={() => (loan ? router.push(`/(auth)/pool/borrow?poolId=${loan.poolId}`) : router.replace('/(auth)/(tabs)/pools'))}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border-continuous border-hairline border-veil bg-raised py-4 active:scale-[0.97] active:opacity-80"
            testID="request-loan-button"
          >
            <FontAwesome name="handshake-o" size={14} color={palette.snow} />
            <Text className="text-sm font-bold text-snow">{loan ? 'Repay loan' : 'Request loan'}</Text>
          </Pressable>
        </View>

        {/* Recent activity */}
        <View className="mt-10 px-6" testID="dashboard-activity">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-snow">Recent activity</Text>
            <Pressable onPress={() => router.replace('/(auth)/(tabs)/activity')} className="active:opacity-70" testID="see-all-activity">
              <Text className="text-sm font-semibold text-mint">See all</Text>
            </Pressable>
          </View>
          <View className="mt-4 rounded-3xl border-continuous border-hairline border-veil bg-surface py-1">
            {/* Yours, since this sits under your own balances. */}
            {poolStore.myActivity.slice(0, 3).map((tx) => (
              <ActivityRow key={tx.id} tx={tx} poolName={poolStore.poolById(Number(tx.poolId))?.name} perspective="wallet" />
            ))}
          </View>
        </View>
      </ScrollView>

      <TransactionStatusModal
        transaction={detail}
        onClose={() => setDetail(null)}
        onDismiss={
          detail?.status === 'failed'
            ? () => {
                const { txHash } = detail
                setDetail(null)
                pendingTransactionsStore.removePendingTransaction(txHash)
              }
            : undefined
        }
      />
    </View>
  )
}

export default observer(DashboardScreen)
