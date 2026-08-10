import { AuthenticationData } from '@superpool/types'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { FIREBASE_AUTH } from '../../config/firebase'
import { authStore } from '../../stores/AuthStore'
import { getUniqueDeviceId } from '../../utils/deviceId'
import { logger } from '../../utils/logger'
import { useFirebaseAuth } from './useFirebaseAuth'
import { useMessageGeneration } from './useMessageGeneration'
import { useSignatureHandling } from './useSignatureHandling'

export const useAutoAuth = (): void => {
  const messageGeneration = useMessageGeneration()
  const signatureHandling = useSignatureHandling()
  const firebaseAuth = useFirebaseAuth()

  // Auto-authentication effect with stable dependencies
  useEffect(() => {
    const autoAuthenticate = async () => {
      // Guard conditions - check current state directly from store
      if (
        !authStore.isWalletConnected ||
        !authStore.walletAddress ||
        FIREBASE_AUTH.currentUser ||
        authStore.isAuthenticating ||
        authStore.error
      ) {
        return
      }

      logger.debug('🚀 Auto-authenticating for:', authStore.walletAddress)

      // Try to acquire auth lock
      if (!authStore.acquireAuthLock(authStore.walletAddress)) {
        logger.debug('🔒 Authentication already in progress, skipping')
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
        logger.debug('📝 Step 3: Generating auth message...')
        const authMessage = await messageGeneration.generateMessage(authStore.walletAddress!)
        authStore.completeStep('generate-message')

        // Step 4: Request signature
        authStore.startStep('request-signature')
        logger.debug('✍️ Step 4: Requesting wallet signature...')
        const signature = await signatureHandling.requestSignature(authMessage.message)
        authStore.completeStep('request-signature')

        // Step 5: Verify signature (implicit in Firebase auth)
        authStore.startStep('verify-signature')
        authStore.completeStep('verify-signature')

        // Step 6: Firebase authentication
        authStore.startStep('firebase-auth')
        logger.debug('🔥 Step 6: Authenticating with Firebase...')

        // Get device info for device approval (optional)
        let deviceId: string | undefined
        let platform: 'android' | 'ios' | 'web' | undefined

        try {
          const uniqueDeviceId = await getUniqueDeviceId()
          if (uniqueDeviceId) {
            deviceId = uniqueDeviceId
            platform = Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web'
          }
        } catch (error) {
          logger.warn('Could not get device ID, continuing without device approval:', error)
        }

        const authData: AuthenticationData = {
          walletAddress: authStore.walletAddress!,
          signature,
          nonce: authMessage.nonce,
          timestamp: authMessage.timestamp,
          message: authMessage.message,
          deviceId,
          platform,
        }

        const user = await firebaseAuth.authenticateWithSignature(authData)
        authStore.completeStep('firebase-auth')
        authStore.setUser(user)

        logger.debug('✅ Auto-authentication complete!')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Auto-authentication failed'
        logger.error('❌ Auto-authentication failed:', errorMessage)

        if (authStore.currentStep) {
          authStore.failStep(authStore.currentStep, errorMessage)
        }

        authStore.setError(errorMessage)
      } finally {
        authStore.releaseAuthLock()
      }
    }

    // Only run when wallet connection state changes or error is cleared
    autoAuthenticate()
  }, [authStore.isWalletConnected, authStore.walletAddress, authStore.error, messageGeneration, signatureHandling, firebaseAuth])

  // Auto-reset on wallet disconnect
  useEffect(() => {
    if (!authStore.isWalletConnected) {
      logger.debug('🔌 Wallet disconnected - resetting auth state')
      authStore.reset()
      messageGeneration.clearState()
    }
  }, [authStore.isWalletConnected, messageGeneration])
}
