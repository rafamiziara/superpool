import { FontAwesome } from '@expo/vector-icons'
import React from 'react'
import { Text, View } from 'react-native'
import { palette } from '../../constants/palette'
import { chainName } from '../../utils/explorer'

interface NetworkBadgeProps {
  chainId: number
  testID?: string
}

/**
 * Which chain the screen below is showing.
 *
 * **One per screen, not one per card.** Every list in the app is already
 * narrowed to the connected chain — `PoolStore.requestPools` passes
 * `authStore.chainId` and the backend keys every document `${chainId}-…` — so a
 * badge on each card would repeat one fact as many times as there are pools.
 * The question it answers is "which world am I looking at", and that is asked
 * once, about the whole screen.
 *
 * Deliberately quiet: `mist` on `raised` rather than one of the accent pairs.
 * It competes with `PoolCard`'s Admin and Member badges otherwise, and those
 * say something about the user's standing, which matters more than the network
 * on all but the day they switch it.
 */
export function NetworkBadge({ chainId, testID }: NetworkBadgeProps) {
  return (
    <View
      className="flex-row items-center gap-2 self-start rounded-full border-continuous border-hairline border-veil bg-raised px-3 py-1"
      testID={testID ?? 'network-badge'}
    >
      <FontAwesome name="globe" size={10} color={palette.mist} />
      <Text className="text-xs font-semibold text-mist">{chainName(chainId)}</Text>
    </View>
  )
}
