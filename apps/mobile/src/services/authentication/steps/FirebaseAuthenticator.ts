import type { SignatureResult } from '@superpool/types'
import { signInWithCustomToken } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { Platform } from 'react-native'
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS } from '../../../firebase.config'
import { devOnly } from '../../../utils'

const verifySignatureAndLogin = httpsCallable(FIREBASE_FUNCTIONS, 'verifySignatureAndLogin')

export interface SignatureVerificationContext {
  walletAddress: string
  chainId?: number
}

/**
 * Handles Firebase authentication including signature verification and token-based sign-in
 * Separates Firebase auth concerns from orchestration
 */
export class FirebaseAuthenticator {
  /**
   * Verifies signature with backend and gets Firebase token
   */
  async verifySignatureAndGetToken(context: SignatureVerificationContext, signatureResult: SignatureResult): Promise<string> {
    console.log('🔍 Verifying signature with backend...')

    // Get device info for proper App Check validation
    let deviceInfo = {}

    if (signatureResult.signatureType === 'safe-wallet') {
      deviceInfo = {
        deviceId: 'safe-wallet-device',
        platform: 'web' as const,
      }
    } else {
      try {
        // Get device ID from platform-specific sources
        const platform = Platform.OS as 'ios' | 'android'

        // Use a combination of app instance and platform for device ID
        const deviceId = `mobile-${platform}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        deviceInfo = {
          deviceId,
          platform,
        }

        console.log('📱 Generated device info:', { deviceId, platform })
      } catch (error) {
        console.warn('⚠️ Failed to get device info:', error)
        // Fallback for web or other platforms
        deviceInfo = {
          deviceId: `fallback-device-${Date.now()}`,
          platform: 'ios' as const,
        }
      }
    }

    const signatureResponse = await verifySignatureAndLogin({
      walletAddress: context.walletAddress,
      signature: signatureResult.signature,
      chainId: context.chainId,
      signatureType: signatureResult.signatureType,
      ...deviceInfo,
    })

    console.log('✅ Backend verification successful')
    const { firebaseToken } = signatureResponse.data as { firebaseToken: string }

    devOnly('📋 Firebase token received:', typeof firebaseToken, firebaseToken ? 'present' : 'missing')
    // Never log actual token content, even in development

    return firebaseToken
  }

  /**
   * Signs in with Firebase using custom token with Safe wallet retry logic
   */
  async signInWithFirebase(firebaseToken: string, signatureType: string): Promise<void> {
    console.log('🔑 Signing in with Firebase...')

    const isSafeWallet = signatureType === 'safe-wallet'

    // Add stabilization delay for Safe wallets
    if (isSafeWallet) {
      console.log('⏳ Adding delay for Safe wallet connection stabilization...')
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    try {
      await signInWithCustomToken(FIREBASE_AUTH, firebaseToken)
      console.log('✅ Firebase authentication successful')
    } catch (firebaseError) {
      console.error('❌ Firebase authentication failed:', firebaseError)
      this.logTokenDetails(firebaseToken)

      // For Safe wallets, retry with increasing delays
      if (isSafeWallet) {
        console.log('🔄 Retrying Firebase authentication for Safe wallet...')
        await this.retrySafeWalletFirebaseAuth(firebaseToken)
      } else {
        throw firebaseError
      }
    }
  }

  /**
   * Retry logic specifically for Safe wallet Firebase authentication
   */
  private async retrySafeWalletFirebaseAuth(firebaseToken: string): Promise<void> {
    let retryCount = 0
    const maxRetries = 3

    while (retryCount < maxRetries) {
      retryCount++
      const delay = retryCount * 1000 // 1s, 2s, 3s delays

      try {
        console.log(`🔄 Retry ${retryCount}/${maxRetries} after ${delay}ms delay...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        await signInWithCustomToken(FIREBASE_AUTH, firebaseToken)
        console.log(`✅ Firebase authentication successful on retry ${retryCount}`)
        return // Success, exit retry loop
      } catch (retryError) {
        console.error(`❌ Firebase authentication retry ${retryCount}/${maxRetries} failed:`, retryError)

        if (retryCount >= maxRetries) {
          // Check for App Check issues on final retry failure
          const errorMessage = retryError instanceof Error ? retryError.message : String(retryError)
          if (errorMessage.includes('internal') || errorMessage.includes('app-check')) {
            console.log('🚨 Detected potential App Check issue for Safe wallet')
            throw new Error(
              'Safe wallet authentication failed due to device verification. Please try disconnecting and reconnecting your wallet.'
            )
          }
          throw retryError
        }
      }
    }
  }

  /**
   * Safely log token details for debugging (never logs actual token content)
   */
  private logTokenDetails(firebaseToken: string): void {
    devOnly('📋 Token details:', {
      tokenType: typeof firebaseToken,
      tokenPresent: !!firebaseToken,
      tokenLength: firebaseToken?.length,
    })
  }
}
