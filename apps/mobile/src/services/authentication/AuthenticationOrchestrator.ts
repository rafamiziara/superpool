import { AuthProgressCallbacks, AuthStep, AuthenticationContext } from '@superpool/types'
import { router } from 'expo-router'
import { FIREBASE_AUTH } from '../../firebase.config'
import { AuthenticationStore } from '../../stores/AuthenticationStore'
import { WalletStore } from '../../stores/WalletStore'
import { SessionManager, authToasts } from '../../utils'
import { AuthErrorRecoveryService } from '../errorRecovery'
import { AuthenticationStepExecutor, AuthenticationValidator, FirebaseAuthenticator, MessageGenerator, SignatureHandler } from './steps'

export interface AuthenticationLock {
  isLocked: boolean
  startTime: number
  walletAddress: string | null
  abortController: AbortController | null
}

export class AuthenticationOrchestrator {
  private stepExecutor!: AuthenticationStepExecutor // Initialized per authentication attempt
  private messageGenerator: MessageGenerator
  private signatureHandler: SignatureHandler
  private firebaseAuthenticator: FirebaseAuthenticator
  private validator: AuthenticationValidator

  constructor(private authStore: AuthenticationStore, private walletStore: WalletStore) {
    // Initialize AuthErrorRecoveryService with MobX stores
    AuthErrorRecoveryService.initialize(authStore, walletStore)

    // Initialize step modules
    this.messageGenerator = new MessageGenerator()
    this.signatureHandler = new SignatureHandler()
    this.firebaseAuthenticator = new FirebaseAuthenticator()
    this.validator = new AuthenticationValidator(authStore, walletStore)
  }

  /**
   * Initialize step executor with progress callbacks (done per authentication attempt)
   */
  private initializeStepExecutor(progressCallbacks?: AuthProgressCallbacks): void {
    this.stepExecutor = new AuthenticationStepExecutor(progressCallbacks)
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
   * Main authentication orchestration method - now simplified with step modules
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

    // Initialize step executor with progress callbacks
    this.initializeStepExecutor(context.progressCallbacks)

    try {
      // Log initial state
      console.log('Wallet connector:', {
        connectorId: context.connector?.id,
        connectorName: context.connector?.name,
      })

      // Capture atomic connection state snapshot and log session debug info
      const lockedConnectionState = this.validator.captureConnectionState()
      console.log('🔐 Locked connection state:', lockedConnectionState)
      await this.logSessionDebugInfo()

      // Step 1: Validate pre-conditions
      await this.stepExecutor.executeLockStep(async () => {
        await this.validator.validatePreConditions({ walletAddress: context.walletAddress })
      })

      // Step 2: Generate authentication message
      const authMessage = await this.stepExecutor.executeStep('generate-message', async () => {
        return await this.messageGenerator.generateAuthenticationMessage(context.walletAddress)
      })

      // Check for abort before continuing
      if (this.validator.checkAuthenticationAborted()) return

      // Step 3: Request wallet signature
      const signatureResult = await this.stepExecutor.executeStep('request-signature', async () => {
        return await this.signatureHandler.requestWalletSignature(
          {
            walletAddress: context.walletAddress,
            chainId: context.chainId,
            signatureFunctions: context.signatureFunctions,
            connector: context.connector,
          },
          authMessage
        )
      })

      // Check for abort before continuing
      if (this.validator.checkAuthenticationAborted()) return

      // Step 4: Verify signature and get Firebase token
      const firebaseToken = await this.stepExecutor.executeStep('verify-signature', async () => {
        return await this.firebaseAuthenticator.verifySignatureAndGetToken(
          {
            walletAddress: context.walletAddress,
            chainId: context.chainId,
          },
          signatureResult
        )
      })

      // Check for abort before continuing
      if (this.validator.checkAuthenticationAborted()) return

      // Step 5: Sign in with Firebase
      await this.stepExecutor.executeStep('firebase-auth', async () => {
        await this.firebaseAuthenticator.signInWithFirebase(firebaseToken, signatureResult.signatureType)
      })

      // Final validations
      if (!this.validator.validateStateConsistency(lockedConnectionState, 'authentication completion')) {
        await AuthErrorRecoveryService.handleFirebaseCleanup('connection state change')
        return
      }

      if (this.validator.checkAuthenticationAborted()) {
        await AuthErrorRecoveryService.handleFirebaseCleanup('authentication abort')
        return
      }

      // Success!
      console.log('User successfully signed in with Firebase!')
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
