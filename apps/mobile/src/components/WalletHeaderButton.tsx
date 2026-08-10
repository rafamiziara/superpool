import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import React from 'react'
import { View } from 'react-native'
import { useAccount } from 'wagmi'

/**
 * The header's wallet button, held back until wagmi knows the answer.
 *
 * `AppKitButton` renders its bright accent "Connect" pill whenever the account
 * is not connected, and restoring a WalletConnect session takes a beat on
 * launch. On an authenticated screen that beat reads as the header flashing a
 * light button before settling into the dark account pill — so while the status
 * is still resolving, stand in a placeholder of the same footprint.
 *
 * Only the in-between states are covered. A settled `disconnected` still gets
 * the real connect button: the auth guard is redirecting by then, and hiding it
 * would leave no way back.
 */
export function WalletHeaderButton() {
  const { status } = useAccount()

  if (status === 'connecting' || status === 'reconnecting') {
    return <View className="h-8 w-24 rounded-full bg-raised" testID="wallet-header-placeholder" />
  }

  return <AppKitButton size="sm" />
}
