import { AuthenticationStore } from './AuthenticationStore'
import { PoolManagementStore } from './PoolManagementStore'
import { WalletStore } from './WalletStore'

/**
 * Root store that contains all MobX stores
 * Implements the root store pattern for centralized state management
 */
export class RootStore {
  public authenticationStore: AuthenticationStore
  public walletStore: WalletStore
  public poolManagementStore: PoolManagementStore

  constructor() {
    this.authenticationStore = new AuthenticationStore()
    this.walletStore = new WalletStore()
    this.poolManagementStore = new PoolManagementStore()
  }

  // Global reset method for clearing all store state
  reset = (): void => {
    this.authenticationStore.reset()
    this.walletStore.reset()
    this.poolManagementStore.reset()
  }

  // Convenience method to set user context across relevant stores
  setUserContext = (address: string | null): void => {
    this.poolManagementStore.setUserAddress(address)

    // Sync wallet connection state if needed
    if (address && !this.walletStore.isConnected) {
      // Note: This would typically be handled by wallet connection hooks
      console.log('User address set but wallet not connected:', address)
    }
  }

  // Get current user address from any connected source
  get currentUserAddress(): string | null {
    return this.walletStore.address || null
  }

  // Global loading state check
  get isLoading(): boolean {
    return (
      this.authenticationStore.isAuthenticating ||
      this.walletStore.isConnecting ||
      Object.values(this.poolManagementStore.loading).some((loading) => loading)
    )
  }

  // Global error state check
  get hasErrors(): boolean {
    return !!(this.authenticationStore.authError || this.walletStore.connectionError || this.poolManagementStore.error)
  }

  // Get all current errors
  get allErrors(): string[] {
    const errors: string[] = []

    if (this.authenticationStore.authError) {
      errors.push(this.authenticationStore.authError.message)
    }

    if (this.walletStore.connectionError) {
      errors.push(this.walletStore.connectionError)
    }

    if (this.poolManagementStore.error) {
      errors.push(this.poolManagementStore.error)
    }

    return errors
  }
}
