import { useEffect } from 'react'
import { useAccount } from 'wagmi'

export const useWalletListener = () => {
  const { address, chainId, isConnected, isConnecting } = useAccount()

  useEffect(() => {
    if (isConnected && address) {
      console.log('✅ Wallet auto-connected:', address)
    } else if (!isConnected) {
      console.log('❌ Wallet disconnected - clearing auth state')
    }
  }, [isConnected, address])

  return {
    isConnected,
    address: address || null,
    chainId: chainId || null,
    isConnecting,
  }
}
