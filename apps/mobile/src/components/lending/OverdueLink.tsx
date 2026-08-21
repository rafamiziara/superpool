import { FontAwesome } from '@expo/vector-icons'
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'

export interface OverdueLinkProps {
  /** How many loans are past their due date. Callers must not render this at zero. */
  count: number
  /** Named on the dashboard, where several pools compete; omitted on a pool's own page. */
  poolName?: string
  onPress: () => void
  /** Explicit rather than derived from `poolName`, which may contain anything. */
  testID?: string
}

/**
 * The way into a pool's late loans.
 *
 * Shaped like `ApprovalsLink` and coloured differently on purpose. That one is
 * amber — somebody is waiting on the owner, and it is a queue to work through.
 * This is coral: nobody is waiting, the owner's money is out past its date, and
 * there may well be nothing to do about it today.
 *
 * The wording avoids "default" entirely. Every loan here is *overdue*, which is
 * arithmetic; whether any of them is in default is the owner's judgement and is
 * made on the next screen.
 */
export function OverdueLink({ count, poolName, onPress, testID = 'overdue-link' }: OverdueLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-3xl border-continuous border-hairline border-coral/20 bg-coral-deep px-5 py-4 active:opacity-80"
      testID={testID}
    >
      <View className="h-10 w-10 items-center justify-center rounded-2xl border-continuous bg-coral/10">
        <FontAwesome name="clock-o" size={16} color={palette.coral} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-snow">{count === 1 ? '1 late loan' : `${count} late loans`}</Text>
        <Text className="mt-0.5 text-xs text-fog" numberOfLines={1}>
          {poolName ? `${poolName} · past the due date` : 'Past the due date'}
        </Text>
      </View>
      <FontAwesome name="chevron-right" size={12} color={palette.mist} />
    </Pressable>
  )
}
