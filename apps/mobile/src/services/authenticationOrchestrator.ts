import { router } from 'expo-router'
import { signInWithCustomToken } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import type { Connector } from 'wagmi'
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS } from '../firebase.config'
import { getGlobalLogoutState } from '../hooks/useLogoutState'
import { AuthStep } from '../hooks/useAuthProgress'
import { AtomicConnectionState, ConnectionStateManager } from '../utils/connectionStateManager'
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
  private connectionStateManager = new ConnectionStateManager()

  constructor(private authLock: React.MutableRefObject<AuthenticationLock>) {}

  /**
   * Acquires authentication lock to prevent concurrent attempts
   */
  private acquireAuthLock(walletAddress: string): boolean {
    const current = this.authLock.current
    
    if (current.isLocked) {
      const timeSinceLock = Date.now() - current.startTime
      
      // If authentication has been running for more than 2 minutes, force release
      if (timeSinceLock > 120000) {
        console.warn(`🕐 Authentication lock expired (${timeSinceLock}ms), force releasing...`)
        this.releaseAuthLock()
      } else {
        console.log(`⚠️ Authentication already in progress for ${current.walletAddress} (${timeSinceLock}ms ago)`)
        
        // If it's the same wallet address, this is likely a duplicate request
        if (current.walletAddress === walletAddress) {
          console.log('🚫 Duplicate authentication attempt for same wallet, ignoring')
          return false
        }
        
        // Different wallet - abort current and proceed with new one
        console.log('🔄 Different wallet detected, aborting current authentication')
        this.releaseAuthLock()
      }
    }

    this.authLock.current = {
      isLocked: true,
      startTime: Date.now(),
      walletAddress,
      abortController: new AbortController(),
    }

    console.log('🔒 Authentication lock acquired for:', walletAddress)
    return true
  }

  /**
   * Releases authentication lock
   */
  private releaseAuthLock(): void {
    if (this.authLock.current.abortController) {
      this.authLock.current.abortController.abort('Authentication completed')
    }

    this.authLock.current = {
      isLocked: false,
      startTime: 0,
      walletAddress: null,
      abortController: null,
    }

    console.log('🔓 Authentication lock released')
  }

  /**
   * Validates that authentication should proceed
   */
  private async validatePreConditions(context: AuthenticationContext, lockedState: AtomicConnectionState): Promise<boolean> {
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

    // Validate initial connection state
    const validation = this.connectionStateManager.validateInitialState(lockedState, context.walletAddress)

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

    console.log('📋 Firebase token received:', typeof firebaseToken, firebaseToken ? 'present' : 'missing')
    console.log('🔍 Token comparison:', {
      length: firebaseToken?.length,
      prefix: firebaseToken?.substring(0, 50),
      signatureType,
    })

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
      console.error('📋 Token details:', {
        tokenType: typeof firebaseToken,
        tokenLength: firebaseToken?.length,
        tokenStart: firebaseToken?.substring(0, 20) + '...',
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
   */
  private validateStateConsistency(lockedState: AtomicConnectionState, checkpoint: string): boolean {
    const currentState = this.connectionStateManager.captureState(
      lockedState.isConnected, // We pass the locked values since we don't have direct access to live state
      lockedState.address,
      lockedState.chainId
    )

    const isValid = this.connectionStateManager.validateState(lockedState, currentState, checkpoint)

    if (!isValid) {
      console.log(`❌ Aborting authentication due to connection state change at ${checkpoint}`)
      return false
    }

    return true
  }

  /**
   * Checks if authentication was aborted by timeout or user action
   */
  private checkAuthenticationAborted(): boolean {
    if (this.authLock.current.abortController?.signal.aborted) {
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

      // Capture atomic connection state snapshot at the start
      const lockedConnectionState = this.connectionStateManager.captureState(
        true, // We assume connected since this is called from a connected context
        context.walletAddress,
        context.chainId
      )
      console.log('🔐 Locked connection state:', lockedConnectionState)

      // Log session debug information
      await this.logSessionDebugInfo()

      // Step 2: Validate pre-conditions  
      console.log('🔍 Step 2: Acquiring lock & validating state...')
      context.progressCallbacks?.onStepStart?.('acquire-lock')
      await this.validatePreConditions(context, lockedConnectionState)
      context.progressCallbacks?.onStepComplete?.('acquire-lock')

      // Step 3: Generate authentication message
      console.log('📝 Step 3: Generating authentication message...')
      context.progressCallbacks?.onStepStart?.('generate-message')
      const { message, nonce, timestamp } = await this.generateAuthenticationMessage(context.walletAddress)
      context.progressCallbacks?.onStepComplete?.('generate-message')

      // Check if authentication was aborted before continuing
      if (this.checkAuthenticationAborted()) {
        return
      }

      // Step 4: Request wallet signature
      context.progressCallbacks?.onStepStart?.('request-signature')
      const signatureResult = await this.requestWalletSignature(context, message, nonce, timestamp)
      context.progressCallbacks?.onStepComplete?.('request-signature')

      // Check if authentication was aborted
      if (this.checkAuthenticationAborted()) {
        return
      }

      // Step 5: Verify signature and get Firebase token
      context.progressCallbacks?.onStepStart?.('verify-signature')
      const firebaseToken = await this.verifySignatureAndGetToken(context, signatureResult.signature, signatureResult.signatureType)
      context.progressCallbacks?.onStepComplete?.('verify-signature')

      // Check if authentication was aborted
      if (this.checkAuthenticationAborted()) {
        return
      }

      // Step 6: Sign in with Firebase
      context.progressCallbacks?.onStepStart?.('firebase-auth')
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
      const { appError, recoveryResult } = await AuthErrorRecoveryService.handleAuthenticationError(
        error,
        true, // Assume connected since this method is called from a connected context
        context.disconnect
      )

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
   */
  getAuthenticationStatus() {
    return {
      isAuthenticating: this.authLock.current.isLocked,
      authWalletAddress: this.authLock.current.walletAddress,
    }
  }

  /**
   * Releases authentication lock (for cleanup on disconnection)
   */
  cleanup() {
    this.releaseAuthLock()
  }
}
