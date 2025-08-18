import { router } from 'expo-router'
import { signInWithCustomToken } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import type { Connector } from 'wagmi'
import { FIREBASE_AUTH, FIREBASE_FUNCTIONS } from '../firebase.config'
import { getGlobalLogoutState } from '../hooks/useLogoutState'
import { AtomicConnectionState, ConnectionStateManager } from '../utils/connectionStateManager'
import { SessionManager } from '../utils/sessionManager'
import { authToasts } from '../utils/toast'
import { AuthErrorRecoveryService } from './authErrorRecoveryService'
import { SignatureFunctions, SignatureService } from './signatureService'

const verifySignatureAndLogin = httpsCallable(FIREBASE_FUNCTIONS, 'verifySignatureAndLogin')
const generateAuthMessage = httpsCallable(FIREBASE_FUNCTIONS, 'generateAuthMessage')

export interface AuthenticationContext {
  walletAddress: string
  connector?: Connector
  chainId?: number
  signatureFunctions: SignatureFunctions
  disconnect: () => void
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
    if (this.authLock.current.isLocked) {
      const timeSinceLock = Date.now() - this.authLock.current.startTime
      console.log(`⚠️ Authentication already in progress for ${this.authLock.current.walletAddress} (${timeSinceLock}ms ago)`)
      return false
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
    console.log('📝 Step 1: Generating authentication message...')
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
    console.log('✍️ Step 2: Requesting wallet signature...')
    authToasts.signingMessage()

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
    authToasts.verifying()
    console.log('🔍 Step 3: Verifying signature...')

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
    console.log('🔑 Step 4: Signing in with Firebase...')

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

      // Validate pre-conditions
      await this.validatePreConditions(context, lockedConnectionState)

      // Show connecting toast and wallet app guidance
      console.log('📢 Showing connection toast...')
      authToasts.connecting()

      setTimeout(() => {
        console.log('📱 Showing wallet app guidance...')
        authToasts.walletAppGuidance()
      }, 3000)

      // Step 1: Generate authentication message
      const { message, nonce, timestamp } = await this.generateAuthenticationMessage(context.walletAddress)

      // Small delay for session stabilization
      console.log('⏳ Waiting 1 second for session stabilization...')
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Validate state after message generation
      if (!this.validateStateConsistency(lockedConnectionState, 'after message generation delay')) {
        return
      }

      // Check if authentication was aborted
      if (this.checkAuthenticationAborted()) {
        return
      }

      // Step 2: Request wallet signature
      const signatureResult = await this.requestWalletSignature(context, message, nonce, timestamp)

      // Validate state after signature
      if (!this.validateStateConsistency(lockedConnectionState, 'after signature completion')) {
        return
      }

      // Check if authentication was aborted
      if (this.checkAuthenticationAborted()) {
        return
      }

      // Step 3: Verify signature and get Firebase token
      const firebaseToken = await this.verifySignatureAndGetToken(context, signatureResult.signature, signatureResult.signatureType)

      // Validate state before Firebase auth
      if (!this.validateStateConsistency(lockedConnectionState, 'before Firebase authentication')) {
        return
      }

      // Check if authentication was aborted
      if (this.checkAuthenticationAborted()) {
        return
      }

      // Step 4: Sign in with Firebase
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
      authToasts.success()
      router.replace('/dashboard')
    } catch (error) {
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
