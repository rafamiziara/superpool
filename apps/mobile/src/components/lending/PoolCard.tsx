import { FontAwesome } from '@expo/vector-icons'
import type { PoolInfo, PoolMember } from '@superpool/types'
import { MemberStatus } from '@superpool/types'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import { poolStore } from '../../stores/PoolStore'
import { denominationFor } from '../../utils/denomination'
import { bpsToPercent, formatAmount, formatDuration, sameAddress } from '../../utils/format'

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

/**
 * An `observer` because it reads the store directly rather than taking
 * everything as props: the connected wallet decides whether this is your pool,
 * and the loan records decide whether anyone is waiting on you. Both change
 * without the props changing, so without this the card keeps a stale answer —
 * which is how a request lands and the card carries on saying nothing.
 */
function PoolCardComponent({ pool, membership, onPress, carousel = false }: PoolCardProps) {
  const accent = accentStyles[ACCENT_CYCLE[pool.poolId % ACCENT_CYCLE.length]]
  const denomination = denominationFor(pool)
  const isOwner = sameAddress(pool.poolOwner, poolStore.userAddress)
  const isPending = membership?.status === MemberStatus.PENDING
  // Only the owner can act on these, so only the owner is told about them.
  const awaiting = isOwner ? poolStore.pendingLoansFor(pool.poolId).length : 0

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

      {membership && !isPending && (
        <View className="mt-4 flex-row items-center justify-between rounded-2xl border-continuous bg-raised px-4 py-3">
          <Text className="text-xs text-fog">Your balance</Text>
          <Text className="font-mono text-sm font-bold text-mint">{formatAmount(membership.currentBalance, denomination)}</Text>
        </View>
      )}
      {isPending && (
        <View className="mt-4 rounded-2xl border-continuous bg-raised px-4 py-3">
          <Text className="text-xs text-amber">Awaiting admin approval</Text>
        </View>
      )}
      {/*
        Below the balance rather than replacing it: an owner is usually a member
        too, and what they have in the pool and what is waiting on them are
        different questions.
      */}
      {awaiting > 0 && (
        <View
          className="mt-3 flex-row items-center gap-2 rounded-2xl border-continuous border-hairline border-amber/20 bg-amber-deep px-4 py-3"
          testID={`pool-card-awaiting-${pool.poolId}`}
        >
          <FontAwesome name="gavel" size={12} color={palette.amber} />
          <Text className="text-xs font-semibold text-amber">
            {awaiting === 1 ? '1 loan request waiting on you' : `${awaiting} loan requests waiting on you`}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

export const PoolCard = observer(PoolCardComponent)
