import { AuthenticationData } from '@superpool/types'
import { useEffect, useState } from 'react'
import { AutoAuthHook, AutoAuthState } from '../../types/auth'
import { useFirebaseAuth } from './useFirebaseAuth'
import { useMessageGeneration } from './useMessageGeneration'
import { useSignatureHandling } from './useSignatureHandling'
import { useWalletListener } from './useWalletListener'

export const useAutoAuth = (): AutoAuthHook => {
  const walletListener = useWalletListener()
  const messageGeneration = useMessageGeneration()
  const signatureHandling = useSignatureHandling()
  const firebaseAuth = useFirebaseAuth()

  const [authState, setAuthState] = useState<AutoAuthState>({
    isAuthenticating: false,
    error: null,
    progress: 0,
  })

  // 🚀 THE MAGIC: Auto-authenticate when wallet connects
  useEffect(() => {
    const autoAuthenticate = async () => {
      // Only auto-auth if: wallet connected + no user + not already authenticating
      if (!walletListener.isConnected || !walletListener.address || firebaseAuth.user || authState.isAuthenticating) {
        return
      }

      console.log('🚀 Auto-authenticating for:', walletListener.address)
      setAuthState((s) => ({ ...s, isAuthenticating: true, error: null, progress: 0 }))

      try {
        // Step 1: Generate auth message (0-25%)
        console.log('📝 Step 1: Generating auth message...')
        setAuthState((s) => ({ ...s, progress: 10 }))
        const authMessage = await messageGeneration.generateMessage(walletListener.address!)
        setAuthState((s) => ({ ...s, progress: 25 }))

        // Step 2: Request signature (25-50%)
        console.log('✍️ Step 2: Requesting wallet signature...')
        setAuthState((s) => ({ ...s, progress: 35 }))
        const signature = await signatureHandling.requestSignature(authMessage.message)
        setAuthState((s) => ({ ...s, progress: 50 }))

        // Step 3: Firebase authentication (50-100%)
        console.log('🔥 Step 3: Authenticating with Firebase...')
        setAuthState((s) => ({ ...s, progress: 75 }))
        const authData: AuthenticationData = {
          walletAddress: walletListener.address!,
          signature,
          nonce: authMessage.nonce,
          timestamp: authMessage.timestamp,
          message: authMessage.message,
        }
        await firebaseAuth.authenticateWithSignature(authData)

        setAuthState((s) => ({ ...s, progress: 100, isAuthenticating: false }))
        console.log('✅ Auto-authentication complete!')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Auto-authentication failed'
        console.error('❌ Auto-authentication failed:', errorMessage)

        setAuthState((s) => ({
          ...s,
          error: errorMessage,
          isAuthenticating: false,
          progress: 0,
        }))
      }
    }

    autoAuthenticate()
  }, [
    walletListener.isConnected,
    walletListener.address,
    firebaseAuth.user,
    authState.isAuthenticating, // Include to prevent re-triggering
  ])

  // Auto-reset on wallet disconnect
  useEffect(() => {
    if (!walletListener.isConnected) {
      console.log('🔌 Wallet disconnected - resetting auth state')
      setAuthState({ isAuthenticating: false, error: null, progress: 0 })

      // Clear auth module states
      messageGeneration.clearState()
      // Note: Firebase auth and signature states will be cleared by their respective hooks
    }
  }, [walletListener.isConnected, messageGeneration])

  // Manual retry function
  const retryAuthentication = async () => {
    if (!walletListener.isConnected || !walletListener.address) {
      throw new Error('Wallet not connected')
    }

    setAuthState({ isAuthenticating: false, error: null, progress: 0 })
    // This will trigger the useEffect above
  }

  return {
    // Combined wallet state
    isConnected: walletListener.isConnected,
    address: walletListener.address,
    chainId: walletListener.chainId,

    // User state
    user: firebaseAuth.user,

    // Auto-auth state
    isAuthenticating: authState.isAuthenticating,
    error: authState.error,
    progress: authState.progress,

    // Computed states
    isFullyAuthenticated: walletListener.isConnected && !!firebaseAuth.user,
    needsAuthentication: walletListener.isConnected && !firebaseAuth.user && !authState.isAuthenticating,

    // Actions
    retryAuthentication,
  }
}
