import { useCallback, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'

interface ConnectionTriggerCallbacks {
  onNewConnection: (address: string, chainId?: number) => void
  onDisconnection: () => void
}

export const useWalletConnectionTrigger = ({ onNewConnection, onDisconnection }: ConnectionTriggerCallbacks) => {
  const { isConnected, address, chain } = useAccount()
  const previousConnection = useRef<{ isConnected: boolean; address?: string; chainId?: number }>({
    isConnected: false,
    address: undefined,
    chainId: undefined,
  })
  
  // Track pending timeouts for cleanup
  const pendingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Stable callback refs to avoid effect re-runs
  const stableOnNewConnection = useCallback(onNewConnection, [])
  const stableOnDisconnection = useCallback(onDisconnection, [])

  // Reset previous connection state on mount to ensure clean detection
  useEffect(() => {
    previousConnection.current = { isConnected: false, address: undefined, chainId: undefined }
    console.log('🔄 Reset previous connection state on mount')

    return () => {
      // Cleanup any pending timeouts
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current)
        pendingTimeoutRef.current = null
      }
      console.log('🧹 useWalletConnectionTrigger cleanup')
    }
  }, [])

  useEffect(() => {
    const prev = previousConnection.current

    console.log('🔄 Connection state change detected:', {
      previous: { isConnected: prev.isConnected, address: prev.address, chainId: prev.chainId },
      current: { isConnected, address, chainId: chain?.id },
      triggerConditions: {
        newConnectionCondition: !prev.isConnected && isConnected && address,
        disconnectionCondition: prev.isConnected && !isConnected,
        chainChangeCondition: prev.chainId !== chain?.id && isConnected && address,
      },
      wallet: chain?.name || 'unknown',
    })

    // Clear any pending timeout from previous state changes
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current)
      pendingTimeoutRef.current = null
    }

    // Detect new connection (wasn't connected before, now is connected with address)
    if (!prev.isConnected && isConnected && address) {
      console.log('🎉 New wallet connection detected:', {
        address,
        chainId: chain?.id,
        chainName: chain?.name,
      })

      // Debounced authentication trigger with cleanup tracking
      pendingTimeoutRef.current = setTimeout(() => {
        console.log('🚀 Triggering authentication for new connection')
        stableOnNewConnection(address, chain?.id)
        pendingTimeoutRef.current = null
      }, 500) as any // Increased delay for better stability
    }
    // Handle network changes for already connected wallets (don't re-authenticate)
    else if (prev.isConnected && isConnected && address && prev.chainId !== chain?.id) {
      console.log('🔄 Network change detected, no re-authentication needed:', {
        from: prev.chainId,
        to: chain?.id,
        address,
      })
      // Just update the state without triggering authentication
    }

    // Detect disconnection (was connected before, now isn't)
    if (prev.isConnected && !isConnected) {
      console.log('👋 Wallet disconnection detected')
      stableOnDisconnection()
    }

    // Update previous state to include chainId
    previousConnection.current = {
      isConnected,
      address,
      chainId: chain?.id,
    }
  }, [isConnected, address, chain?.id, stableOnNewConnection, stableOnDisconnection])
}
