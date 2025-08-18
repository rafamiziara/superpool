import { useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'

interface ConnectionTriggerCallbacks {
  onNewConnection: (address: string, chainId?: number) => void
  onDisconnection: () => void
}

export const useWalletConnectionTrigger = ({ onNewConnection, onDisconnection }: ConnectionTriggerCallbacks) => {
  const { isConnected, address, chain } = useAccount()
  const previousConnection = useRef<{ isConnected: boolean; address?: string }>({
    isConnected: false,
    address: undefined,
  })

  // Reset previous connection state on mount to ensure clean detection
  useEffect(() => {
    previousConnection.current = { isConnected: false, address: undefined }
    console.log('🔄 Reset previous connection state on mount')

    return () => {
      console.log('🧹 useWalletConnectionTrigger cleanup')
    }
  }, [])

  useEffect(() => {
    const prev = previousConnection.current

    console.log('🔄 Connection state change detected:', {
      previous: { isConnected: prev.isConnected, address: prev.address },
      current: { isConnected, address, chainId: chain?.id },
      triggerConditions: {
        newConnectionCondition: !prev.isConnected && isConnected && address,
        disconnectionCondition: prev.isConnected && !isConnected,
      },
      wallet: chain?.name || 'unknown',
    })

    // Force log all connection state changes for debugging
    if (isConnected && address) {
      console.log('✅ Wallet is connected:', { address, chainId: chain?.id, connector: chain?.name })
    } else {
      console.log('❌ Wallet not connected:', { isConnected, address })
    }

    // Detect new connection (wasn't connected before, now is connected)
    if (!prev.isConnected && isConnected && address) {
      console.log('🎉 New wallet connection detected:', {
        address,
        chainId: chain?.id,
        chainName: chain?.name,
      })

      // Small delay to ensure wallet connection is stable before authentication
      setTimeout(() => {
        onNewConnection(address, chain?.id)
      }, 100)
    }

    // Detect disconnection (was connected before, now isn't)
    if (prev.isConnected && !isConnected) {
      console.log('👋 Wallet disconnection detected')
      onDisconnection()
    }

    // Update previous state
    previousConnection.current = {
      isConnected,
      address,
    }
  }, [isConnected, address, chain?.id, onNewConnection, onDisconnection])
}
