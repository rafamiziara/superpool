import { useEffect, useRef } from 'react'
import { usePathname } from 'expo-router'
import { useAccount } from 'wagmi'
import { appToasts } from '../utils/toast'

export const useWalletToasts = () => {
  const { isConnected, connector } = useAccount()
  const previouslyConnected = useRef(false)
  const pathname = usePathname()

  // Handle wallet connection/disconnection toast notifications
  useEffect(() => {
    // Don't show toasts on connecting page since we show status directly
    if (pathname === '/connecting') {
      return
    }

    if (isConnected && !previouslyConnected.current) {
      // Wallet just connected
      const walletName = connector?.name
      appToasts.walletConnected(walletName)
      previouslyConnected.current = true
    } else if (!isConnected && previouslyConnected.current) {
      // Wallet just disconnected
      appToasts.walletDisconnected()
      previouslyConnected.current = false
    }
  }, [isConnected, connector?.name, pathname])
}
