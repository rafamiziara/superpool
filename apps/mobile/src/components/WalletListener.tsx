import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { unregisterForPushNotifications } from '../services/pushNotifications'
import { authStore } from '../stores/AuthStore'

/**
 * Global wallet state listener component.
 * Should be mounted once at the root level to track wallet changes.
 */
export function WalletListener() {
  const { address, chainId, isConnected, isConnecting } = useAccount()

  /**
   * The wallet this device's push token is currently speaking for.
   *
   * Kept here rather than read back from the store because what matters is the
   * *edge* — the moment the connected wallet stops being the one the token was
   * registered against. Reading the current value cannot tell that from a
   * render that simply happened.
   */
  const registeredFor = useRef<string | null>(null)

  useEffect(() => {
    // Mark wallet as initialized on first load
    authStore.initializeWalletState()

    // Update AuthStore with wallet state changes
    authStore.updateWalletState({
      isConnected,
      address,
      chainId,
      isConnecting,
    })
  }, [isConnected, address, chainId, isConnecting])

  /**
   * Give the push token back when the wallet it belongs to goes away.
   *
   * Both edges count: disconnecting, and switching to a different address while
   * still connected. A token left registered to the outgoing wallet delivers
   * its join and loan requests to whoever uses the device next — a privacy
   * leak, not an annoyance. Re-registration happens after the new wallet
   * authenticates, in `useAutoAuth`.
   *
   * Safe on the first render, where there is nothing registered yet: the
   * service returns immediately when it holds no token.
   */
  useEffect(() => {
    const current = isConnected ? (address ?? null) : null
    const previous = registeredFor.current

    registeredFor.current = current

    if (previous && previous !== current) {
      void unregisterForPushNotifications()
    }
  }, [isConnected, address])

  // This component renders nothing - it's just for side effects
  return null
}
