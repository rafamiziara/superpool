import type { SignatureResult } from '@superpool/types'
import { signInWithCustomToken } from 'firebase/auth'
import { HttpsCallable, httpsCallable } from 'firebase/functions'
import { Platform } from 'react-native'
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS } from '../../../firebase.config'
import { devOnly } from '../../../utils'
import { FirebaseAuthCircuitBreakers } from '../utils/circuitBreaker'
import { ErrorCategorizer, RetryExecutor, RetryPolicies } from '../utils/retryPolicies'

export interface SignatureVerificationContext {
  walletAddress: string
  chainId?: number
}

/**
 * Handles Firebase authentication including signature verification and token-based sign-in
 * Separates Firebase auth concerns from orchestration
 */
export class FirebaseAuthenticator {
  private verifySignatureAndLogin: HttpsCallable

  constructor(verifySignatureAndLoginFn?: HttpsCallable) {
    this.verifySignatureAndLogin = verifySignatureAndLoginFn || httpsCallable(FIREBASE_FUNCTIONS, 'verifySignatureAndLogin')
  }
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

    const signatureResponse = await this.verifySignatureAndLogin({
      walletAddress: context.walletAddress,
      signature: signatureResult.signature,
      chainId: context.chainId,
      signatureType: signatureResult.signatureType,
      ...deviceInfo,
    })

    console.log('✅ Backend verification successful')
    const { firebaseToken } = signatureResponse.data as {
      firebaseToken: string
    }

    devOnly('📋 Firebase token received:', typeof firebaseToken, firebaseToken ? 'present' : 'missing')
    // Never log actual token content, even in development

    return firebaseToken
  }

  /**
   * Signs in with Firebase using enhanced fail-fast approach with intelligent retry
   */
  async signInWithFirebase(firebaseToken: string, signatureType: string): Promise<void> {
    console.log('🔑 Starting Firebase authentication with fail-fast strategy...')

    // Get circuit breaker for this signature type
    const circuitBreaker = FirebaseAuthCircuitBreakers.getCircuitBreakerForSignatureType(signatureType)

    // Get appropriate retry policy
    const retryPolicy = RetryPolicies.getPolicyForWallet(signatureType, {
      isFirstAttempt: true,
    })

    console.log(`📋 Using retry policy: ${retryPolicy.name} (max ${retryPolicy.maxRetries} retries)`)

    // Execute Firebase sign-in with circuit breaker protection
    const circuitResult = await circuitBreaker.execute(async () => {
      // Execute sign-in with retry policy
      return await RetryExecutor.executeWithRetry(
        async () => {
          // Add stabilization delay for Safe wallets on first attempt only
          if (signatureType === 'safe-wallet') {
            console.log('⏳ Adding stabilization delay for Safe wallet...')
            await new Promise((resolve) => setTimeout(resolve, 1500))
          }

          await signInWithCustomToken(FIREBASE_AUTH, firebaseToken)
          console.log('✅ Firebase authentication successful')
        },
        retryPolicy,
        {
          onRetry: (context) => {
            console.log(`🔄 Firebase auth retry ${context.attempt}/${context.totalAttempts}`, {
              error: context.lastError.message,
              elapsedTime: context.elapsedTime,
            })
          },
        }
      )
    })

    // Handle circuit breaker result
    if (!circuitResult.success) {
      console.error('❌ Firebase authentication failed with circuit breaker', {
        circuitState: circuitResult.circuitState,
        error: circuitResult.error?.message,
        metrics: circuitResult.metrics,
      })

      this.logTokenDetails(firebaseToken)

      // Provide user-friendly error message based on error category
      const userFriendlyMessage = ErrorCategorizer.getUserFriendlyMessage(circuitResult.error || new Error('Authentication failed'))

      throw new Error(`Firebase authentication failed: ${userFriendlyMessage}`)
    }

    // Handle retry executor result
    const retryResult = circuitResult.result
    if (!retryResult?.success) {
      console.error('❌ Firebase authentication failed after retries', {
        error: retryResult?.error?.message,
        attemptsMade: retryResult?.attemptsMade,
        totalTime: retryResult?.totalTime,
        policyUsed: retryResult?.policyUsed,
      })

      this.logTokenDetails(firebaseToken)

      const userFriendlyMessage = ErrorCategorizer.getUserFriendlyMessage(retryResult?.error || new Error('Authentication failed'))

      throw new Error(`Firebase authentication failed: ${userFriendlyMessage}`)
    }

    console.log('✅ Firebase authentication completed successfully', {
      circuitState: circuitResult.circuitState,
      attemptsUsed: retryResult.attemptsMade,
      totalTime: retryResult.totalTime,
      policyUsed: retryResult.policyUsed,
    })
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
