import { FontAwesome } from '@expo/vector-icons'
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'

export interface ApprovalsLinkProps {
  /** How many requests are waiting. Callers must not render this at zero. */
  count: number
  /** Named on the dashboard, where several pools compete; omitted on a pool's own page. */
  poolName?: string
  onPress: () => void
  /** Explicit rather than derived from `poolName`, which may contain anything. */
  testID?: string
}

/**
 * The way into a pool's approvals queue.
 *
 * Shared rather than written per screen because it appears wherever the owner
 * might be — their pool, their dashboard — and the two drifting apart is how a
 * count ends up right in one place and stale in the other.
 *
 * Amber throughout: this is the one card in the app that represents somebody
 * else waiting on the person reading it.
 */
export function ApprovalsLink({ count, poolName, onPress, testID = 'approvals-link' }: ApprovalsLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-3xl border-continuous border-hairline border-amber/20 bg-amber-deep px-5 py-4 active:opacity-80"
      testID={testID}
    >
      <View className="h-10 w-10 items-center justify-center rounded-2xl border-continuous bg-amber/10">
        <FontAwesome name="gavel" size={16} color={palette.amber} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-snow">{count === 1 ? '1 loan request' : `${count} loan requests`}</Text>
        <Text className="mt-0.5 text-xs text-fog" numberOfLines={1}>
          {poolName ? `${poolName} · waiting on your decision` : 'Waiting on your decision'}
        </Text>
      </View>
      <FontAwesome name="chevron-right" size={12} color={palette.mist} />
    </Pressable>
  )
}
