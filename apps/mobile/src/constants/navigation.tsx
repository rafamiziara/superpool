import { DarkTheme } from 'expo-router'
import React from 'react'
import { Image } from 'react-native'
import { WalletHeaderButton } from '../components/WalletHeaderButton'
import { palette } from './palette'

/**
 * The navigation theme, which is not cosmetic here: every native stack paints
 * its container with `colors.background` (`ScreenStack nativeContainerStyle`),
 * and that container is what shows through mid-transition, before the incoming
 * screen has painted. React Navigation's default theme makes it
 * `rgb(242, 242, 242)`, so a push flashed light grey no matter what the screens
 * themselves said — `contentStyle` only covers a screen's own content.
 */
export const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: palette.abyss,
    card: palette.surface,
    text: palette.snow,
    primary: palette.mint,
    border: palette.veil,
    notification: palette.coral,
  },
}

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
      source={require('../../assets/images/logos/no_bg_white.png')}
      className="h-7 w-32"
      resizeMode="contain"
      accessibilityLabel="SuperPool"
      testID="header-logo"
    />
  ),
  headerTitleAlign: 'left',
  headerRight: () => <WalletHeaderButton />,
} as const
