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
