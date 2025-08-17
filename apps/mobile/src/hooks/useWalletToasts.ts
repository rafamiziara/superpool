import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { appToasts } from '../utils/toast'

export const useWalletToasts = () => {
  const { isConnected, connector } = useAccount()
  const previouslyConnected = useRef(false)

  // Handle wallet connection/disconnection toast notifications
  useEffect(() => {
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
  }, [isConnected, connector?.name])
}