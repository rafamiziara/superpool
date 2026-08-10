import { FontAwesome } from '@expo/vector-icons'
import type { PoolInfo, PoolMember } from '@superpool/types'
import { MemberStatus } from '@superpool/types'
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import { poolStore } from '../../stores/PoolStore'
import { bpsToPercent, formatDuration, formatToken } from '../../utils/format'

type Accent = 'mint' | 'iris' | 'amber'

const ACCENT_CYCLE: Accent[] = ['iris', 'mint', 'amber']

const accentStyles: Record<Accent, { orb: string; icon: string }> = {
  mint: { orb: 'bg-mint-deep', icon: palette.mint },
  iris: { orb: 'bg-iris-deep', icon: palette.iris },
  amber: { orb: 'bg-amber-deep', icon: palette.amber },
}

interface PoolCardProps {
  pool: PoolInfo
  membership?: PoolMember
  onPress?: () => void
  /** Fixed width for horizontal carousels; defaults to full width. */
  carousel?: boolean
}

export function PoolCard({ pool, membership, onPress, carousel = false }: PoolCardProps) {
  const accent = accentStyles[ACCENT_CYCLE[pool.poolId % ACCENT_CYCLE.length]]
  // Case-insensitive: the backend stores addresses lowercased, wallets report
  // them checksummed.
  const isOwner = pool.poolOwner.toLowerCase() === poolStore.userAddress.toLowerCase()
  const isPending = membership?.status === MemberStatus.PENDING

  return (
    <Pressable
      onPress={onPress}
      className={`${carousel ? 'w-72' : 'w-full'} rounded-3xl border-continuous border-hairline border-veil bg-surface p-5 shadow-float active:scale-[0.98] active:opacity-90`}
      testID={`pool-card-${pool.poolId}`}
    >
      <View className="flex-row items-center justify-between">
        <View className={`h-10 w-10 items-center justify-center rounded-2xl border-continuous ${accent.orb}`}>
          <FontAwesome name="life-ring" size={18} color={accent.icon} />
        </View>
        {isOwner ? (
          <View className="rounded-full bg-iris-deep px-3 py-1">
            <Text className="text-xs font-semibold text-iris">Admin</Text>
          </View>
        ) : isPending ? (
          <View className="rounded-full bg-amber-deep px-3 py-1">
            <Text className="text-xs font-semibold text-amber">Pending</Text>
          </View>
        ) : membership ? (
          <View className="rounded-full bg-mint-deep px-3 py-1">
            <Text className="text-xs font-semibold text-mint">Member</Text>
          </View>
        ) : null}
      </View>

      <Text className="mt-4 text-lg font-bold text-snow" numberOfLines={1}>
        {pool.name}
      </Text>
      <Text className="mt-1 text-xs leading-5 text-fog" numberOfLines={2}>
        {pool.description}
      </Text>

      <View className="mt-4 h-px bg-veil" />

      <View className="mt-4 flex-row justify-between">
        <View>
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Max loan</Text>
          <Text className="mt-1 font-mono text-sm text-snow">{formatToken(pool.maxLoanAmount)} POL</Text>
        </View>
        <View>
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Rate</Text>
          <Text className="mt-1 font-mono text-sm text-snow">{bpsToPercent(pool.interestRate)}</Text>
        </View>
        <View>
          <Text className="text-[10px] font-semibold uppercase tracking-widest text-mist">Term</Text>
          <Text className="mt-1 font-mono text-sm text-snow">{formatDuration(pool.loanDuration)}</Text>
        </View>
      </View>

      {membership && !isPending && (
        <View className="mt-4 flex-row items-center justify-between rounded-2xl border-continuous bg-raised px-4 py-3">
          <Text className="text-xs text-fog">Your balance</Text>
          <Text className="font-mono text-sm font-bold text-mint">{formatToken(membership.currentBalance)} POL</Text>
        </View>
      )}
      {isPending && (
        <View className="mt-4 rounded-2xl border-continuous bg-raised px-4 py-3">
          <Text className="text-xs text-amber">Awaiting admin approval</Text>
        </View>
      )}
    </Pressable>
  )
}
