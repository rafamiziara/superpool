import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { ActivityRow } from '../../../src/components/lending/ActivityRow'
import { PendingContributionCard } from '../../../src/components/lending/PendingContributionCard'
import { TransactionStatusModal } from '../../../src/components/lending/TransactionStatusModal'
import { type ContributeTransaction, type PendingTransaction, pendingTransactionsStore } from '../../../src/stores/PendingTransactionsStore'
import { poolStore } from '../../../src/stores/PoolStore'
import { bpsToPercent, formatDuration, formatToken, sameAddress, shortAddress } from '../../../src/utils/format'

/**
 * This pool's deposits that are not yet reflected in its liquidity, newest first.
 *
 * No dedupe against indexed contributions is needed, unlike the pools screen:
 * `triggerIndexing` removes the record only after the refresh that lists the
 * contribution has already landed, so the two never both hold it.
 */
function pendingContributionsFor(poolId: number): ContributeTransaction[] {
  return pendingTransactionsStore.transactions
    .filter((transaction): transaction is ContributeTransaction => transaction.type === 'CONTRIBUTE')
    .filter((transaction) => transaction.params.poolId === poolId)
    .sort((a, b) => b.timestamp - a.timestamp)
}

function PoolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const pool = poolStore.poolById(Number(id))
  const membership = pool ? poolStore.membershipFor(pool.poolId) : undefined
  const outstandingLoan = pool ? poolStore.activeLoanFor(pool.poolId) : undefined
  const transactions = pool ? poolStore.transactionsFor(pool.poolId) : []

  /** Deposits into this pool that the backend has not indexed yet. */
  const pending = pool ? pendingContributionsFor(pool.poolId) : []

  /** The transaction the status modal is describing; `null` keeps it closed. */
  const [detail, setDetail] = useState<PendingTransaction | null>(null)

  if (!pool) {
    return (
      <View className="flex-1 items-center justify-center bg-abyss" testID="pool-not-found">
        <Text className="text-fog">Pool not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 active:opacity-70">
          <Text className="font-semibold text-mint">Go back</Text>
        </Pressable>
      </View>
    )
  }

  // A strict compare would hide the admin controls from the pool's own owner.
  const isOwner = sameAddress(pool.poolOwner, poolStore.userAddress)

  const stats = [
    { label: 'Liquidity', value: `${formatToken(poolStore.poolLiquidity(pool.poolId))} POL` },
    { label: 'Max loan', value: `${formatToken(pool.maxLoanAmount)} POL` },
    { label: 'Interest', value: bpsToPercent(pool.interestRate) },
    { label: 'Term', value: formatDuration(pool.loanDuration) },
  ]

  return (
    <View className="flex-1 bg-abyss" testID="pool-detail-screen">
      <Stack.Screen options={{ title: pool.name }} />
      <StatusBar style="light" />

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-36 pt-4">
        {/* Hero: managed-by + status */}
        <View className="px-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text className="text-xs text-mist">{isOwner ? 'Managed by you' : 'Managed by'}</Text>
              {!isOwner && <Text className="font-mono text-xs text-fog">{shortAddress(pool.poolOwner)}</Text>}
              {isOwner && (
                <View className="rounded-full bg-iris-deep px-3 py-1">
                  <Text className="text-xs font-semibold text-iris">Admin</Text>
                </View>
              )}
            </View>
            <View className="flex-row items-center gap-2 rounded-full border-hairline border-veil bg-raised px-3 py-1.5">
              <View className={`h-2 w-2 rounded-full ${pool.isActive ? 'bg-mint' : 'bg-coral'}`} />
              <Text className="text-xs font-semibold text-fog">{pool.isActive ? 'Active' : 'Paused'}</Text>
            </View>
          </View>
          <Text className="mt-4 text-sm leading-6 text-fog">{pool.description}</Text>
        </View>

        {/* Stats grid */}
        <View className="mt-8 flex-row flex-wrap gap-3 px-6">
          {stats.map((stat) => (
            <View key={stat.label} className="w-[47%] grow rounded-3xl border-continuous border-hairline border-veil bg-surface p-4">
              <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">{stat.label}</Text>
              <Text className="mt-2 font-mono text-base font-bold text-snow">{stat.value}</Text>
            </View>
          ))}
        </View>

        {/* Membership card */}
        {membership && (
          <View className="mt-6 px-6">
            <View className="rounded-3xl border-continuous border-hairline border-mint/20 bg-mint-deep p-5">
              <Text className="text-xs font-semibold uppercase tracking-widest text-mint">Your position</Text>
              <View className="mt-4 flex-row justify-between">
                <View>
                  <Text className="text-xs text-fog">Balance</Text>
                  <Text className="mt-1 font-mono text-lg font-bold text-snow">{formatToken(membership.currentBalance)} POL</Text>
                </View>
                <View className="items-end">
                  <Text className="text-xs text-fog">Contributed</Text>
                  <Text className="mt-1 font-mono text-lg font-bold text-snow">{formatToken(membership.totalContributed)} POL</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Contributions still in flight — invisible in the liquidity figure until indexed */}
        {pending.length > 0 && (
          <View className="mt-6 gap-3 px-6" testID="pool-pending-contributions">
            {pending.map((transaction) => (
              <PendingContributionCard key={transaction.txHash} transaction={transaction} onPress={() => setDetail(transaction)} />
            ))}
          </View>
        )}

        {/* Pool activity */}
        {transactions.length > 0 && (
          <View className="mt-8 px-6">
            <Text className="text-lg font-bold text-snow">Pool activity</Text>
            <View className="mt-4 rounded-3xl border-continuous border-hairline border-veil bg-surface py-1">
              {transactions.map((tx) => (
                <ActivityRow key={tx.id} tx={tx} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Fixed thumb-zone action bar */}
      <View className="absolute inset-x-0 bottom-safe-offset-4 flex-row gap-3 px-6" testID="pool-actions">
        <Pressable
          onPress={() => router.push(`/(auth)/pool/contribute?poolId=${pool.poolId}`)}
          className="flex-1 items-center justify-center rounded-2xl border-continuous bg-mint py-4 shadow-glow-mint active:scale-[0.97] active:opacity-90"
          testID="pool-contribute-button"
        >
          <Text className="text-sm font-bold text-abyss">Contribute</Text>
        </Pressable>
        {/*
          Only offered to members. Someone who never contributed has nothing to
          take out, and `withdraw` would revert on them. The membership is
          derived from indexed deposits, so it answers "has this wallet ever
          funded this pool" — the withdrawable amount itself is read from the
          chain on the next screen, where it has to be exact.
        */}
        {membership && (
          <Pressable
            onPress={() => router.push(`/(auth)/pool/withdraw?poolId=${pool.poolId}`)}
            className="flex-1 items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised py-4 active:scale-[0.97] active:opacity-80"
            testID="pool-withdraw-button"
          >
            <Text className="text-sm font-bold text-snow">Withdraw</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => router.push(`/(auth)/pool/borrow?poolId=${pool.poolId}`)}
          className="flex-1 items-center justify-center rounded-2xl border-continuous border-hairline border-veil bg-raised py-4 active:scale-[0.97] active:opacity-80"
          testID="pool-request-loan-button"
        >
          {/* One screen for both directions: the contract allows a single open
              loan per member per pool, so there is nothing to choose between. */}
          <Text className="text-sm font-bold text-snow">{outstandingLoan ? 'Repay loan' : 'Request loan'}</Text>
        </Pressable>
      </View>

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

export default observer(PoolDetailScreen)
