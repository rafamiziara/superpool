import type { Transaction } from '@superpool/types'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { ScrollView, Text, View } from 'react-native'
import { ActivityRow } from '../../../../src/components/lending/ActivityRow'
import { poolStore } from '../../../../src/stores/PoolStore'

function groupLabel(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days < 1) return 'Today'
  if (days < 2) return 'Yesterday'
  if (days < 7) return 'This week'
  return 'Earlier'
}

function groupTransactions(transactions: Transaction[]): { label: string; items: Transaction[] }[] {
  const groups: { label: string; items: Transaction[] }[] = []
  for (const tx of transactions) {
    const label = groupLabel(tx.createdAt)
    const group = groups.find((g) => g.label === label)
    if (group) {
      group.items.push(tx)
    } else {
      groups.push({ label, items: [tx] })
    }
  }
  return groups
}

function ActivityScreen() {
  // The user's own, not every pool's: the empty state below promises this is
  // about them, and the rows are signed from their wallet's side to match.
  const groups = groupTransactions(poolStore.myActivity)

  return (
    <View className="flex-1 bg-abyss" testID="activity-screen">
      <StatusBar style="light" />

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-8 pt-4">
        <View className="px-6">
          <Text className="text-sm text-fog">Every move, on-chain and auditable</Text>
        </View>

        {groups.length === 0 && (
          <View className="mt-8 items-center px-6" testID="activity-empty">
            <Text className="text-center text-base font-semibold text-white">Nothing here yet</Text>
            <Text className="mt-2 text-center text-sm text-fog">
              Contributions, loans and repayments show up here once you make your first move.
            </Text>
          </View>
        )}

        <View className="mt-4 gap-6 px-6">
          {groups.map((group) => (
            <View key={group.label}>
              <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-mist">{group.label}</Text>
              <View className="rounded-3xl border-continuous border-hairline border-veil bg-surface py-1">
                {group.items.map((tx) => (
                  <ActivityRow
                    key={tx.id}
                    tx={tx}
                    poolName={poolStore.poolById(Number(tx.poolId))?.name}
                    denomination={poolStore.denominationFor(Number(tx.poolId))}
                    perspective="wallet"
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

export default observer(ActivityScreen)
