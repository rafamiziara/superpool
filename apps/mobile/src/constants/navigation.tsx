import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import React from 'react'
import { Image } from 'react-native'
import { palette } from './palette'

/** Shared native-stack header styling for the dark post-login experience. */
export const darkHeader = {
  headerStyle: { backgroundColor: palette.abyss },
  headerTitleStyle: { color: palette.snow },
  headerLargeTitleStyle: { color: palette.snow },
  headerLargeStyle: { backgroundColor: palette.abyss },
  headerTintColor: palette.mint,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: palette.abyss },
} as const

/**
 * The header every tab shares: wordmark on the left, wallet button on the
 * right. There is deliberately no per-tab title — the tab bar already names the
 * screen, and repeating it costs a whole large-title block of vertical space.
 */
export const brandHeader = {
  ...darkHeader,
  headerTitle: () => (
    <Image
      source={require('@superpool/assets/images/logos/no_bg_white.png')}
      className="h-7 w-32"
      resizeMode="contain"
      accessibilityLabel="SuperPool"
      testID="header-logo"
    />
  ),
  headerTitleAlign: 'left',
  headerRight: () => <AppKitButton size="sm" />,
} as const
