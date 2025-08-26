import { router } from 'expo-router'
import { signInWithCustomToken } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import type { Connector } from 'wagmi'
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS } from '../firebase.config'
import { AuthStep } from '@superpool/types'
import { getGlobalLogoutState } from '../hooks/auth/useLogoutState'
import { AuthenticationStore } from '../stores/AuthenticationStore'
import { AtomicConnectionState, WalletStore } from '../stores/WalletStore'
import { devOnly } from '../utils/secureLogger'
import { SessionManager } from '../utils/sessionManager'
import { authToasts } from '../utils/toast'
import { AuthErrorRecoveryService } from './authErrorRecoveryService'
import { SignatureFunctions, SignatureService } from './signatureService'

const verifySignatureAndLogin = httpsCallable(FIREBASE_FUNCTIONS, 'verifySignatureAndLogin')
const generateAuthMessage = httpsCallable(FIREBASE_FUNCTIONS, 'generateAuthMessage')

export interface AuthProgressCallbacks {
  onStepStart?: (step: AuthStep) => void
  onStepComplete?: (step: AuthStep) => void
  onStepFail?: (step: AuthStep, error: string) => void
}

export interface AuthenticationContext {
  walletAddress: string
  connector?: Connector
  chainId?: number
  signatureFunctions: SignatureFunctions
  disconnect: () => void
  progressCallbacks?: AuthProgressCallbacks
}

export interface AuthenticationLock {
  isLocked: boolean
  startTime: number
  walletAddress: string | null
  abortController: AbortController | null
}

export class AuthenticationOrchestrator {
  constructor(private authStore: AuthenticationStore, private walletStore: WalletStore) {
    // Initialize AuthErrorRecoveryService with MobX stores
    AuthErrorRecoveryService.initialize(authStore, walletStore)
  }

  /**
   * Acquires authentication lock to prevent concurrent attempts
   * Now uses MobX AuthenticationStore instead of ref
   */
  private acquireAuthLock(walletAddress: string): boolean {
    // Check if already locked
    if (this.authStore.isAuthenticating) {
      const timeSinceLock = Date.now() - this.authStore.authLock.startTime

      // If authentication has been running for more than 2 minutes, force release
      if (timeSinceLock > 120000) {
        console.warn(`🕐 Authentication lock expired (${timeSinceLock}ms), force releasing...`)
        this.authStore.releaseAuthLock()
      } else {
        console.log(`⚠️ Authentication already in progress for ${this.authStore.authWalletAddress} (${timeSinceLock}ms ago)`)

        // If it's the same wallet address, this is likely a duplicate request
        if (this.authStore.authWalletAddress === walletAddress) {
          console.log('🚫 Duplicate authentication attempt for same wallet, ignoring')
          return false
        }

        // Different wallet - abort current and proceed with new one
        console.log('🔄 Different wallet detected, aborting current authentication')
        this.authStore.releaseAuthLock()
      }
    }

    // Use store method to acquire lock
    const acquired = this.authStore.acquireAuthLock(walletAddress)
    if (!acquired) {
      console.log('❌ Failed to acquire authentication lock')
      return false
    }

    return true
  }

  /**
   * Releases authentication lock
   * Now delegates to MobX AuthenticationStore
   */
  private releaseAuthLock(): void {
    this.authStore.releaseAuthLock()
  }

  /**
   * Validates that authentication should proceed
   */
  private async validatePreConditions(context: AuthenticationContext): Promise<boolean> {
    // Check if we're in the middle of a logout process
    try {
      const { isLoggingOut } = getGlobalLogoutState()
      if (isLoggingOut) {
        console.log('⏸️ Skipping authentication: logout in progress')
        return false
      }
    } catch (error) {
      console.log('ℹ️ Global logout state not initialized, continuing...')
    }

    // Validate initial connection state using store
    const validation = this.walletStore.validateInitialState(context.walletAddress)

    if (!validation.isValid) {
      console.warn('❌ Invalid initial connection state:', validation.error)
      throw new Error(validation.error || 'Invalid connection state')
    }

    return true
  }

  /**
   * Generates authentication message from backend
   */
  private async generateAuthenticationMessage(walletAddress: string): Promise<{
    message: string
    nonce: string
    timestamp: number
  }> {
    const messageResponse = await generateAuthMessage({ walletAddress })
    const {
      message,
      nonce,
      timestamp: rawTimestamp,
    } = messageResponse.data as {
      message: string
      nonce: string
      timestamp: number
    }

    const timestamp = typeof rawTimestamp === 'number' ? rawTimestamp : parseInt(String(rawTimestamp), 10)

    console.log('✅ Authentication message generated:', message?.substring(0, 50) + '...')
    console.log('📊 Timestamp debug:', { rawTimestamp, timestamp, type: typeof timestamp })

    if (isNaN(timestamp)) {
      throw new Error('Invalid timestamp received from authentication message')
    }

    return { message, nonce, timestamp }
  }

