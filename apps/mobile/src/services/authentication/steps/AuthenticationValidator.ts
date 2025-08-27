import type { AuthenticationStore } from '../../../stores/AuthenticationStore'
import type { AtomicConnectionState, WalletStore } from '../../../stores/WalletStore'

export interface ValidationContext {
  walletAddress: string
}

/**
 * Handles authentication validation including pre-conditions and state consistency
 * Separates validation concerns from orchestration
 */
export class AuthenticationValidator {
  constructor(private authStore: AuthenticationStore, private walletStore: WalletStore) {}

  /**
   * Validates that authentication should proceed by checking pre-conditions
   */
  async validatePreConditions(context: ValidationContext): Promise<void> {
    console.log('🔍 Validating authentication pre-conditions...')

    // Check if we're in the middle of a logout process
    await this.checkLogoutState()

    // Validate initial connection state
    this.validateInitialConnectionState(context.walletAddress)

    console.log('✅ Pre-conditions validated successfully')
  }

  /**
   * Validates state consistency at authentication checkpoints
   */
  validateStateConsistency(lockedState: AtomicConnectionState, checkpoint: string): boolean {
    console.log(`🔍 Validating state consistency at checkpoint: ${checkpoint}`)

    const currentState = this.walletStore.captureState()
    const isValid = this.walletStore.validateState(lockedState, currentState, checkpoint)

    if (!isValid) {
      console.log(`❌ Aborting authentication due to connection state change at ${checkpoint}`)
      return false
    }

    console.log(`✅ State consistency validated at ${checkpoint}`)
    return true
  }

  /**
   * Checks if authentication was aborted by timeout or user action
   */
  checkAuthenticationAborted(): boolean {
    if (this.authStore.authLock.abortController?.signal.aborted) {
      console.log('❌ Authentication aborted by user or timeout')
      return true
    }
    return false
  }

  /**
   * Captures the current wallet connection state for validation
   */
  captureConnectionState(): AtomicConnectionState {
    return this.walletStore.captureState()
  }

  /**
   * Check if logout process is in progress
   */
  private async checkLogoutState(): Promise<void> {
    if (this.authStore.isLoggingOut) {
      console.log('⏸️ Skipping authentication: logout in progress')
      throw new Error('Authentication cancelled: logout in progress')
    }
  }

  /**
   * Validate initial wallet connection state
   */
  private validateInitialConnectionState(walletAddress: string): void {
    const validation = this.walletStore.validateInitialState(walletAddress)

    if (!validation.isValid) {
      console.warn('❌ Invalid initial connection state:', validation.error)
      throw new Error(validation.error || 'Invalid connection state')
    }
  }
}
