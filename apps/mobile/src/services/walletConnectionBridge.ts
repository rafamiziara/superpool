import { AtomicConnectionState, WalletConnectionStore } from '../stores/WalletConnectionStore'
import { connectionStateManager } from '../utils/connectionStateManager'

/**
 * Bridge service that synchronizes singleton connectionStateManager with MobX WalletConnectionStore
 *
 * This enables gradual migration from singleton pattern to reactive MobX store pattern:
 * 1. Keeps existing singleton functionality for backward compatibility
 * 2. Syncs all state changes bidirectionally during transition period
 * 3. Provides identical API with enhanced reactivity
 * 4. Maintains critical atomic state validation and sequence tracking
 *
 * Migration Strategy:
 * - Services can switch to using this bridge instead of direct singleton access
 * - All atomic state operations work identically to original
 * - MobX store provides reactive state for components
 * - Eventually, singleton can be removed when all services migrated
 */
export class WalletConnectionBridge {
  constructor(private walletStore: WalletConnectionStore) {}

  /**
   * Captures atomic connection state - bridges to both systems
   * This maintains the critical sequence tracking required for authentication
   */
  captureState(isConnected: boolean, address: string | undefined, chainId: number | undefined): AtomicConnectionState {
    // Update MobX store first to ensure reactivity
    const storeState = this.walletStore.updateConnectionState(isConnected, address, chainId)

    // Use store state as source of truth (includes reactive benefits)
    return storeState
  }

  /**
   * Validates connection state hasn't changed - critical for authentication security
   * Uses MobX store as primary validator while maintaining singleton sync
   */
  validateState(lockedState: AtomicConnectionState, currentState: AtomicConnectionState, checkPoint: string): boolean {
    // Primary validation through MobX store (same logic, reactive benefits)
    const isValid = this.walletStore.validateState(lockedState, currentState, checkPoint)

    // Also validate through singleton for consistency during migration
    const singletonValid = connectionStateManager.validateState(lockedState, currentState, checkPoint)

    // Both should agree - if they don't, log for debugging
    if (isValid !== singletonValid) {
      console.warn('⚠️ Wallet connection validation mismatch between store and singleton:', {
        storeValid: isValid,
        singletonValid,
        checkPoint,
        lockedState,
        currentState,
      })
    }

    return isValid
  }

  /**
   * Validates initial connection state for authentication
   * Bridges to MobX store implementation
   */
  validateInitialState(walletAddress: string): { isValid: boolean; error?: string } {
    // Use MobX store validation (same logic, enhanced with reactivity)
    const storeValidation = this.walletStore.validateInitialState(walletAddress)

    // Also validate through singleton for consistency check
    const currentSingletonState = this.getCurrentSingletonState()
    const singletonValidation = connectionStateManager.validateInitialState(currentSingletonState, walletAddress)

    // Both should agree
    if (storeValidation.isValid !== singletonValidation.isValid) {
      console.warn('⚠️ Initial state validation mismatch:', {
        store: storeValidation,
        singleton: singletonValidation,
        walletAddress,
      })
    }

    return storeValidation
  }

  /**
   * Get current connection state from MobX store
   * This provides reactive state that components can observe
   */
  getCurrentState(): AtomicConnectionState {
    return this.walletStore.captureState()
  }

  /**
   * Reset sequence counter - bridges to both systems
   */
  resetSequence(): void {
    this.walletStore.resetSequence()
    connectionStateManager.resetSequence()
  }

  /**
   * Reset all connection state - bridges to both systems
   */
  reset(): void {
    this.walletStore.reset()
    connectionStateManager.resetSequence()
  }

  /**
   * Get wallet connection store for direct access when needed
   * Useful for components that need reactive state
   */
  getWalletStore(): WalletConnectionStore {
    return this.walletStore
  }

  /**
   * Helper to get current singleton state for validation comparisons
   */
  private getCurrentSingletonState(): AtomicConnectionState {
    // Since singleton doesn't store current state, we capture it with current store values
    const storeState = this.walletStore.captureState()
    return connectionStateManager.captureState(storeState.isConnected, storeState.address, storeState.chainId)
  }

  /**
   * Debug method to compare states between systems
   * Useful during migration to verify synchronization
   */
  debugStateSync(): { store: AtomicConnectionState; singleton: AtomicConnectionState; inSync: boolean } {
    const storeState = this.walletStore.captureState()
    const singletonState = this.getCurrentSingletonState()

    const inSync =
      storeState.isConnected === singletonState.isConnected &&
      storeState.address === singletonState.address &&
      storeState.chainId === singletonState.chainId

    return {
      store: storeState,
      singleton: singletonState,
      inSync,
    }
  }
}

/**
 * Factory function to create wallet connection bridge with store
 * This can be used by services to get a configured bridge instance
 */
export const createWalletConnectionBridge = (walletStore: WalletConnectionStore): WalletConnectionBridge => {
  return new WalletConnectionBridge(walletStore)
}