  /**
   * Requests signature from wallet
   */
  private async requestWalletSignature(context: AuthenticationContext, message: string, nonce: string, timestamp: number) {
    console.log('✍️ Step 4: Requesting wallet signature...')

    const signatureRequest = {
      message,
      nonce,
      timestamp,
      walletAddress: context.walletAddress,
      chainId: context.chainId,
    }

    return await SignatureService.requestSignature(signatureRequest, context.signatureFunctions, context.connector)
  }

  /**
   * Verifies signature with backend and gets Firebase token
   */
  private async verifySignatureAndGetToken(context: AuthenticationContext, signature: string, signatureType: string): Promise<string> {
    console.log('🔍 Step 5: Verifying signature...')

    // For Safe wallets, we need to provide device info for proper App Check validation
    const deviceInfo =
      signatureType === 'safe-wallet'
        ? {
            deviceId: 'safe-wallet-device',
            platform: 'web' as const,
          }
        : {}

    const signatureResponse = await verifySignatureAndLogin({
      walletAddress: context.walletAddress,
      signature,
      chainId: context.chainId,
      signatureType,
      ...deviceInfo,
    })

    console.log('✅ Backend verification successful')
    const { firebaseToken } = signatureResponse.data as { firebaseToken: string }

    devOnly('📋 Firebase token received:', typeof firebaseToken, firebaseToken ? 'present' : 'missing')
    // Never log actual token content, even in development

    return firebaseToken
  }

