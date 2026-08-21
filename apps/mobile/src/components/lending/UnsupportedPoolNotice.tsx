import { FontAwesome } from '@expo/vector-icons'
import { router } from 'expo-router'
import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { palette } from '../../constants/palette'

export interface UnsupportedPoolNoticeProps {
  testID?: string
}

/**
 * Shown in place of anything that would put a figure on screen for a pool
 * denominated in a token the backend could not read.
 *
 * The alternative is guessing the exponent, and the guess that looks safest —
 * 18, because everything else is — is the one that renders 5 USDC as five
 * trillion. Refusing to show the pool is the only honest option: the app does
 * not know what a quantity of this token means, and neither would the person
 * reading it.
 *
 * Deliberately not phrased as the pool being broken. Nothing is wrong with it on
 * chain; the app simply could not read the token's metadata, which a later sweep
 * repairs on its own.
 */
export function UnsupportedPoolNotice({ testID = 'unsupported-pool' }: UnsupportedPoolNoticeProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-abyss px-10" testID={testID}>
      <View className="h-14 w-14 items-center justify-center rounded-full bg-amber-deep">
        <FontAwesome name="question" size={20} color={palette.amber} />
      </View>
      <Text className="text-center text-base font-semibold text-snow">This pool lends something the app cannot read</Text>
      <Text className="text-center text-sm text-fog">
        Its amounts would be shown in the wrong unit, so nothing is shown at all. Try again later — this usually fixes itself.
      </Text>
      <Pressable onPress={() => router.back()} className="mt-2 active:opacity-70">
        <Text className="font-semibold text-mint">Go back</Text>
      </Pressable>
    </View>
  )
}
