import { FontAwesome } from '@expo/vector-icons'
import type { PoolInfo } from '@superpool/types'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import { poolStore } from '../../stores/PoolStore'
import { denominationFor } from '../../utils/denomination'
import { bpsToPercent, formatAmount, formatDuration, timeAgo } from '../../utils/format'

type Accent = 'mint' | 'iris' | 'amber'

/** Matches `PoolCard`, so a pool keeps its colour when it moves between tabs. */
const ACCENT_CYCLE: Accent[] = ['iris', 'mint', 'amber']

const accentStyles: Record<Accent, { orb: string; icon: string }> = {
  mint: { orb: 'bg-mint-deep', icon: palette.mint },
  iris: { orb: 'bg-iris-deep', icon: palette.iris },
  amber: { orb: 'bg-amber-deep', icon: palette.amber },
}

interface DiscoverPoolCardProps {
  pool: PoolInfo
  onPress?: () => void
}

/**
 * A pool the user is not in.
 *
 * Separate from `PoolCard` rather than a flag on it because the two answer
 * different questions. `PoolCard`'s footer is "what do I have here", which for
 * a stranger is nothing — an empty balance row would be a truthful way of
 * saying something useless. What a stranger needs instead is whether the pool
 * is worth joining, so the footer carries the pool's own size: how much is in
 * it and how many people are behind that.
 *
 * Deliberately absent: whether the pool lets anyone in or vets applicants.
 * `requiresMembership` is `poolConfig[5]` and has to be read from the chain
 * (see `CLAUDE.md`) — it is not on the indexed record, and one RPC call per
 * card is not a price a scrolling list should pay. The detail screen reads it
 * and shows the right action there.
 *
 * An `observer` because liquidity and the member count are derived from the
 * store's events, which arrive after the first render.
 */
function DiscoverPoolCardComponent({ pool, onPress }: DiscoverPoolCardProps) {
  const accent = accentStyles[ACCENT_CYCLE[pool.poolId % ACCENT_CYCLE.length]]
  const denomination = denominationFor(pool)
  const liquidity = poolStore.poolLiquidity(pool.poolId)
  const members = poolStore.memberCountFor(pool.poolId)

  return (
    <Pressable
      onPress={onPress}
      className="w-full rounded-3xl border-continuous border-hairline border-veil bg-surface p-5 shadow-float active:scale-[0.98] active:opacity-90"
      testID={`discover-pool-card-${pool.poolId}`}
    >
      <View className="flex-row items-center justify-between">
        <View className={`h-10 w-10 items-center justify-center rounded-2xl border-continuous ${accent.orb}`}>
          <FontAwesome name="life-ring" size={18} color={accent.icon} />
        </View>
        <Text className="text-xs text-mist">{timeAgo(new Date(pool.createdAt))}</Text>
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
          <Text className="mt-1 font-mono text-sm text-snow">{formatAmount(pool.maxLoanAmount, denomination)}</Text>
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

      <View className="mt-4 flex-row items-center justify-between rounded-2xl border-continuous bg-raised px-4 py-3">
        <View className="flex-row items-center gap-2">
          <FontAwesome name="users" size={11} color={palette.mist} />
          <Text className="text-xs text-fog" testID={`discover-pool-members-${pool.poolId}`}>
            {members === 1 ? '1 member' : `${members} members`}
          </Text>
        </View>
        <Text className="font-mono text-sm font-bold text-snow" testID={`discover-pool-liquidity-${pool.poolId}`}>
          {formatAmount(liquidity, denomination)}
        </Text>
      </View>
    </Pressable>
  )
}

export const DiscoverPoolCard = observer(DiscoverPoolCardComponent)
