import { autorun } from 'mobx'
import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useWalletConnectionStore } from '../stores'
import { appToasts } from '../utils/toast'

interface WalletToastOptions {
  showConnectionToasts?: boolean
  showDisconnectionToasts?: boolean
}

export const useWalletToasts = (options: WalletToastOptions = {}) => {
  const {
    showConnectionToasts = false, // Default: false - only show when explicitly needed
    showDisconnectionToasts = true, // Default: true - disconnection toasts are always relevant
  } = options

  const { connector } = useAccount() // Keep for wallet name
  const walletStore = useWalletConnectionStore()
  const previouslyConnected = useRef(false)

  // MobX autorun: Automatically react to wallet connection state changes
  // This replaces the complex useEffect with dependency array
  useEffect(() => {
    const disposer = autorun(() => {
      // Use MobX reactive state - automatically tracks changes!
      const { isConnected } = walletStore

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
    })

    // Cleanup autorun when component unmounts or options change
    return disposer
  }, [showConnectionToasts, showDisconnectionToasts]) // Only options as dependencies

  // Note: No return value needed - this is a side-effect hook
}
