import { useCallback, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useWalletStore } from '../../stores'

interface ConnectionTriggerCallbacks {
  onNewConnection: (address: string, chainId?: number) => void
  onDisconnection: () => void
}

export const useWalletConnectionTrigger = ({ onNewConnection, onDisconnection }: ConnectionTriggerCallbacks) => {
  const { address, chain, isConnected } = useAccount() // Keep for address and chain info
  const walletStore = useWalletStore()
  const previousConnection = useRef<{ isConnected: boolean; address?: string; chainId?: number }>({
    isConnected: false,
    address: undefined,
    chainId: undefined,
  })

  // Track pending timeouts for cleanup
  const pendingTimeoutRef = useRef<number | null>(null)

  // Stable callback refs to avoid effect re-runs
  const stableOnNewConnection = useCallback(onNewConnection, [onNewConnection])
  const stableOnDisconnection = useCallback(onDisconnection, [onDisconnection])

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

  // Use regular useEffect since wagmi state is not MobX observable
  // We need to track wagmi's isConnected, address, and chain changes directly
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

    // Sync wallet connection state with MobX store whenever state changes
    try {
      walletStore.updateConnectionState(isConnected, address, chain?.id)
      console.log('🔄 Synced wallet state with MobX store:', {
        isConnected,
        address: address || 'undefined',
        chainId: chain?.id || 'undefined',
      })
    } catch (error) {
      console.warn('⚠️ Failed to sync wallet state with MobX store:', error)
    }

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
      // Increased delay to 2500ms to avoid conflicts with connecting screen grace period (2000ms)
      pendingTimeoutRef.current = setTimeout(() => {
        console.log('🚀 Triggering authentication for new connection (delayed)')
        try {
          stableOnNewConnection(address, chain?.id)
          console.log('✅ Authentication callback executed successfully')
        } catch (error) {
          console.error('❌ Authentication callback failed:', error)
        }
        pendingTimeoutRef.current = null
      }, 2500) as unknown as number
    }
    // Handle network changes for already connected wallets (don't re-authenticate)
    else if (prev.isConnected && isConnected && address && prev.chainId !== chain?.id) {
      console.log('🔄 Network change detected, no re-authentication needed:', {
        from: prev.chainId,
        to: chain?.id,
        address,
      })
      // Network changes should NOT trigger new authentication flows
    }

    // Detect disconnection (was connected before, now isn't)
    if (prev.isConnected && !isConnected) {
      console.log('👋 Wallet disconnection detected - calling stableOnDisconnection')
      stableOnDisconnection()
    }

    // Update previous state to include chainId
    previousConnection.current = {
      isConnected,
      address,
      chainId: chain?.id,
    }
  }, [isConnected, address, chain?.id, stableOnNewConnection, stableOnDisconnection, walletStore]) // Track wagmi state changes directly
}
