import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { authStore } from '../stores/AuthStore'

/**
 * Global wallet state listener component.
 * Should be mounted once at the root level to track wallet changes.
 */
export function WalletListener() {
  const { address, chainId, isConnected, isConnecting } = useAccount()

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

  // This component renders nothing - it's just for side effects
  return null
}
