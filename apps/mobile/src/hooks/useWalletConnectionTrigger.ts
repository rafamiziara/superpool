import { autorun } from 'mobx'
import { useCallback, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useWalletConnectionStore } from '../stores'

interface ConnectionTriggerCallbacks {
  onNewConnection: (address: string, chainId?: number) => void
  onDisconnection: () => void
}

export const useWalletConnectionTrigger = ({ onNewConnection, onDisconnection }: ConnectionTriggerCallbacks) => {
  const { address, chain } = useAccount() // Keep for address and chain info
  const walletStore = useWalletConnectionStore()
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

  // MobX autorun: Automatically react to wallet connection state changes
  // This replaces the complex useEffect with 6+ dependencies
  useEffect(() => {
    const disposer = autorun(() => {
      const prev = previousConnection.current
      // Use MobX reactive state - automatically tracks dependencies!
      const { isConnected } = walletStore

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
        pendingTimeoutRef.current = setTimeout(() => {
          console.log('🚀 Triggering authentication for new connection')
          stableOnNewConnection(address, chain?.id)
          pendingTimeoutRef.current = null
        }, 500) as unknown as number
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
        console.log('👋 Wallet disconnection detected')
        stableOnDisconnection()
      }

      // Update previous state to include chainId
      previousConnection.current = {
        isConnected,
        address,
        chainId: chain?.id,
      }
    })

    // Cleanup autorun when component unmounts
    return disposer
  }, []) // No dependencies needed! MobX tracks everything automatically
}
