import { AuthenticationData } from '@superpool/types'
import { useEffect, useState } from 'react'
import { FIREBASE_AUTH } from '../../config/firebase'
import { authStore } from '../../stores/AuthStore'
import { AutoAuthHook } from '../../types/auth'
import { useFirebaseAuth } from './useFirebaseAuth'
import { useMessageGeneration } from './useMessageGeneration'
import { useSignatureHandling } from './useSignatureHandling'

export const useAutoAuth = (): AutoAuthHook => {
  const messageGeneration = useMessageGeneration()
  const signatureHandling = useSignatureHandling()
  const firebaseAuth = useFirebaseAuth()

  // Sync MobX state to React state for reactivity
  const [user, setUser] = useState(authStore.user)
  const [isAuthenticating, setIsAuthenticating] = useState(authStore.isAuthenticating)
  const [error, setError] = useState(authStore.error)
  const [progress, setProgress] = useState(authStore.progress)

  // Sync MobX store state to React state
  useEffect(() => {
    const updateState = () => {
      const newUser = authStore.user
      const newIsAuthenticating = authStore.isAuthenticating
      const newError = authStore.error
      const newProgress = authStore.progress

      // Log state changes for debugging
      if (newUser !== user) {
        console.log('🔄 User state changed:', { from: user?.walletAddress, to: newUser?.walletAddress })
      }

      setUser(newUser)
      setIsAuthenticating(newIsAuthenticating)
      setError(newError)
      setProgress(newProgress)
    }

    // Initial sync
    updateState()

    // Set up a simple polling mechanism to detect changes
    const interval = setInterval(updateState, 100)

    return () => clearInterval(interval)
  }, [user])

  // Auto-authentication effect
  useEffect(() => {
    const autoAuthenticate = async () => {
      // Guard conditions
      if (!authStore.isWalletConnected || !authStore.walletAddress || FIREBASE_AUTH.currentUser || isAuthenticating) {
        return
      }

      console.log('🚀 Auto-authenticating for:', authStore.walletAddress)

      // Try to acquire auth lock
      if (!authStore.acquireAuthLock(authStore.walletAddress)) {
        console.log('🔒 Authentication already in progress, skipping')
        return
      }

      try {
        // Step 1: Connect wallet (already done)
        authStore.startStep('connect-wallet')
        authStore.completeStep('connect-wallet')

        // Step 2: Acquire lock (already done)
        authStore.startStep('acquire-lock')
        authStore.completeStep('acquire-lock')

        // Step 3: Generate auth message
        authStore.startStep('generate-message')
        console.log('📝 Step 3: Generating auth message...')
        const authMessage = await messageGeneration.generateMessage(authStore.walletAddress!)
        authStore.completeStep('generate-message')

        // Step 4: Request signature
        authStore.startStep('request-signature')
        console.log('✍️ Step 4: Requesting wallet signature...')
        const signature = await signatureHandling.requestSignature(authMessage.message)
        authStore.completeStep('request-signature')

        // Step 5: Verify signature (implicit in Firebase auth)
        authStore.startStep('verify-signature')
        authStore.completeStep('verify-signature')

        // Step 6: Firebase authentication
        authStore.startStep('firebase-auth')
        console.log('🔥 Step 6: Authenticating with Firebase...')
        const authData: AuthenticationData = {
          walletAddress: authStore.walletAddress!,
          signature,
          nonce: authMessage.nonce,
          timestamp: authMessage.timestamp,
          message: authMessage.message,
        }
        const user = await firebaseAuth.authenticateWithSignature(authData)
        authStore.completeStep('firebase-auth')
        authStore.setUser(user)

        console.log('✅ Auto-authentication complete!')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Auto-authentication failed'
        console.error('❌ Auto-authentication failed:', errorMessage)

        if (authStore.currentStep) {
          authStore.failStep(authStore.currentStep, errorMessage)
        }
        authStore.setError(errorMessage)
      } finally {
        authStore.releaseAuthLock()
      }
    }

    autoAuthenticate()
  }, [
    authStore.isWalletConnected,
    authStore.walletAddress,
    firebaseAuth.user,
    isAuthenticating, // Watch local reactive state
  ])

  // Auto-reset on wallet disconnect
  useEffect(() => {
    if (!authStore.isWalletConnected) {
      console.log('🔌 Wallet disconnected - resetting auth state')
      authStore.reset()
      messageGeneration.clearState()
    }
  }, [authStore.isWalletConnected, messageGeneration.clearState])

  // Manual retry function
  const retryAuthentication = async () => {
    if (!authStore.isWalletConnected || !authStore.walletAddress) {
      throw new Error('Wallet not connected')
    }

    console.log('🔄 Retrying authentication...')
    authStore.resetProgress()
    // This will trigger the useEffect above
  }

  return {
    // Combined wallet state
    isConnected: authStore.isWalletConnected,
    address: authStore.walletAddress,
    chainId: authStore.chainId,

    // User state (reactive to MobX changes)
    user,

    // Auth state (reactive to MobX changes)
    isAuthenticating,
    error,
    progress,

    // Computed states (reactive)
    isFullyAuthenticated: authStore.isWalletConnected && !!user,
    needsAuthentication: authStore.isWalletConnected && !user && !isAuthenticating,

    // Actions
    retryAuthentication,
  }
}
