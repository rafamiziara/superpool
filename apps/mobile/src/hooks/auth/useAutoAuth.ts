import type { AuthenticationData } from '@superpool/types'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { FIREBASE_AUTH } from '../../config/firebase'
import { registerForPushNotifications } from '../../services/pushNotifications'
import { authStore, selectIsAuthenticating, useAuthStore } from '../../stores/AuthStore'
import { getUniqueDeviceId } from '../../utils/deviceId'
import { logger } from '../../utils/logger'
import { useFirebaseAuth } from './useFirebaseAuth'
import { useMessageGeneration } from './useMessageGeneration'
import { useSignatureHandling } from './useSignatureHandling'

export const useAutoAuth = (): void => {
  const messageGeneration = useMessageGeneration()
  const signatureHandling = useSignatureHandling()
  const firebaseAuth = useFirebaseAuth()

  /*
    Subscribed here rather than read from the store inside the effect.

    These three used to be MobX observable reads in the dependency arrays
    below, which re-ran the effect only because the calling screen was an
    `observer`. Nothing traces reads now, so the hook subscribes for itself —
    and it no longer depends on how its caller is wrapped. Connecting a wallet,
    switching accounts and clearing an error are exactly the three events this
    effect exists to answer.
  */
  const isWalletConnected = useAuthStore((state) => state.isWalletConnected)
  const walletAddress = useAuthStore((state) => state.walletAddress)
  const error = useAuthStore((state) => state.error)

  // Auto-authentication effect with stable dependencies
  useEffect(() => {
    const autoAuthenticate = async () => {
      // Guard conditions
      if (!isWalletConnected || !walletAddress || FIREBASE_AUTH.currentUser || selectIsAuthenticating(authStore.getState()) || error) {
        return
      }

      logger.debug('🚀 Auto-authenticating for:', walletAddress)

      // Try to acquire auth lock
      if (!authStore.getState().acquireAuthLock(walletAddress)) {
        logger.debug('🔒 Authentication already in progress, skipping')
        return
      }

      try {
        // Step 1: Connect wallet (already done)
        authStore.getState().startStep('connect-wallet')
        authStore.getState().completeStep('connect-wallet')

        // Step 2: Acquire lock (already done)
        authStore.getState().startStep('acquire-lock')
        authStore.getState().completeStep('acquire-lock')

        // Step 3: Generate auth message
        authStore.getState().startStep('generate-message')
        logger.debug('📝 Step 3: Generating auth message...')
        const authMessage = await messageGeneration.generateMessage(walletAddress)
        authStore.getState().completeStep('generate-message')

        // Step 4: Request signature
        authStore.getState().startStep('request-signature')
        logger.debug('✍️ Step 4: Requesting wallet signature...')
        const signature = await signatureHandling.requestSignature(authMessage.message)
        authStore.getState().completeStep('request-signature')

        // Step 5: Verify signature (implicit in Firebase auth)
        authStore.getState().startStep('verify-signature')
        authStore.getState().completeStep('verify-signature')

        // Step 6: Firebase authentication
        authStore.getState().startStep('firebase-auth')
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
          walletAddress,
          signature,
          nonce: authMessage.nonce,
          timestamp: authMessage.timestamp,
          message: authMessage.message,
          deviceId,
          platform,
        }

        const user = await firebaseAuth.authenticateWithSignature(authData)
        authStore.getState().completeStep('firebase-auth')
        authStore.getState().setUser(user)

        logger.debug('✅ Auto-authentication complete!')

        // Deliberately after the step is reported complete, and deliberately
        // not awaited into the auth result: this needs a signed-in caller (the
        // callable takes the wallet from `request.auth.uid`), but a sign-in
        // that worked must not be reported as failed because a push token
        // could not be arranged. It prompts for nothing — with no permission
        // granted there is simply no token to register.
        void registerForPushNotifications()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Auto-authentication failed'
        logger.error('❌ Auto-authentication failed:', errorMessage)

        const { currentStep, failStep } = authStore.getState()
        if (currentStep) {
          failStep(currentStep, errorMessage)
        }

        authStore.getState().setError(errorMessage)
      } finally {
        authStore.getState().releaseAuthLock()
      }
    }

    // Only run when wallet connection state changes or error is cleared
    autoAuthenticate()
  }, [isWalletConnected, walletAddress, error, messageGeneration, signatureHandling, firebaseAuth])

  // Auto-reset on wallet disconnect
  useEffect(() => {
    if (!isWalletConnected) {
      logger.debug('🔌 Wallet disconnected - resetting auth state')
      authStore.getState().reset()
      messageGeneration.clearState()
    }
    // Without `isWalletConnected` a disconnect never resets the auth state, and
    // the next wallet inherits the previous one's.
  }, [isWalletConnected, messageGeneration])
}