  /**
   * Signs in with Firebase using custom token
   */
  private async signInWithFirebase(firebaseToken: string, signatureType: string): Promise<void> {
    console.log('🔑 Step 6: Signing in with Firebase...')

    // Add a small delay for Safe wallets to allow connection to stabilize
    const isSafeWallet = signatureType === 'safe-wallet'
    if (isSafeWallet) {
      console.log('⏳ Adding delay for Safe wallet connection stabilization...')
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    try {
      await signInWithCustomToken(FIREBASE_AUTH, firebaseToken)
      console.log('✅ Firebase authentication successful')
    } catch (firebaseError) {
      console.error('❌ Firebase authentication failed:', firebaseError)
      // Never log token details for security reasons
      devOnly('📋 Token details:', {
        tokenType: typeof firebaseToken,
        tokenPresent: !!firebaseToken,
        tokenLength: firebaseToken?.length,
      })

      // For Safe wallets, try multiple retries with increasing delays
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
          // If this was the final retry, check for App Check issues
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
   * Validates state consistency at various checkpoints
   * Now uses MobX WalletConnectionStore directly
   */
  private validateStateConsistency(lockedState: AtomicConnectionState, checkpoint: string): boolean {
    const currentState = this.walletStore.captureState()

    const isValid = this.walletStore.validateState(lockedState, currentState, checkpoint)

    if (!isValid) {
      console.log(`❌ Aborting authentication due to connection state change at ${checkpoint}`)
      return false
    }

    return true
  }

  /**
   * Checks if authentication was aborted by timeout or user action
   * Now uses MobX AuthenticationStore
   */
  private checkAuthenticationAborted(): boolean {
    if (this.authStore.authLock.abortController?.signal.aborted) {
      console.log('❌ Authentication aborted by user or timeout')
      return true
    }
    return false
  }

  /**
   * Determines which authentication step failed based on error context
   */
  private getCurrentStepFromError(error: unknown): AuthStep | null {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('signature') && errorMessage.includes('request')) {
      return 'request-signature'
    }
    if (errorMessage.includes('signature') || errorMessage.includes('verify')) {
      return 'verify-signature'
    }
    if (errorMessage.includes('firebase') || errorMessage.includes('token')) {
      return 'firebase-auth'
    }
    if (errorMessage.includes('message') || errorMessage.includes('auth')) {
      return 'generate-message'
    }
    if (errorMessage.includes('lock') || errorMessage.includes('state')) {
      return 'acquire-lock'
    }

    // Default to the step that was likely in progress
    return 'request-signature'
  }

  /**
   * Shows session debug information for troubleshooting
   */
  private async logSessionDebugInfo(): Promise<void> {
    try {
      const sessionInfo = await SessionManager.getSessionDebugInfo()
      console.log('📊 Session debug info:', {
        totalKeys: sessionInfo.totalKeys,
        walletConnectKeysCount: sessionInfo.walletConnectKeys.length,
        walletConnectKeys: sessionInfo.walletConnectKeys.slice(0, 3),
      })
    } catch (error) {
      console.warn('⚠️ Failed to get session debug info:', error)
    }
  }

  /**
   * Main authentication orchestration method
   */
  async authenticate(context: AuthenticationContext): Promise<void> {
    console.log('🔐 Starting authentication flow for address:', context.walletAddress)

    // Check if user is already authenticated with Firebase
    if (FIREBASE_AUTH.currentUser) {
      console.log('✅ User already authenticated with Firebase, skipping re-authentication:', FIREBASE_AUTH.currentUser.uid)
      return
    }

    // Acquire authentication lock to prevent concurrent attempts
    if (!this.acquireAuthLock(context.walletAddress)) {
      console.log('❌ Skipping authentication: another attempt in progress')
      return
    }

    try {
      // Early connector logging
      console.log('Wallet connector:', {
        connectorId: context.connector?.id,
        connectorName: context.connector?.name,
      })

      // Capture atomic connection state snapshot at the start using store
      const lockedConnectionState = this.walletStore.captureState()
      console.log('🔐 Locked connection state:', lockedConnectionState)

      // Log session debug information
      await this.logSessionDebugInfo()

      // Step 2: Validate pre-conditions
      console.log('🔍 Step 2: Acquiring lock & validating state...')
      context.progressCallbacks?.onStepStart?.('acquire-lock')
      // Longer delay for Step 2 to ensure UI renders the step progress
      await new Promise((resolve) => setTimeout(resolve, 600))
      await this.validatePreConditions(context)
      context.progressCallbacks?.onStepComplete?.('acquire-lock')
      // Brief delay after completion to show completed state
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Step 3: Generate authentication message
      console.log('📝 Step 3: Generating authentication message...')
      context.progressCallbacks?.onStepStart?.('generate-message')
      // Brief delay to ensure UI renders the step progress
      await new Promise((resolve) => setTimeout(resolve, 200))
      const { message, nonce, timestamp } = await this.generateAuthenticationMessage(context.walletAddress)
      context.progressCallbacks?.onStepComplete?.('generate-message')
      // Brief delay after completion to show completed state
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Check if authentication was aborted before continuing
      if (this.checkAuthenticationAborted()) {
        return
      }

      // Step 4: Request wallet signature
      context.progressCallbacks?.onStepStart?.('request-signature')
      // Brief delay to ensure UI renders the step progress
      await new Promise((resolve) => setTimeout(resolve, 200))
      const signatureResult = await this.requestWalletSignature(context, message, nonce, timestamp)
      context.progressCallbacks?.onStepComplete?.('request-signature')

      // Check if authentication was aborted
      if (this.checkAuthenticationAborted()) {
        return
      }

      // Step 5: Verify signature and get Firebase token
      context.progressCallbacks?.onStepStart?.('verify-signature')
      // Brief delay to ensure UI renders the step progress
      await new Promise((resolve) => setTimeout(resolve, 200))
      const firebaseToken = await this.verifySignatureAndGetToken(context, signatureResult.signature, signatureResult.signatureType)
      context.progressCallbacks?.onStepComplete?.('verify-signature')

      // Check if authentication was aborted
      if (this.checkAuthenticationAborted()) {
        return
      }

      // Step 6: Sign in with Firebase
      context.progressCallbacks?.onStepStart?.('firebase-auth')
      // Brief delay to ensure UI renders the step progress
      await new Promise((resolve) => setTimeout(resolve, 200))
      await this.signInWithFirebase(firebaseToken, signatureResult.signatureType)

      // Final validation before declaring success
      if (!this.validateStateConsistency(lockedConnectionState, 'authentication completion')) {
        // Sign out from Firebase since connection state is inconsistent
        await AuthErrorRecoveryService.handleFirebaseCleanup('connection state change')
        return
      }

      // Final check if authentication was aborted
      if (this.checkAuthenticationAborted()) {
        await AuthErrorRecoveryService.handleFirebaseCleanup('authentication abort')
        return
      }

      // Success!
      console.log('User successfully signed in with Firebase!')
      context.progressCallbacks?.onStepComplete?.('firebase-auth')
      authToasts.success()
      router.replace('/dashboard')
    } catch (error) {
      // Determine which step failed and notify progress callbacks
      const currentStep = this.getCurrentStepFromError(error)
      if (currentStep) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        context.progressCallbacks?.onStepFail?.(currentStep, errorMessage)
      }

      // Handle all authentication errors through the recovery service
      const { appError, recoveryResult } = await AuthErrorRecoveryService.handleAuthenticationError(error)

      // Show error feedback with appropriate timing
      AuthErrorRecoveryService.showErrorFeedback(appError, recoveryResult)

      // Re-throw error for the calling code to handle if needed
      throw appError
    } finally {
      // Always release authentication lock
      this.releaseAuthLock()
    }
  }

  /**
   * Gets current authentication status
   * Now uses MobX AuthenticationStore
   */
  getAuthenticationStatus() {
    return {
      isAuthenticating: this.authStore.isAuthenticating,
      authWalletAddress: this.authStore.authWalletAddress,
    }
  }

  /**
   * Releases authentication lock (for cleanup on disconnection)
   * Now delegates to MobX AuthenticationStore
   */
  cleanup() {
    this.authStore.reset()
  }
}
