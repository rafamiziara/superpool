import { useEffect } from 'react'
import { useAuthenticationStore } from '../stores'
import { AppError } from '../utils/errorHandling'
import { useAuthenticationState } from './useAuthenticationState'

/**
 * Bridge hook that synchronizes legacy useAuthenticationState with MobX AuthenticationStore
 *
 * This enables gradual migration by:
 * 1. Keeping the original hook running for backward compatibility
 * 2. Syncing state changes bidirectionally during transition period
 * 3. Returning MobX store interface for future-ready components
 * 4. Maintaining all existing functionality without breaking changes
 *
 * Migration Strategy:
 * - Components can switch to this bridge hook with minimal changes
 * - Original hook continues to work alongside MobX store
 * - Automatic state synchronization prevents conflicts
 * - Eventually, original hook can be removed when all components migrated
 */
export const useAuthenticationBridge = () => {
  const authStore = useAuthenticationStore()
  const originalAuth = useAuthenticationState()

  // Synchronize state from original hook to MobX store
  useEffect(() => {
    // Sync auth error
    if (originalAuth.authError !== authStore.authError) {
      authStore.setAuthError(originalAuth.authError)
    }
  }, [originalAuth.authError, authStore])

  useEffect(() => {
    // Sync authentication lock state
    const originalLock = originalAuth.getAuthLock().current

    // Only update if there's a meaningful difference
    if (originalLock.isLocked !== authStore.isAuthenticating || originalLock.walletAddress !== authStore.authWalletAddress) {
      if (originalLock.isLocked) {
        // If original is locked but store isn't, acquire lock in store
        if (!authStore.isAuthenticating && originalLock.walletAddress) {
          authStore.acquireAuthLock(originalLock.walletAddress)
        }
      } else {
        // If original is not locked but store is, release lock in store
        if (authStore.isAuthenticating) {
          authStore.releaseAuthLock()
        }
      }
    }
  }, [originalAuth.isAuthenticating, originalAuth.authWalletAddress, authStore])

  // Create bridge actions that work with both systems during migration
  const bridgeActions = {
    setAuthError: (error: AppError | null) => {
      // Update both systems to maintain synchronization
      originalAuth.setAuthError(error)
      authStore.setAuthError(error)
    },

    acquireAuthLock: (walletAddress: string): boolean => {
      // Try to acquire lock in original system first
      const originalLock = originalAuth.getAuthLock()
      if (originalLock.current.isLocked) {
        return false // Already locked
      }

      // Acquire lock in both systems
      originalLock.current = {
        isLocked: true,
        startTime: Date.now(),
        walletAddress,
        abortController: new AbortController(),
      }

      return authStore.acquireAuthLock(walletAddress)
    },

    releaseAuthLock: () => {
      // Release lock in both systems
      originalAuth.releaseAuthLock()
      authStore.releaseAuthLock()
    },

    reset: () => {
      // Reset both systems
      originalAuth.setAuthError(null)
      originalAuth.releaseAuthLock()
      authStore.reset()
    },
  }

  // Return MobX store interface (reactive) with bridge actions
  return {
    // MobX reactive state (automatically triggers re-renders)
    authError: authStore.authError,
    isAuthenticating: authStore.isAuthenticating,
    authWalletAddress: authStore.authWalletAddress,

    // Bridge actions that work with both systems
    setAuthError: bridgeActions.setAuthError,
    acquireAuthLock: bridgeActions.acquireAuthLock,
    releaseAuthLock: bridgeActions.releaseAuthLock,
    reset: bridgeActions.reset,

    // Legacy compatibility - provide original getAuthLock for complex components
    getAuthLock: originalAuth.getAuthLock,

    // Additional MobX-specific utilities
    isAuthenticatingForWallet: authStore.isAuthenticatingForWallet,

    // Debug info during migration
    _debug: {
      originalState: {
        authError: originalAuth.authError,
        isAuthenticating: originalAuth.isAuthenticating,
        authWalletAddress: originalAuth.authWalletAddress,
      },
      storeState: {
        authError: authStore.authError,
        isAuthenticating: authStore.isAuthenticating,
        authWalletAddress: authStore.authWalletAddress,
      },
    },
  }
}

/**
 * Type definition for the bridge hook return value
 * This ensures type compatibility with existing components
 */
export type AuthenticationBridge = ReturnType<typeof useAuthenticationBridge>
