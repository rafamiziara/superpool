import { useMemo } from 'react'
import { useAuthenticationStore } from '../stores'
import { useAuthenticationStateReadonly } from './useAuthenticationStateReadonly'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Bridge version of useAuthenticationStateReadonly that integrates MobX stores
 *
 * This provides the same interface as the original readonly hook while incorporating
 * MobX reactive state management. Perfect for migration testing since it's read-only.
 *
 * Migration Strategy:
 * - Drop-in replacement for useAuthenticationStateReadonly
 * - Combines MobX store state with Firebase auth (like original)
 * - Maintains exact same return interface
 * - Zero breaking changes for components
 */
export const useAuthenticationStateReadonlyBridge = () => {
  const authStore = useAuthenticationStore()
  const firebaseAuth = useFirebaseAuth()
  const originalAuth = useAuthenticationStateReadonly() // Keep original for comparison

  return useMemo(
    () => ({
      // Authentication state from MobX store (reactive)
      authError: authStore.authError,
      isAuthenticating: authStore.isAuthenticating || firebaseAuth.isLoading,

      // Use Firebase wallet address if available (persistent), otherwise fall back to MobX store
      authWalletAddress: firebaseAuth.walletAddress || authStore.authWalletAddress,

      // Expose Firebase auth state for navigation logic (unchanged)
      isFirebaseAuthenticated: firebaseAuth.isAuthenticated,
      isFirebaseLoading: firebaseAuth.isLoading,

      // Debug info during migration (compare original vs MobX)
      _debug: {
        originalValues: {
          authError: originalAuth.authError,
          isAuthenticating: originalAuth.isAuthenticating,
          authWalletAddress: originalAuth.authWalletAddress,
        },
        mobxValues: {
          authError: authStore.authError,
          isAuthenticating: authStore.isAuthenticating,
          authWalletAddress: authStore.authWalletAddress,
        },
        firebaseValues: {
          isAuthenticated: firebaseAuth.isAuthenticated,
          isLoading: firebaseAuth.isLoading,
          walletAddress: firebaseAuth.walletAddress,
        },
      },
    }),
    [
      authStore.authError,
      authStore.isAuthenticating,
      authStore.authWalletAddress,
      firebaseAuth.isLoading,
      firebaseAuth.walletAddress,
      firebaseAuth.isAuthenticated,
      originalAuth, // Include for debugging comparison
    ]
  )
}

/**
 * Type definition matching the original readonly hook
 */
export type AuthenticationStateReadonlyBridge = ReturnType<typeof useAuthenticationStateReadonlyBridge>
