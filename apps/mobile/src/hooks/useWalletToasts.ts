import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { appToasts } from '../utils/toast'

interface WalletToastOptions {
  showConnectionToasts?: boolean
  showDisconnectionToasts?: boolean
}

export const useWalletToasts = (options: WalletToastOptions = {}) => {
  const {
    showConnectionToasts = false, // Changed: default to false - only show when explicitly needed
    showDisconnectionToasts = true, // Keep disconnection toasts as they're always relevant
  } = options

  const { isConnected, connector } = useAccount()
  const previouslyConnected = useRef(false)

  // Handle wallet connection/disconnection toast notifications
  useEffect(() => {
    if (isConnected && !previouslyConnected.current) {
      // Wallet just connected - only show if explicitly enabled
      if (showConnectionToasts) {
        const walletName = connector?.name
        appToasts.walletConnected(walletName)
      }
      previouslyConnected.current = true
    } else if (!isConnected && previouslyConnected.current) {
      // Wallet disconnected - show if enabled (default: true)
      if (showDisconnectionToasts) {
        appToasts.walletDisconnected()
      }
      previouslyConnected.current = false
    }
  }, [isConnected, connector?.name, showConnectionToasts, showDisconnectionToasts])
}
