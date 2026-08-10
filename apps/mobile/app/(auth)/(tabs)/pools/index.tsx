import { FontAwesome } from '@expo/vector-icons'
import { router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { PoolCard } from '../../../../src/components/lending/PoolCard'
import { palette } from '../../../../src/constants/palette'
import { poolStore } from '../../../../src/stores/PoolStore'

function PoolsScreen() {
  const pools = poolStore.myPools

  return (
    <View className="flex-1 bg-abyss" testID="pools-screen">
      <StatusBar style="light" />

      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic" contentContainerClassName="pb-8 pt-4">
        <View className="px-6">
          <Text className="text-sm text-fog">
            {pools.length} {pools.length === 1 ? 'circle' : 'circles'} you&apos;re part of
          </Text>
        </View>

        <View className="mt-4 gap-4 px-6">
          {pools.map((pool) => (
            <PoolCard
              key={pool.poolId}
              pool={pool}
              membership={poolStore.membershipFor(pool.poolId)}
              onPress={() => router.push(`/(auth)/pool/${pool.poolId}`)}
            />
          ))}

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
