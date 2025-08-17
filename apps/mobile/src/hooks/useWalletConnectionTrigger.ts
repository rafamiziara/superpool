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
    address: undefined
  })

  useEffect(() => {
    const prev = previousConnection.current
    
    // Detect new connection (wasn't connected before, now is connected)
    if (!prev.isConnected && isConnected && address) {
      console.log('New wallet connection detected:', address)
      onNewConnection(address, chain?.id)
    }
    
    // Detect disconnection (was connected before, now isn't)
    if (prev.isConnected && !isConnected) {
      console.log('Wallet disconnection detected')
      onDisconnection()
    }

    // Update previous state
    previousConnection.current = {
      isConnected,
      address
    }
  }, [isConnected, address, chain?.id, onNewConnection, onDisconnection])
}