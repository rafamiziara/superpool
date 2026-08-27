import { useAppKit } from '@reown/appkit-wagmi-react-native'
import React from 'react'
import { Pressable, Text } from 'react-native'

export interface ConnectWalletButtonProps {
  label?: string
  testID?: string
}

/**
 * The onboarding screen's primary call to action, in the app's own mint.
 *
 * **Not `AppKitButton`, and that is the point.** AppKit's connect pill takes
 * its background from the modal's `accent-100` and hardcodes its label to
 * `inverse-100`, which is `#FFFFFF` in *both* of its themes
 * (`ThemeUtil.DarkTheme`). So recolouring the accent to mint — the obvious
 * first attempt, and the reason `config/wagmi.ts` says the accent is
 * deliberately left at AppKit's indigo — puts white text on `#4ae3b5` at
 * roughly 1.5:1. Unreadable, and unreachable from the outside: `connectStyle`
 * is a `ViewStyle` and never touches the label.
 *
 * Its height is fixed too. `size` accepts only `sm` and `md`, worth 32 and 40
 * points, so "bigger" is not expressible through the component either.
 *
 * What AppKit actually owns is the modal, and `useAppKit().open()` is the
 * supported way in. Everything before that press is ours.
 *
 * Styled as the app's primary action — the same mint pill, ink label and glow
 * as `ContributeForm`, `BorrowForm` and `CreatePoolForm` — one step larger,
 * because on onboarding it is the only thing to press.
 */
export function ConnectWalletButton({ label = 'Connect Wallet', testID = 'connect-wallet-button' }: ConnectWalletButtonProps) {
  const { open } = useAppKit()

  return (
    <Pressable
      onPress={() => open()}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      className="items-center justify-center rounded-2xl border-continuous bg-mint px-6 py-5 shadow-glow-mint active:opacity-90"
    >
      <Text className="text-lg font-bold text-abyss">{label}</Text>
    </Pressable>
  )
}
